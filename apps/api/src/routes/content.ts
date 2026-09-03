import type { FastifyInstance } from 'fastify';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import {
  businessProfiles,
  competitorPages,
  competitors,
  contentDrafts,
  db,
  keywordData,
  keywordPlaybooks,
  sites,
} from 'db';
import { mdToHtml } from 'shared';
import { wordpress } from 'connectors';
import { checkArticle, type ArticleSpec } from 'strategy';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { recordAudit } from '../lib/audit.js';
import { recordIntervention } from '../lib/interventions.js';
import { guardedCompleteJson } from '../lib/llm.js';
import { loadWpCreds } from '../lib/wpCreds.js';

async function ownedSite(userId: string, siteId: string) {
  const [row] = await db
    .select()
    .from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.userId, userId)));
  return row ?? null;
}

async function ownedDraft(userId: string, draftId: string) {
  const [row] = await db
    .select({ draft: contentDrafts, userId: sites.userId })
    .from(contentDrafts)
    .innerJoin(sites, eq(sites.id, contentDrafts.siteId))
    .where(eq(contentDrafts.id, draftId));
  return row && row.userId === userId ? row.draft : null;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 70);
}
function deriveMeta(md: string, keyword: string): string {
  const firstPara =
    md
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .find((p) => p && !p.startsWith('#') && !/^\s*[-*]/.test(p)) ?? '';
  let m = firstPara.replace(/\s+/g, ' ').replace(/[#*_`>]/g, '').trim();
  if (m.length < 80) m = `${cap(keyword)}. ${m}`.trim();
  if (m.length > 158) m = m.slice(0, 155).replace(/\s+\S*$/, '') + '…';
  return m;
}

interface Brief {
  title?: string;
  h2s?: string[];
  mustCover?: string[];
  faqs?: string[];
}

function buildPrompt(o: {
  domain: string;
  keyword: string;
  intent: string | null;
  profileSummary: string | null;
  services: string[];
  brief: Brief | null;
  targetWords: number;
  secondaryKeywords: string[];
  linkTo: string | null;
  anchor: string | null;
  competitorH2s: string[];
  missingTopics: string[];
}): string {
  const bul = (xs?: string[]) =>
    xs && xs.length ? xs.map((x) => `- ${x}`).join('\n') : '- (folosește-ți judecata pe subiect)';
  return [
    `Ești copywriter SEO. Scrie un articol de blog în română pentru ${o.domain}.`,
    '',
    `CUVÂNT CHEIE PRINCIPAL: ${o.keyword}`,
    o.secondaryKeywords.length ? `CUVINTE SECUNDARE (acoperă-le natural): ${o.secondaryKeywords.join(', ')}` : null,
    `INTENȚIA: ${o.intent ?? 'informativă'}`,
    o.profileSummary ? `DESPRE AFACERE: ${o.profileSummary}` : null,
    o.services.length ? `SERVICII: ${o.services.join(', ')}` : null,
    `LUNGIME ȚINTĂ: ~${o.targetWords} cuvinte.`,
    '',
    o.linkTo
      ? `LINK INTERN OBLIGATORIU: inserează natural în corpul articolului un link către ${o.linkTo} folosind un text de ancoră ca „${o.anchor ?? o.keyword}" (nu „aici" / „click aici").`
      : null,
    '',
    'STRUCTURĂ (H2, adaptează formularea):',
    bul(o.brief?.h2s),
    o.missingTopics.length ? '\nSUBIECTE PE CARE COMPETITORII LE ACOPERĂ ȘI TU NU (include-le):' : null,
    o.missingTopics.length ? bul(o.missingTopics) : null,
    o.competitorH2s.length ? '\nSECȚIUNI FOLOSITE DE COMPETITORI (pentru inspirație):' : null,
    o.competitorH2s.length ? bul(o.competitorH2s.slice(0, 12)) : null,
    o.brief?.faqs?.length ? '\nÎNTREBĂRI FRECVENTE de inclus:' : null,
    o.brief?.faqs?.length ? bul(o.brief.faqs) : null,
    '',
    'REGULI STRICTE:',
    '- Începe cu un H2 „Pe scurt" (2-3 propoziții care răspund direct la întrebare).',
    '- Include cuvântul cheie în H1, în primul paragraf și în cel puțin un H2 — natural, fără umplutură.',
    '- Adaugă o secțiune „## Întrebări frecvente" cu răspunsuri de 2-4 propoziții.',
    '- NU inventa statistici, procente, studii, prețuri sau citate. Fără cifre inventate.',
    '- NU promite poziții în Google sau creșteri de trafic.',
    '- Paragrafe scurte, voce activă, fără clișee de tip „În peisajul digital de azi…".',
    '- Livrează DOAR articolul în Markdown (`#`, `##`, liste), fără comentariu înainte/după.',
  ]
    .filter((l) => l !== null)
    .join('\n');
}

async function bestCompetitorFor(siteId: string, keyword: string) {
  const tok = keyword.split(/\s+/)[0]?.toLowerCase() ?? '';
  if (!tok) return null;
  const rows = await db
    .select({
      headings: competitorPages.headings,
      mainText: competitorPages.mainText,
      wordCount: competitorPages.wordCount,
      guess: competitorPages.targetKeywordGuess,
      url: competitorPages.url,
    })
    .from(competitorPages)
    .innerJoin(competitors, eq(competitors.id, competitorPages.competitorId))
    .where(eq(competitors.siteId, siteId));
  return (
    rows
      .filter((r) => (r.guess ?? '').toLowerCase().includes(tok) || r.url.toLowerCase().includes(tok))
      .sort((a, b) => b.wordCount - a.wordCount)[0] ?? null
  );
}

const REWRITE_GRADE_SYSTEM = [
  'Esti editor SEO. Primesti un articol de blog. Da o nota 0-100 pentru: limbaj natural, utilitate reala, la subiect, fara fluff, fara fapte inventate.',
  'Raspunde DOAR cu JSON: {"score": <0-100>, "issues": ["problema concreta", ...]}  (max 5 issues; [] daca e ok).',
].join('\n');

export async function contentRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  // GET /api/sites/:id/content — the blog plan + drafts + standalone ideas
  app.get<{ Params: { id: string } }>('/api/sites/:id/content', async (req, reply) => {
    const site = await ownedSite(req.userId!, req.params.id);
    if (!site) return reply.code(404).send({ error: 'not found' });
    const [profile] = await db
      .select({ autoPublishBlog: businessProfiles.autoPublishBlog })
      .from(businessProfiles)
      .where(eq(businessProfiles.siteId, site.id));

    const drafts = await db
      .select()
      .from(contentDrafts)
      .where(eq(contentDrafts.siteId, site.id))
      .orderBy(asc(contentDrafts.phase), desc(contentDrafts.updatedAt));

    const supporting = drafts.filter((d) => d.kind === 'supporting' && d.status !== 'discarded');
    const standalone = drafts.filter((d) => d.kind !== 'supporting' && d.status !== 'discarded');

    // Standalone idea suggestions: build_content opportunities without a page + a playbook,
    // not already a draft.
    const draftKwIds = new Set(drafts.filter((d) => d.keywordId).map((d) => d.keywordId as string));
    const oppRows = await db
      .select({ id: keywordData.id, keyword: keywordData.keyword, intent: keywordData.intent, opportunityScore: keywordData.opportunityScore })
      .from(keywordData)
      .where(and(eq(keywordData.siteId, site.id), inArray(keywordData.bucket, ['build_content', 'quick_win', 'long_game'])))
      .orderBy(desc(keywordData.opportunityScore))
      .limit(40);
    const withPlaybook = new Set(
      (
        await db
          .select({ keywordId: keywordPlaybooks.keywordId })
          .from(keywordPlaybooks)
          .where(inArray(keywordPlaybooks.keywordId, oppRows.map((o) => o.id)))
      ).map((r) => r.keywordId),
    );
    const ideas = oppRows.filter((o) => !draftKwIds.has(o.id) && withPlaybook.has(o.id)).slice(0, 15);

    const clicks = supporting.reduce(
      (a, d) => ({
        low: a.low + (d.estClicks?.low ?? 0),
        high: a.high + (d.estClicks?.high ?? 0),
      }),
      { low: 0, high: 0 },
    );

    return {
      autoPublishBlog: !!profile?.autoPublishBlog,
      plan: {
        total: supporting.length,
        cadence: {
          d30: supporting.filter((d) => d.phase === 30).length,
          d60: supporting.filter((d) => d.phase === 60).length,
          d90: supporting.filter((d) => d.phase === 90).length,
        },
        estClicksLow: Math.round(clicks.low),
        estClicksHigh: Math.round(clicks.high),
      },
      articles: supporting,
      standalone,
      ideas,
    };
  });

  // POST /api/sites/:id/content/:kwId/start — create a standalone draft from a keyword idea
  app.post<{ Params: { id: string; kwId: string } }>(
    '/api/sites/:id/content/:kwId/start',
    async (req, reply) => {
      const site = await ownedSite(req.userId!, req.params.id);
      if (!site) return reply.code(404).send({ error: 'not found' });
      const [kw] = await db
        .select()
        .from(keywordData)
        .where(and(eq(keywordData.id, req.params.kwId), eq(keywordData.siteId, site.id)));
      if (!kw) return reply.code(404).send({ error: 'keyword not found' });
      const [existing] = await db
        .select()
        .from(contentDrafts)
        .where(and(eq(contentDrafts.siteId, site.id), eq(contentDrafts.keywordId, kw.id)));
      if (existing) return { draft: existing };
      const [row] = await db
        .insert(contentDrafts)
        .values({
          siteId: site.id,
          keywordId: kw.id,
          kind: 'standalone',
          status: 'idea',
          title: `${cap(kw.keyword)}`.slice(0, 200),
          targetWords: 1100,
        })
        .returning();
      return { draft: row };
    },
  );

  // POST /api/content/:id/prompt — assemble the copy-paste prompt for this draft
  app.post<{ Params: { id: string } }>('/api/content/:id/prompt', async (req, reply) => {
    const draft = await ownedDraft(req.userId!, req.params.id);
    if (!draft) return reply.code(404).send({ error: 'not found' });

    const [profile] = await db
      .select()
      .from(businessProfiles)
      .where(eq(businessProfiles.siteId, draft.siteId));
    let brief: Brief | null = null;
    let intent: string | null = null;
    if (draft.keywordId) {
      const [kw] = await db.select().from(keywordData).where(eq(keywordData.id, draft.keywordId));
      intent = kw?.intent ?? null;
      const [pb] = await db
        .select()
        .from(keywordPlaybooks)
        .where(eq(keywordPlaybooks.keywordId, draft.keywordId));
      brief = (pb?.brief as Brief | null) ?? null;
    }
    const kwText = draft.title?.toLowerCase() ?? 'articol';
    const comp = await bestCompetitorFor(draft.siteId, kwText);

    const prompt = buildPrompt({
      domain: (await ownedSite(req.userId!, draft.siteId))?.domain ?? '',
      keyword: kwText,
      intent,
      profileSummary: profile?.summary ?? null,
      services: ((profile?.services as string[] | null) ?? []).slice(0, 4),
      brief,
      targetWords: draft.targetWords ?? 1100,
      secondaryKeywords: (draft.secondaryKeywords as string[] | null) ?? [],
      linkTo: draft.linkTo,
      anchor: draft.anchor,
      competitorH2s: (comp?.headings ?? []).map((h) => h.text),
      missingTopics: [],
    });

    const [row] = await db
      .update(contentDrafts)
      .set({
        promptText: prompt,
        status: draft.status === 'published' ? draft.status : 'prompt_ready',
        updatedAt: new Date(),
      })
      .where(eq(contentDrafts.id, draft.id))
      .returning();
    await recordAudit(req.userId!, 'content.prompt', draft.siteId, { title: draft.title });
    return { draft: row };
  });

  async function verify(draft: typeof contentDrafts.$inferSelect) {
    const kwText = (draft.title ?? '').toLowerCase();
    const comp = await bestCompetitorFor(draft.siteId, kwText);
    const spec: ArticleSpec = {
      keyword: kwText,
      secondaryKeywords: (draft.secondaryKeywords as string[] | null) ?? [],
      linkTo: draft.linkTo,
      anchor: draft.anchor,
      targetWords: draft.targetWords,
      competitorText: comp?.mainText ?? null,
    };
    const verdict = checkArticle(draft.articleMd ?? '', spec);

    // Optional LLM quality grade (budget-guarded; degrades to heuristics-only).
    const graded = await guardedCompleteJson<{ score?: number; issues?: string[] }>(
      REWRITE_GRADE_SYSTEM,
      (draft.articleMd ?? '').slice(0, 12_000),
      { maxTokens: 400 },
    );
    if (graded?.score != null) {
      const s = Math.max(0, Math.min(100, Math.round(graded.score)));
      verdict.checks.push({
        id: 'llm_quality',
        label: `Notă de calitate (AI): ${s}/100`,
        status: s >= 75 ? 'pass' : s >= 55 ? 'warn' : 'fail',
        detail: (graded.issues ?? []).slice(0, 5).join(' · '),
      });
      const fails = verdict.checks.filter((c) => c.status === 'fail').length;
      const warns = verdict.checks.filter((c) => c.status === 'warn').length;
      verdict.score = Math.round((verdict.score + s) / 2);
      verdict.pass = fails === 0 && warns <= 2;
    }
    return verdict;
  }

  async function goLive(
    userId: string,
    draft: typeof contentDrafts.$inferSelect,
    auto: boolean,
  ): Promise<{ ok: boolean; reason?: string; link?: string; editLink?: string; postId?: number }> {
    const creds = await loadWpCreds(draft.siteId);
    if (!creds) return { ok: false, reason: 'Site-ul nu e conectat la WordPress.' };
    const contentHtml = mdToHtml(draft.articleMd ?? '');
    const firstH1 = (draft.articleMd ?? '').match(/^#\s+(.+)$/m)?.[1]?.trim();
    const title = (draft.title || firstH1 || 'Articol nou').slice(0, 200);
    const kwText = (draft.title ?? '').toLowerCase();
    const res = await wordpress.publishPost(creds, {
      postId: draft.wpPostId ?? undefined,
      title,
      contentHtml,
      slug: slugify(firstH1 || draft.title || kwText),
      excerpt: deriveMeta(draft.articleMd ?? '', kwText),
    });
    if (!res.ok) return { ok: false, reason: res.reason };
    await recordAudit(userId, auto ? 'content.publish_auto' : 'content.publish_live', draft.siteId, {
      wpPostId: res.postId,
    });
    await recordIntervention({
      siteId: draft.siteId,
      kind: 'content',
      category: 'content',
      targetKeywordId: draft.keywordId,
      targetUrl: res.link ?? null,
      label: `Articol publicat live: ${title}`,
    });
    return { ok: true, link: res.link, editLink: res.editLink, postId: res.postId };
  }

  // PUT /api/content/:id — save the pasted article, verify, and auto-publish if enabled
  app.put<{ Params: { id: string } }>('/api/content/:id', async (req, reply) => {
    const draft = await ownedDraft(req.userId!, req.params.id);
    if (!draft) return reply.code(404).send({ error: 'not found' });
    const parsed = z
      .object({ articleMd: z.string().max(200_000), title: z.string().max(200).optional() })
      .safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const merged = { ...draft, articleMd: parsed.data.articleMd, title: parsed.data.title ?? draft.title };
    const verdict = parsed.data.articleMd.trim() ? await verify(merged) : null;

    const [profile] = await db
      .select({ autoPublishBlog: businessProfiles.autoPublishBlog })
      .from(businessProfiles)
      .where(eq(businessProfiles.siteId, draft.siteId));

    let published: Awaited<ReturnType<typeof goLive>> | null = null;
    let status: string = parsed.data.articleMd.trim() ? 'review' : draft.status;
    if (verdict?.pass && profile?.autoPublishBlog) {
      published = await goLive(req.userId!, merged, true);
      if (published.ok) status = 'published';
    }

    const [row] = await db
      .update(contentDrafts)
      .set({
        articleMd: parsed.data.articleMd,
        title: parsed.data.title ?? draft.title,
        verify: verdict,
        status: status as typeof draft.status,
        ...(published?.ok
          ? {
              wpPostId: published.postId ?? draft.wpPostId,
              wpEditLink: published.editLink ?? draft.wpEditLink,
              wpLink: published.link ?? draft.wpLink,
              autoPublished: true,
              publishedAt: new Date(),
            }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(contentDrafts.id, draft.id))
      .returning();
    return { draft: row, verdict, published: published?.ok ? { link: published.link } : null };
  });

  // POST /api/content/:id/verify — re-run the checks only
  app.post<{ Params: { id: string } }>('/api/content/:id/verify', async (req, reply) => {
    const draft = await ownedDraft(req.userId!, req.params.id);
    if (!draft) return reply.code(404).send({ error: 'not found' });
    if (!draft.articleMd?.trim()) return reply.code(409).send({ error: 'no article yet' });
    const verdict = await verify(draft);
    const [row] = await db
      .update(contentDrafts)
      .set({ verify: verdict, updatedAt: new Date() })
      .where(eq(contentDrafts.id, draft.id))
      .returning();
    return { draft: row, verdict };
  });

  // POST /api/content/:id/publish — publish LIVE (checks must pass, or force)
  app.post<{ Params: { id: string } }>('/api/content/:id/publish', async (req, reply) => {
    const draft = await ownedDraft(req.userId!, req.params.id);
    if (!draft) return reply.code(404).send({ error: 'not found' });
    if (!draft.articleMd?.trim()) return reply.code(409).send({ error: 'no article to publish' });
    const force = z.object({ force: z.boolean().optional() }).safeParse(req.body).success
      ? (req.body as { force?: boolean }).force === true
      : false;

    const verdict = draft.verify ?? (await verify(draft));
    if (!verdict.pass && !force) {
      return reply.code(409).send({
        error: 'Articolul nu trece toate verificările. Corectează-l sau publică forțat.',
        verdict,
      });
    }
    const published = await goLive(req.userId!, draft, false);
    if (!published.ok) return reply.code(502).send({ error: published.reason ?? 'WordPress a refuzat publicarea' });

    const [row] = await db
      .update(contentDrafts)
      .set({
        status: 'published',
        verify: verdict,
        wpPostId: published.postId ?? draft.wpPostId,
        wpEditLink: published.editLink ?? draft.wpEditLink,
        wpLink: published.link ?? draft.wpLink,
        publishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(contentDrafts.id, draft.id))
      .returning();
    return { draft: row, link: published.link, editLink: published.editLink };
  });

  // POST /api/content/:id/discard
  app.post<{ Params: { id: string } }>('/api/content/:id/discard', async (req, reply) => {
    const draft = await ownedDraft(req.userId!, req.params.id);
    if (!draft) return reply.code(404).send({ error: 'not found' });
    const [row] = await db
      .update(contentDrafts)
      .set({ status: 'discarded', updatedAt: new Date() })
      .where(eq(contentDrafts.id, draft.id))
      .returning();
    return { draft: row };
  });
}

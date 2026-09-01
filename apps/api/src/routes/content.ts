import type { FastifyInstance } from 'fastify';
import { and, desc, eq, inArray } from 'drizzle-orm';
import {
  businessProfiles,
  contentDrafts,
  db,
  keywordData,
  keywordPlaybooks,
  pages,
  sites,
} from 'db';
import { mdToHtml } from 'shared';
import { wordpress } from 'connectors';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { recordAudit } from '../lib/audit.js';
import { recordIntervention } from '../lib/interventions.js';
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

interface Brief {
  title?: string;
  slug?: string;
  h2s?: string[];
  mustCover?: string[];
  faqs?: string[];
  internalLinks?: string[];
}

function buildPrompt(opts: {
  domain: string;
  keyword: string;
  intent: string | null;
  profileSummary: string | null;
  services: string[];
  locations: string[];
  targetPageUrl: string | null;
  targetPageTitle: string | null;
  brief: Brief | null;
  targetWords: number;
}): string {
  const b = opts.brief ?? {};
  const bullets = (xs?: string[]) => (xs && xs.length ? xs.map((x) => `- ${x}`).join('\n') : '- (folosește-ți judecata pe baza subiectului)');
  const lines = [
    `Ești copywriter SEO. Scrie un articol în limba română pentru site-ul ${opts.domain}.`,
    '',
    `CUVÂNT CHEIE PRINCIPAL: ${opts.keyword}`,
    `INTENȚIA CĂUTĂRII: ${opts.intent ?? 'necunoscută (tratează-o informativ + comercial)'}`,
    opts.profileSummary ? `DESPRE AFACERE: ${opts.profileSummary}` : null,
    opts.services.length ? `SERVICII: ${opts.services.join(', ')}` : null,
    opts.locations.length ? `ZONE / ORAȘE: ${opts.locations.join(', ')}` : null,
    opts.targetPageUrl
      ? `PAGINĂ EXISTENTĂ pe acest subiect (îmbunătățește ideile, NU copia): ${opts.targetPageUrl}${
          opts.targetPageTitle ? ` — titlu actual: „${opts.targetPageTitle}”` : ''
        }`
      : null,
    '',
    `LUNGIME ȚINTĂ: ~${opts.targetWords} de cuvinte.`,
    b.title ? `TITLU SUGERAT: ${b.title}` : null,
    b.slug ? `SLUG SUGERAT: ${b.slug}` : null,
    '',
    'STRUCTURĂ — folosește aceste secțiuni H2 (în ordine, poți adapta formularea):',
    bullets(b.h2s),
    '',
    'TREBUIE SĂ ACOPERE (subiecte pe care le tratează competitorii):',
    bullets(b.mustCover),
    '',
    'ÎNTREBĂRI FRECVENTE de inclus (secțiune „Întrebări frecvente”, răspunsuri scurte de 2-4 propoziții):',
    bullets(b.faqs),
    '',
    b.internalLinks && b.internalLinks.length
      ? `LINKURI INTERNE de inserat natural în text: ${b.internalLinks.join(', ')}`
      : null,
    '',
    'REGULI STRICTE:',
    '- Ton clar, profesionist, fără jargon inutil. Adresează-te direct cititorului.',
    '- NU inventa statistici, procente, studii, prețuri sau citate. Dacă nu ai o cifră reală, scrie calitativ.',
    '- NU promite poziții în Google, „locul 1” sau creșteri de trafic garantate.',
    '- Include cuvântul cheie în primul paragraf, în cel puțin un H2 și în concluzie — natural, fără umplutură.',
    '- Începe articolul cu un scurt rezumat sub un H2 „Pe scurt” (2-3 propoziții).',
    '- Livrează în Markdown: `#` pentru titlu, `##` pentru secțiuni, liste unde ajută, o secțiune `## Întrebări frecvente`.',
    '- Fără fraze de tip „În acest articol vom discuta despre…”. Intră direct în subiect.',
    '',
    'Livrează DOAR articolul în Markdown, fără alt comentariu înainte sau după.',
  ];
  return lines.filter((l) => l !== null).join('\n');
}

export async function contentRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  // GET /api/sites/:id/content — drafts + ideas
  app.get<{ Params: { id: string } }>('/api/sites/:id/content', async (req, reply) => {
    const site = await ownedSite(req.userId!, req.params.id);
    if (!site) return reply.code(404).send({ error: 'not found' });

    const drafts = await db
      .select()
      .from(contentDrafts)
      .where(eq(contentDrafts.siteId, site.id))
      .orderBy(desc(contentDrafts.updatedAt));

    const draftKwIds = new Set(
      drafts.filter((d) => d.status !== 'discarded' && d.keywordId).map((d) => d.keywordId as string),
    );

    // Ideas: build_content opportunities without a target page, that have a playbook.
    const oppRows = await db
      .select({
        id: keywordData.id,
        keyword: keywordData.keyword,
        intent: keywordData.intent,
        opportunityScore: keywordData.opportunityScore,
        bucket: keywordData.bucket,
        hasTargetPage: keywordData.hasTargetPage,
      })
      .from(keywordData)
      .where(
        and(
          eq(keywordData.siteId, site.id),
          inArray(keywordData.bucket, ['build_content', 'quick_win', 'long_game']),
        ),
      )
      .orderBy(desc(keywordData.opportunityScore))
      .limit(60);

    const withPlaybook = new Set(
      (
        await db
          .select({ keywordId: keywordPlaybooks.keywordId })
          .from(keywordPlaybooks)
          .where(
            inArray(
              keywordPlaybooks.keywordId,
              oppRows.map((o) => o.id),
            ),
          )
      ).map((r) => r.keywordId),
    );

    const ideas = oppRows
      .filter((o) => !draftKwIds.has(o.id) && withPlaybook.has(o.id))
      .slice(0, 20);

    return { drafts, ideas };
  });

  // POST /api/sites/:id/content/:kwId/start — assemble the copy-paste prompt
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

      const [playbook] = await db
        .select()
        .from(keywordPlaybooks)
        .where(eq(keywordPlaybooks.keywordId, kw.id));
      const [profile] = await db
        .select()
        .from(businessProfiles)
        .where(eq(businessProfiles.siteId, site.id));

      let targetPageUrl: string | null = null;
      let targetPageTitle: string | null = null;
      if (kw.targetPageId) {
        const [p] = await db
          .select({ url: pages.url, title: pages.title })
          .from(pages)
          .where(eq(pages.id, kw.targetPageId));
        targetPageUrl = p?.url ?? null;
        targetPageTitle = p?.title ?? null;
      }

      const targetWords = kw.hasTargetPage ? 800 : 1100;
      const prompt = buildPrompt({
        domain: site.domain,
        keyword: kw.keyword,
        intent: kw.intent,
        profileSummary: profile?.summary ?? null,
        services: (profile?.services as string[] | null) ?? [],
        locations: (profile?.locations as string[] | null) ?? [],
        targetPageUrl,
        targetPageTitle,
        brief: (playbook?.brief as Brief | null) ?? null,
        targetWords,
      });
      const title =
        ((playbook?.brief as Brief | null)?.title ?? `${cap(kw.keyword)} — articol`).slice(0, 200);

      const [existing] = await db
        .select()
        .from(contentDrafts)
        .where(and(eq(contentDrafts.siteId, site.id), eq(contentDrafts.keywordId, kw.id)));

      let row;
      if (existing) {
        [row] = await db
          .update(contentDrafts)
          .set({
            promptText: prompt,
            title,
            status: existing.status === 'published' ? existing.status : 'prompt_ready',
            updatedAt: new Date(),
          })
          .where(eq(contentDrafts.id, existing.id))
          .returning();
      } else {
        [row] = await db
          .insert(contentDrafts)
          .values({
            siteId: site.id,
            keywordId: kw.id,
            status: 'prompt_ready',
            title,
            promptText: prompt,
          })
          .returning();
      }
      await recordAudit(req.userId!, 'content.prompt', site.id, { keyword: kw.keyword });
      return { draft: row };
    },
  );

  // PUT /api/content/:id — save the pasted article
  app.put<{ Params: { id: string } }>('/api/content/:id', async (req, reply) => {
    const draft = await ownedDraft(req.userId!, req.params.id);
    if (!draft) return reply.code(404).send({ error: 'not found' });
    const parsed = z
      .object({ articleMd: z.string().max(120_000), title: z.string().max(200).optional() })
      .safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const [row] = await db
      .update(contentDrafts)
      .set({
        articleMd: parsed.data.articleMd,
        title: parsed.data.title ?? draft.title,
        status: parsed.data.articleMd.trim() ? 'review' : draft.status,
        updatedAt: new Date(),
      })
      .where(eq(contentDrafts.id, draft.id))
      .returning();
    return { draft: row };
  });

  // POST /api/content/:id/publish — create/refresh a WordPress DRAFT post
  app.post<{ Params: { id: string } }>('/api/content/:id/publish', async (req, reply) => {
    const draft = await ownedDraft(req.userId!, req.params.id);
    if (!draft) return reply.code(404).send({ error: 'not found' });
    if (!draft.articleMd?.trim()) return reply.code(409).send({ error: 'no article to publish' });

    const creds = await loadWpCreds(draft.siteId);
    if (!creds) return reply.code(409).send({ error: 'site is not connected to WordPress' });

    const contentHtml = mdToHtml(draft.articleMd);
    const firstH1 = draft.articleMd.match(/^#\s+(.+)$/m)?.[1]?.trim();
    const title = (draft.title || firstH1 || 'Articol nou').slice(0, 200);

    const result = draft.wpPostId
      ? await wordpress.updateDraftPost(creds, draft.wpPostId, { title, contentHtml })
      : await wordpress.createDraftPost(creds, { title, contentHtml });

    if (!result.ok) {
      return reply.code(502).send({ error: result.reason ?? 'WordPress rejected the draft' });
    }

    const [row] = await db
      .update(contentDrafts)
      .set({
        status: 'published',
        wpPostId: result.postId ?? draft.wpPostId,
        wpEditLink: result.editLink ?? draft.wpEditLink,
        publishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(contentDrafts.id, draft.id))
      .returning();
    await recordAudit(req.userId!, 'content.publish_draft', draft.siteId, {
      wpPostId: result.postId,
    });
    await recordIntervention({
      siteId: draft.siteId,
      kind: 'content',
      category: 'content',
      targetKeywordId: draft.keywordId,
      label: `Articol publicat ca draft: ${draft.title ?? ''}`.trim(),
    });
    return { draft: row, editLink: result.editLink };
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

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

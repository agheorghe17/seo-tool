import type { FastifyInstance } from 'fastify';
import { and, avg, desc, eq, inArray, sql } from 'drizzle-orm';
import {
  businessProfiles,
  competitorPages,
  competitors,
  contentDrafts,
  crawls,
  db,
  issues,
  keywordData,
  keywordPlaybooks,
  pages,
  rankSnapshots,
  recommendations,
  roadmapItems,
  sites,
  siteSecrets,
  trafficEstimates,
} from 'db';
import { requireAuth } from '../middleware/auth.js';

export interface Signal {
  type: 'rank_up' | 'rank_down' | 'refresh_needed' | 'competitor_move' | 'answer_gap' | 'content_ready';
  tone: 'good' | 'bad' | 'neutral';
  text: string;
  href: string;
}

/** Live signals for the Autopilot screen — "what changed / what needs attention". */
async function buildSignals(
  siteId: string,
  crawlId: string | null,
): Promise<Signal[]> {
  const out: Signal[] = [];

  // Rank movements (from GSC/SERP snapshots).
  const moves = await db
    .select({
      keyword: keywordData.keyword,
      position: rankSnapshots.position,
      at: rankSnapshots.capturedAt,
    })
    .from(rankSnapshots)
    .innerJoin(keywordData, eq(keywordData.id, rankSnapshots.keywordId))
    .where(eq(rankSnapshots.siteId, siteId))
    .orderBy(desc(rankSnapshots.capturedAt))
    .limit(200);
  const byKw = new Map<string, number[]>();
  for (const m of moves) {
    if (m.position == null) continue;
    const arr = byKw.get(m.keyword) ?? [];
    arr.push(m.position);
    byKw.set(m.keyword, arr);
  }
  for (const [kw, snaps] of byKw) {
    if (snaps.length < 2) continue;
    const d = snaps[1]! - snaps[0]!; // positive = improved
    if (Math.abs(d) < 3) continue;
    out.push({
      type: d > 0 ? 'rank_up' : 'rank_down',
      tone: d > 0 ? 'good' : 'bad',
      text:
        d > 0
          ? `„${kw}" a urcat de la poziția ${Math.round(snaps[1]!)} la ${Math.round(snaps[0]!)}`
          : `„${kw}" a coborât de la poziția ${Math.round(snaps[1]!)} la ${Math.round(snaps[0]!)}`,
      href: 'keywords',
    });
    if (out.length >= 4) break;
  }

  // Answer-ready gap (from the geo.answer-ready rule on the latest crawl).
  if (crawlId) {
    const [ag] = await db
      .select({ n: sql<number>`count(distinct ${issues.pageId})::int` })
      .from(issues)
      .innerJoin(pages, eq(pages.id, issues.pageId))
      .where(and(eq(pages.crawlId, crawlId), eq(issues.ruleId, 'geo.answer-ready')));
    const n = Number(ag?.n ?? 0);
    if (n > 0) {
      out.push({
        type: 'answer_gap',
        tone: 'neutral',
        text: `${n} ${n === 1 ? 'pagină pune întrebări' : 'pagini pun întrebări'} fără schema FAQ — pierzi apariții în AI Overviews`,
        href: 'tasks',
      });
    }

    // Thin pages worth refreshing.
    const thin = await db
      .select({ url: pages.url, score: pages.scoreContent })
      .from(pages)
      .where(
        and(
          eq(pages.crawlId, crawlId),
          eq(pages.indexability, 'indexable'),
          sql`${pages.scoreContent} is not null and ${pages.scoreContent} < 55`,
        ),
      )
      .orderBy(pages.scoreContent)
      .limit(3);
    for (const t of thin) {
      let path = t.url;
      try {
        path = new URL(t.url).pathname || '/';
      } catch {
        /* keep */
      }
      out.push({
        type: 'refresh_needed',
        tone: 'neutral',
        text: `Pagina ${path} are conținut subțire — merită extinsă`,
        href: 'tasks',
      });
    }
  }

  // Competitor moves: new pages in the last 7 days on competitors that were
  // already being tracked more than 7 days ago (so the first crawl doesn't count).
  const [cm] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(competitorPages)
    .innerJoin(competitors, eq(competitors.id, competitorPages.competitorId))
    .where(
      and(
        eq(competitors.siteId, siteId),
        sql`${competitorPages.createdAt} > now() - interval '7 days'`,
        sql`${competitors.createdAt} < now() - interval '7 days'`,
      ),
    );
  if (cm && Number(cm.n) > 0) {
    out.push({
      type: 'competitor_move',
      tone: 'neutral',
      text: `Competitorii au ${Number(cm.n)} pagini noi în ultima săptămână`,
      href: 'competitors',
    });
  }

  // Content drafts waiting to be published.
  const [cr] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(contentDrafts)
    .where(and(eq(contentDrafts.siteId, siteId), eq(contentDrafts.status, 'review')));
  if (cr && Number(cr.n) > 0) {
    out.push({
      type: 'content_ready',
      tone: 'good',
      text: `${Number(cr.n)} ${Number(cr.n) === 1 ? 'articol scris așteaptă' : 'articole scrise așteaptă'} publicarea`,
      href: 'content',
    });
  }

  return out;
}

async function ownedSite(userId: string, siteId: string) {
  const [row] = await db
    .select()
    .from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.userId, userId)));
  return row ?? null;
}

function isoWeek(d: Date): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Count consecutive ISO weeks ending this week that contain at least one action. */
function streakWeeks(dates: Date[]): number {
  if (dates.length === 0) return 0;
  const weeks = new Set(dates.map(isoWeek));
  let streak = 0;
  const cursor = new Date();
  for (;;) {
    if (weeks.has(isoWeek(cursor))) {
      streak++;
      cursor.setUTCDate(cursor.getUTCDate() - 7);
    } else if (streak === 0 && isoWeek(cursor) === isoWeek(new Date())) {
      // allow the current week to be empty without breaking a prior streak
      cursor.setUTCDate(cursor.getUTCDate() - 7);
    } else {
      break;
    }
  }
  return streak;
}

const SEVERITY_IMPACT: Record<string, number> = { critical: 5, warning: 3, info: 2 };
const BUCKET_EFFORT: Record<string, number> = { quick_win: 2, build_content: 4, long_game: 5 };
const BUCKET_TITLE: Record<string, (kw: string) => string> = {
  quick_win: (kw) => `Optimizează pagina pentru „${kw}”`,
  build_content: (kw) => `Creează o pagină pentru „${kw}”`,
  long_game: (kw) => `Dezvoltă conținut în jurul „${kw}”`,
};

export interface HomeTask {
  id: string;
  kind: 'fix' | 'keyword' | 'roadmap';
  category: string;
  title: string;
  why: string | null;
  impact: number;
  effort: number;
  status: 'todo' | 'doing' | 'done';
  count?: number;
  autoFixable?: boolean;
  pageId?: string | null;
  keywordId?: string | null;
  position?: number | null;
  phase?: number;
  bucket?: string;
}

async function latestScoredCrawl(siteId: string) {
  const [row] = await db
    .select({ id: crawls.id, status: crawls.status, scanned: crawls.pagesScanned, at: crawls.completedAt, created: crawls.createdAt })
    .from(crawls)
    .where(and(eq(crawls.siteId, siteId), inArray(crawls.status, ['completed', 'partial'])))
    .orderBy(desc(crawls.createdAt))
    .limit(1);
  return row ?? null;
}

async function buildTasks(siteId: string): Promise<HomeTask[]> {
  const tasks: HomeTask[] = [];
  const crawl = await latestScoredCrawl(siteId);

  // 1) Audit fixes from the latest crawl, grouped by rule.
  if (crawl) {
    const recos = await db
      .select({
        id: recommendations.id,
        ruleId: issues.ruleId,
        category: issues.category,
        severity: issues.severity,
        fixTitle: recommendations.fixTitle,
        why: recommendations.fixDescriptionAiGenerated,
        autoFixable: recommendations.autoFixable,
        applied: recommendations.applied,
        priority: recommendations.priorityRank,
        pageId: issues.pageId,
      })
      .from(recommendations)
      .innerJoin(issues, eq(issues.id, recommendations.issueId))
      .innerJoin(pages, eq(pages.id, issues.pageId))
      .where(eq(pages.crawlId, crawl.id));

    const groups = new Map<string, typeof recos>();
    for (const r of recos) {
      const g = groups.get(r.ruleId) ?? [];
      g.push(r);
      groups.set(r.ruleId, g);
    }
    for (const [ruleId, rows] of groups) {
      const open = rows.filter((r) => !r.applied);
      const sample = open[0] ?? rows[0]!;
      const total = rows.length;
      tasks.push({
        id: `fix:${ruleId}`,
        kind: 'fix',
        category: sample.category,
        title:
          total > 1
            ? `${sample.fixTitle} (${total} pagini)`
            : sample.fixTitle,
        why: sample.why,
        impact: SEVERITY_IMPACT[sample.severity] ?? 3,
        effort: sample.autoFixable ? 1 : 3,
        status: open.length === 0 ? 'done' : 'todo',
        count: total,
        autoFixable: rows.some((r) => r.autoFixable),
        pageId: sample.pageId,
      });
    }
  }

  // 2) Roadmap items (guided plan) — these supersede raw keyword tasks for the same keyword.
  const roadmap = await db
    .select()
    .from(roadmapItems)
    .where(eq(roadmapItems.siteId, siteId))
    .orderBy(roadmapItems.phase, roadmapItems.sortOrder);
  const plannedKw = new Set(roadmap.map((r) => r.keywordId).filter(Boolean));
  for (const it of roadmap) {
    tasks.push({
      id: `rm:${it.id}`,
      kind: 'roadmap',
      category: 'roadmap',
      title: it.title,
      why: it.why,
      impact: it.impact,
      effort: it.effort,
      status: it.status === 'done' ? 'done' : it.status === 'doing' ? 'doing' : 'todo',
      keywordId: it.keywordId,
      phase: it.phase,
    });
  }

  // 3) Keyword opportunities not already covered by a roadmap item.
  const kws = (
    await db
      .select()
      .from(keywordData)
      .where(
        and(
          eq(keywordData.siteId, siteId),
          inArray(keywordData.bucket, ['quick_win', 'build_content', 'long_game']),
        ),
      )
      .orderBy(desc(keywordData.opportunityScore))
      .limit(60)
  )
    .filter((k) => !plannedKw.has(k.id))
    .slice(0, 20);

  if (kws.length > 0) {
    const playbooks = await db
      .select({ keywordId: keywordPlaybooks.keywordId, checklist: keywordPlaybooks.checklist })
      .from(keywordPlaybooks)
      .where(
        inArray(
          keywordPlaybooks.keywordId,
          kws.map((k) => k.id),
        ),
      );
    const doneByKw = new Map(
      playbooks.map((p) => {
        const list = (p.checklist as { done: boolean }[] | null) ?? [];
        return [p.keywordId, list.length > 0 && list.every((c) => c.done)];
      }),
    );
    for (const k of kws) {
      const titleFn = BUCKET_TITLE[k.bucket] ?? ((kw: string) => `Lucrează la „${kw}”`);
      const pos = k.currentPosition;
      tasks.push({
        id: `kw:${k.id}`,
        kind: 'keyword',
        category: 'keyword',
        title: titleFn(k.keyword),
        why:
          pos != null
            ? `Ești pe poziția ${Math.round(pos)} pentru acest termen — un pas te apropie de prima pagină.`
            : k.hasTargetPage
              ? 'Ai o pagină pe acest subiect, dar nu apare încă în Google pentru acest termen.'
              : 'Nu ai încă o pagină dedicată pentru acest termen căutat de clienți.',
        impact: Math.max(2, Math.min(5, Math.round((k.opportunityScore ?? 40) / 20))),
        effort: BUCKET_EFFORT[k.bucket] ?? 3,
        status: doneByKw.get(k.id) ? 'done' : 'todo',
        keywordId: k.id,
        position: pos,
        bucket: k.bucket,
      });
    }
  }

  // Prioritise: open first, then high impact / low effort.
  tasks.sort((a, b) => {
    if ((a.status === 'done') !== (b.status === 'done')) return a.status === 'done' ? 1 : -1;
    return b.impact - a.impact || a.effort - b.effort;
  });
  return tasks;
}

export async function homeRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  app.get<{ Params: { id: string } }>('/api/sites/:id/tasks', async (req, reply) => {
    const site = await ownedSite(req.userId!, req.params.id);
    if (!site) return reply.code(404).send({ error: 'not found' });
    const tasks = await buildTasks(site.id);
    return {
      tasks,
      counts: {
        open: tasks.filter((t) => t.status !== 'done').length,
        done: tasks.filter((t) => t.status === 'done').length,
      },
    };
  });

  app.get<{ Params: { id: string } }>('/api/sites/:id/home', async (req, reply) => {
    const site = await ownedSite(req.userId!, req.params.id);
    if (!site) return reply.code(404).send({ error: 'not found' });

    const [secrets, crawl] = await Promise.all([
      db
        .select({ kind: siteSecrets.kind })
        .from(siteSecrets)
        .where(eq(siteSecrets.siteId, site.id)),
      latestScoredCrawl(site.id),
    ]);

    // Score history over the last crawls.
    const historyRows = await db
      .select({
        crawlId: crawls.id,
        at: sql<string>`coalesce(${crawls.completedAt}, ${crawls.createdAt})`,
        total: avg(pages.scoreTotal),
        geo: avg(pages.scoreGeo),
      })
      .from(crawls)
      .leftJoin(pages, eq(pages.crawlId, crawls.id))
      .where(
        and(eq(crawls.siteId, site.id), inArray(crawls.status, ['completed', 'partial'])),
      )
      .groupBy(crawls.id, crawls.completedAt, crawls.createdAt)
      .orderBy(desc(sql`coalesce(${crawls.completedAt}, ${crawls.createdAt})`))
      .limit(8);
    const rnd = (v: unknown) => (v == null ? null : Math.round(Number(v)));
    const history = historyRows
      .map((r) => ({ crawlId: r.crawlId, at: r.at, total: rnd(r.total) }))
      .reverse();
    const geoHistory = historyRows
      .map((r) => ({ crawlId: r.crawlId, at: r.at, total: rnd(r.geo) }))
      .reverse();

    let categories: Record<string, number | null> = {
      technical: null,
      cwv: null,
      onpage: null,
      content: null,
      geo: null,
    };
    let scoreTotal: number | null = history.length ? history[history.length - 1]!.total : null;
    if (crawl) {
      const [agg] = await db
        .select({
          technical: avg(pages.scoreTechnical),
          cwv: avg(pages.scoreCwv),
          onpage: avg(pages.scoreOnpage),
          content: avg(pages.scoreContent),
          geo: avg(pages.scoreGeo),
          total: avg(pages.scoreTotal),
        })
        .from(pages)
        .where(eq(pages.crawlId, crawl.id));
      const n = (v: unknown) => (v == null ? null : Math.round(Number(v)));
      categories = {
        technical: n(agg?.technical),
        cwv: n(agg?.cwv),
        onpage: n(agg?.onpage),
        content: n(agg?.content),
        geo: n(agg?.geo),
      };
      if (agg?.total != null) scoreTotal = n(agg.total);
    }
    const prev = history.length >= 2 ? history[history.length - 2]!.total : null;
    const delta = scoreTotal != null && prev != null ? scoreTotal - prev : null;

    // AI visibility = the GEO category, promoted to a headline metric.
    const aiScore = categories.geo ?? (geoHistory.length ? geoHistory[geoHistory.length - 1]!.total : null);
    const aiPrev = geoHistory.length >= 2 ? geoHistory[geoHistory.length - 2]!.total : null;
    const aiDelta = aiScore != null && aiPrev != null ? aiScore - aiPrev : null;

    // Gamification.
    const [appliedFixes, doneRoadmap, profile, estimateRow] = await Promise.all([
      db
        .select({ at: recommendations.appliedAt })
        .from(recommendations)
        .innerJoin(issues, eq(issues.id, recommendations.issueId))
        .innerJoin(pages, eq(pages.id, issues.pageId))
        .innerJoin(crawls, eq(crawls.id, pages.crawlId))
        .where(and(eq(crawls.siteId, site.id), eq(recommendations.applied, true))),
      db
        .select({ at: roadmapItems.doneAt })
        .from(roadmapItems)
        .where(and(eq(roadmapItems.siteId, site.id), eq(roadmapItems.status, 'done'))),
      db.select().from(businessProfiles).where(eq(businessProfiles.siteId, site.id)),
      db
        .select()
        .from(trafficEstimates)
        .where(eq(trafficEstimates.siteId, site.id))
        .orderBy(desc(trafficEstimates.generatedAt))
        .limit(1),
    ]);
    const actionDates = [
      ...appliedFixes.map((r) => r.at).filter((d): d is Date => d != null),
      ...doneRoadmap.map((r) => r.at).filter((d): d is Date => d != null),
    ];
    const points = appliedFixes.length + doneRoadmap.length;

    const signals = await buildSignals(site.id, crawl?.id ?? null);
    const est = estimateRow[0];

    // Keyword KPIs.
    const [kagg] = await db
      .select({
        total: sql<number>`count(*)::int`,
        ranking: sql<number>`count(*) filter (where ${keywordData.currentPosition} is not null)::int`,
        top10: sql<number>`count(*) filter (where ${keywordData.currentPosition} <= 10)::int`,
        striking: sql<number>`count(*) filter (where ${keywordData.currentPosition} between 5 and 20)::int`,
      })
      .from(keywordData)
      .where(eq(keywordData.siteId, site.id));

    const tasks = await buildTasks(site.id);

    return {
      home: {
        site: {
          domain: site.domain,
          connectionType: site.connectionType,
          verified: site.verifiedAt != null,
          wpConnected: !!site.wpSiteUrl,
          gscConnected: site.gscConnected,
          hasSecrets: secrets.map((s) => s.kind),
        },
        score: { total: scoreTotal, delta, history, categories },
        aiVisibility: { score: aiScore, delta: aiDelta, history: geoHistory },
        crawl: crawl
          ? { id: crawl.id, status: crawl.status, pagesScanned: crawl.scanned, at: crawl.at ?? crawl.created }
          : null,
        gamification: {
          points,
          appliedFixes: appliedFixes.length,
          doneRoadmap: doneRoadmap.length,
          streakWeeks: streakWeeks(actionDates),
        },
        tasks: {
          open: tasks.filter((t) => t.status !== 'done').length,
          done: tasks.filter((t) => t.status === 'done').length,
          quickWins: tasks.filter((t) => t.status !== 'done' && t.bucket === 'quick_win').length,
          focus: tasks.find((t) => t.status !== 'done') ?? null,
          next: tasks.filter((t) => t.status !== 'done').slice(1, 5),
        },
        keywords: {
          total: Number(kagg?.total ?? 0),
          ranking: Number(kagg?.ranking ?? 0),
          top10: Number(kagg?.top10 ?? 0),
          striking: Number(kagg?.striking ?? 0),
        },
        traffic: est
          ? {
              low: est.estimateLow,
              mid: est.estimateMid,
              high: est.estimateHigh,
              horizonMonths: est.horizonMonths,
              confidence: est.confidenceLevel,
              baselineSource: est.baselineSource,
              assumptions: est.assumptions,
            }
          : null,
        signals: signals.slice(0, 6),
        strategyReady: !!profile[0]?.confirmedAt && Number(kagg?.total ?? 0) > 0,
      },
    };
  });

  app.get<{ Params: { id: string } }>('/api/sites/:id/signals', async (req, reply) => {
    const site = await ownedSite(req.userId!, req.params.id);
    if (!site) return reply.code(404).send({ error: 'not found' });
    const crawl = await latestScoredCrawl(site.id);
    return { signals: await buildSignals(site.id, crawl?.id ?? null) };
  });
}

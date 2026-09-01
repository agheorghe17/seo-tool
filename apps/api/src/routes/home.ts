import type { FastifyInstance } from 'fastify';
import { and, avg, desc, eq, inArray, sql } from 'drizzle-orm';
import {
  businessProfiles,
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
      })
      .from(crawls)
      .leftJoin(pages, eq(pages.crawlId, crawls.id))
      .where(
        and(eq(crawls.siteId, site.id), inArray(crawls.status, ['completed', 'partial'])),
      )
      .groupBy(crawls.id, crawls.completedAt, crawls.createdAt)
      .orderBy(desc(sql`coalesce(${crawls.completedAt}, ${crawls.createdAt})`))
      .limit(8);
    const history = historyRows
      .map((r) => ({ crawlId: r.crawlId, at: r.at, total: r.total == null ? null : Math.round(Number(r.total)) }))
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

    // "What changed" — recent rank movements from GSC/SERP snapshots.
    const moves = await db
      .select({
        keyword: keywordData.keyword,
        position: rankSnapshots.position,
        at: rankSnapshots.capturedAt,
      })
      .from(rankSnapshots)
      .innerJoin(keywordData, eq(keywordData.id, rankSnapshots.keywordId))
      .where(eq(rankSnapshots.siteId, site.id))
      .orderBy(desc(rankSnapshots.capturedAt))
      .limit(120);
    const byKw = new Map<string, { position: number; at: Date }[]>();
    for (const m of moves) {
      if (m.position == null) continue;
      const arr = byKw.get(m.keyword) ?? [];
      arr.push({ position: m.position, at: m.at });
      byKw.set(m.keyword, arr);
    }
    const changes: { text: string; tone: 'good' | 'bad' | 'neutral' }[] = [];
    for (const [kw, snaps] of byKw) {
      if (snaps.length < 2) continue;
      const [latest, before] = snaps; // desc order
      const d = before!.position - latest!.position;
      if (Math.abs(d) < 1.5) continue;
      changes.push({
        text:
          d > 0
            ? `Ai urcat de la poziția ${Math.round(before!.position)} la ${Math.round(latest!.position)} pentru „${kw}”`
            : `Ai coborât de la poziția ${Math.round(before!.position)} la ${Math.round(latest!.position)} pentru „${kw}”`,
        tone: d > 0 ? 'good' : 'bad',
      });
      if (changes.length >= 6) break;
    }

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
        changes,
        strategyReady: !!profile[0]?.confirmedAt && Number(kagg?.total ?? 0) > 0,
      },
    };
  });
}

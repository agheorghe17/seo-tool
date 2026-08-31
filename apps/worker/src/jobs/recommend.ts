import type PgBoss from 'pg-boss';
import { eq, inArray } from 'drizzle-orm';
import { crawls, db, issues, pages, recommendations } from 'db';
import { getCatalogEntry } from 'scoring';
import { explainIssue, type StructuredIssue } from 'llm';
import { prioritise } from 'shared';
import { logger } from '../logger.js';
import { getCacheStore } from '../redis.js';
import { runPool } from './pool.js';
import type { RecommendJob } from './types.js';

const CONCURRENCY = Number(process.env.RECOMMEND_CONCURRENCY ?? 3);

export async function handleRecommend(job: PgBoss.Job<RecommendJob>, boss: PgBoss): Promise<void> {
  const { crawlId } = job.data;

  const rows = await db
    .select({
      id: issues.id,
      pageId: issues.pageId,
      ruleId: issues.ruleId,
      ruleVersion: issues.ruleVersion,
      category: issues.category,
      severity: issues.severity,
      description: issues.description,
      detectedValue: issues.detectedValue,
      url: pages.url,
    })
    .from(issues)
    .innerJoin(pages, eq(pages.id, issues.pageId))
    .where(eq(pages.crawlId, crawlId));

  if (rows.length === 0) {
    logger.info({ crawlId }, 'recommend: no issues');
    await enqueueEstimate(boss, crawlId);
    return;
  }

  // Idempotent re-run.
  await db.delete(recommendations).where(
    inArray(
      recommendations.issueId,
      rows.map((r) => r.id),
    ),
  );

  // Epic 5.2 — priority ranking across the whole crawl.
  const ranked = prioritise(
    rows.map((r) => {
      const entry = getCatalogEntry(r.ruleId);
      return {
        issueId: r.id,
        impact: entry.impactHint,
        effort: entry.effortHint,
        critical: r.severity === 'critical',
      };
    }),
  );
  const rankByIssue = new Map(ranked.map((x) => [x.issueId, x.rank]));

  const cache = await getCacheStore();

  await runPool(rows, CONCURRENCY, async (row) => {
    const entry = getCatalogEntry(row.ruleId);
    const structured: StructuredIssue = {
      ruleId: row.ruleId,
      ruleVersion: row.ruleVersion,
      category: row.category,
      severity: row.severity,
      description: row.description,
      detectedValue: row.detectedValue,
      fixTitle: entry.fixTitle,
      catalogSteps: entry.steps,
      pageUrl: row.url,
    };

    const explanation = await explainIssue(structured, { cache });

    await db.insert(recommendations).values({
      issueId: row.id,
      fixTitle: entry.fixTitle,
      fixDescriptionAiGenerated: [explanation.text, ...explanation.steps.map((s) => `• ${s}`)].join(
        '\n',
      ),
      llmProvider: explanation.provider,
      impactScore: entry.impactHint,
      effortScore: entry.effortHint,
      priorityRank: rankByIssue.get(row.id) ?? 999,
      autoFixable: entry.autoFixable,
    });
  });

  logger.info({ crawlId, issues: rows.length }, 'recommend finished');
  await enqueueEstimate(boss, crawlId);
}

async function enqueueEstimate(boss: PgBoss, crawlId: string): Promise<void> {
  const [crawl] = await db
    .select({ siteId: crawls.siteId })
    .from(crawls)
    .where(eq(crawls.id, crawlId));
  if (crawl) await boss.send('estimate', { siteId: crawl.siteId, crawlId });
}

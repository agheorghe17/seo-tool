import type PgBoss from 'pg-boss';
import { eq, inArray } from 'drizzle-orm';
import { db, issues, pages, type PageRow } from 'db';
import { loadWeights, scorePage, scoreSite, type SiteFacts } from 'scoring';
import type { PageData } from 'shared';
import { logger } from '../logger.js';
import type { ScoreJob } from './types.js';

let weightsConfig: unknown;
try {
  weightsConfig = process.env.SCORING_WEIGHTS ? JSON.parse(process.env.SCORING_WEIGHTS) : undefined;
} catch {
  weightsConfig = undefined;
}

function rowToPageData(row: PageRow): PageData {
  return {
    url: row.url,
    statusCode: row.statusCode ?? 0,
    redirectChain: (row.redirectChain as string[] | null) ?? [],
    indexability: row.indexability ?? 'indexable',
    renderedWith: row.renderedWith,
    contentHash: row.contentHash ?? '',
    title: row.title,
    metaDescription: row.metaDescription,
    h1: row.h1,
    headings: (row.headings as PageData['headings'] | null) ?? [],
    wordCount: row.wordCount,
    canonicalUrl: row.canonicalUrl,
    schemaTypes: ((row.schema as unknown[] | null) ?? []).filter(
      (x): x is string => typeof x === 'string',
    ),
    images: (row.images as PageData['images'] | null) ?? [],
    internalLinksCount: row.internalLinksCount,
    externalLinksCount: row.externalLinksCount,
    lcpMs: row.lcpMs,
    inpMs: row.inpMs,
    clsScore: row.clsScore,
    mobileFriendly: row.mobileFriendly,
  };
}

export async function handleScore(job: PgBoss.Job<ScoreJob>, boss: PgBoss): Promise<void> {
  const { crawlId } = job.data;
  const weights = loadWeights(weightsConfig);

  const rows = await db.select().from(pages).where(eq(pages.crawlId, crawlId));
  if (rows.length === 0) {
    logger.warn({ crawlId }, 'score: no pages');
    await boss.send('recommend', { crawlId });
    return;
  }

  const siblings = rows.map(rowToPageData);
  const facts: SiteFacts = {
    https: siblings.every((p) => p.url.startsWith('https://')),
    hasSitemap: true, // TODO(epic-9): persist discovery source on the crawl row
    robotsTxtOk: true,
  };

  // Idempotent re-run: clear existing page-level issues for this crawl.
  await db.delete(issues).where(
    inArray(
      issues.pageId,
      rows.map((r) => r.id),
    ),
  );

  const totals: number[] = [];
  for (const row of rows) {
    const page = rowToPageData(row);
    const { scores, issues: pageIssues } = scorePage(
      page,
      { siblings, site: facts },
      { weights },
    );
    totals.push(scores.total);

    await db
      .update(pages)
      .set({
        scoreTechnical: scores.technical,
        scoreCwv: scores.cwv,
        scoreOnpage: scores.onpage,
        scoreContent: scores.content,
        scoreGeo: scores.geo,
        scoreTotal: scores.total,
      })
      .where(eq(pages.id, row.id));

    if (pageIssues.length > 0) {
      await db.insert(issues).values(
        pageIssues.map((i) => ({
          pageId: row.id,
          ruleId: i.ruleId,
          ruleVersion: i.ruleVersion,
          category: i.category,
          severity: i.severity,
          description: i.description,
          detectedValue: i.detectedValue,
          siteLevel: i.siteLevel,
        })),
      );
    }
  }

  const site = scoreSite(totals, facts);
  logger.info(
    { crawlId, pages: rows.length, siteScore: site.score, sitePenalty: site.penalty },
    'score finished',
  );

  await boss.send('recommend', { crawlId });
}

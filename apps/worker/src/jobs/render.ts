import type PgBoss from 'pg-boss';
import { and, eq, sql } from 'drizzle-orm';
import { crawls, db, issues, pages } from 'db';
import { RenderUnavailableError, renderPage } from 'crawler';
import { logger } from '../logger.js';
import type { RenderJob } from './types.js';

const USER_AGENT = process.env.CRAWL_USER_AGENT ?? 'SeoToolBot/0.1 (+https://example.com/bot)';
const RENDER_ENABLED = process.env.RENDER_ENABLED === '1';

/**
 * Epic 3.1 — render a JS-heavy page. If rendering is disabled or unavailable ($0 path),
 * keep the static extraction and file a "needs SSR / manual review" issue.
 */
export async function handleRender(job: PgBoss.Job<RenderJob>): Promise<void> {
  const { crawlId, pageId, url } = job.data;

  if (!RENDER_ENABLED) {
    await fileNeedsSsrIssue(pageId, 'Rendarea JS este dezactivată (RENDER_ENABLED != 1)');
    return;
  }

  try {
    const rendered = await renderPage(url, { userAgent: USER_AGENT, blockResources: true });
    await db
      .update(pages)
      .set({
        renderedWith: 'playwright',
        contentHash: rendered.contentHash,
        title: rendered.title,
        metaDescription: rendered.metaDescription,
        h1: rendered.h1,
        headings: rendered.headings,
        wordCount: rendered.wordCount,
        canonicalUrl: rendered.canonicalUrl,
        schema: rendered.schemaTypes,
        images: rendered.images,
        internalLinksCount: rendered.internalLinksCount,
        externalLinksCount: rendered.externalLinksCount,
        indexability: rendered.indexability,
      })
      .where(eq(pages.id, pageId));
    await db
      .update(crawls)
      .set({ pagesRendered: sql`${crawls.pagesRendered} + 1` })
      .where(eq(crawls.id, crawlId));
    logger.debug({ crawlId, pageId }, 'page rendered');
  } catch (err) {
    if (err instanceof RenderUnavailableError) {
      await fileNeedsSsrIssue(pageId, 'Playwright indisponibil pe acest mediu');
      return;
    }
    logger.warn({ err, url }, 'render failed, keeping static extraction');
    await fileNeedsSsrIssue(pageId, `Rendarea a eșuat: ${String(err)}`);
  }
}

async function fileNeedsSsrIssue(pageId: string, detail: string): Promise<void> {
  const ruleId = 'technical.needs-ssr';
  const existing = await db
    .select({ id: issues.id })
    .from(issues)
    .where(and(eq(issues.pageId, pageId), eq(issues.ruleId, ruleId)));
  if (existing.length > 0) return;
  await db.insert(issues).values({
    pageId,
    ruleId,
    ruleVersion: 1,
    category: 'technical',
    severity: 'warning',
    description:
      'Pagina pare să depindă de JavaScript pentru conținut (SPA). Fără SSR, motoarele pot vedea conținut incomplet.',
    detectedValue: detail,
    siteLevel: false,
  });
}

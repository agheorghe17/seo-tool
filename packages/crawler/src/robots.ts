import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

interface RobotAgent {
  isAllowed(url: string, ua?: string): boolean | undefined;
  getCrawlDelay(ua?: string): number | undefined;
  getSitemaps(): string[];
}

const robotsParser = require('robots-parser') as (url: string, contents: string) => RobotAgent;

/** Epic 2.1.3 — robots.txt: allow/disallow + crawl-delay, for our own user-agent. */
export interface RobotsRules {
  isAllowed(url: string): boolean;
  crawlDelaySeconds: number | null;
  sitemaps: string[];
}

const ALLOW_ALL: RobotsRules = {
  isAllowed: () => true,
  crawlDelaySeconds: null,
  sitemaps: [],
};

export function parseRobots(robotsUrl: string, body: string, userAgent: string): RobotsRules {
  const parser = robotsParser(robotsUrl, body);
  return {
    isAllowed: (url: string) => parser.isAllowed(url, userAgent) ?? true,
    crawlDelaySeconds: parser.getCrawlDelay(userAgent) ?? null,
    sitemaps: parser.getSitemaps() ?? [],
  };
}

/** Fetch + parse robots.txt. Missing / erroring robots.txt = allow all (standard behaviour). */
export async function loadRobots(
  origin: string,
  userAgent: string,
  fetchImpl: typeof fetch = fetch,
): Promise<RobotsRules> {
  const robotsUrl = new URL('/robots.txt', origin).toString();
  try {
    const res = await fetchImpl(robotsUrl, { redirect: 'follow' });
    if (!res.ok) return ALLOW_ALL;
    const body = await res.text();
    return parseRobots(robotsUrl, body, userAgent);
  } catch {
    return ALLOW_ALL;
  }
}

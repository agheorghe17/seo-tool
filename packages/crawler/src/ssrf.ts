/**
 * Anti-SSRF guard for the crawler. Only http(s), no private / loopback / link-local hosts.
 * Real DNS-resolution checks are added in Epic 11.2; this covers the obvious cases.
 */
const BLOCKED_HOSTNAMES = new Set(['localhost', '0.0.0.0', '::1', '[::1]']);

const PRIVATE_IPV4 =
  /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.6[4-9]\.|100\.[7-9]\d\.|100\.1[01]\d\.|100\.12[0-7]\.)/;

export function isSafeCrawlUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  const host = url.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(host)) return false;
  if (PRIVATE_IPV4.test(host)) return false;
  if (host.endsWith('.local') || host.endsWith('.internal')) return false;
  return true;
}

export function assertSafeCrawlUrl(raw: string): void {
  if (!isSafeCrawlUrl(raw)) {
    throw new Error(`Refusing to crawl unsafe URL: ${raw}`);
  }
}

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  DNS_PREFIX,
  htmlHasMetaVerification,
  verifyOwnership,
  type VerificationDeps,
} from './verification.js';

const TOKEN = 'seo-tool-11111111-2222-3333-4444-555555555555';

describe('htmlHasMetaVerification', () => {
  it('matches regardless of attribute order or quotes', () => {
    expect(
      htmlHasMetaVerification(`<meta content="${TOKEN}" name='seo-tool-verification'>`, 'seo-tool-verification', TOKEN),
    ).toBe(true);
    expect(
      htmlHasMetaVerification('<meta name="seo-tool-verification" content="other">', 'seo-tool-verification', TOKEN),
    ).toBe(false);
    expect(htmlHasMetaVerification('<title>no meta</title>', 'seo-tool-verification', TOKEN)).toBe(false);
  });
});

describe('verifyOwnership', () => {
  let server: Server;
  let host: string;

  beforeAll(async () => {
    server = createServer((req, res) => {
      if (req.url === '/') {
        res.setHeader('content-type', 'text/html');
        return res.end(`<html><head><meta name="seo-tool-verification" content="${TOKEN}"></head><body>hi</body></html>`);
      }
      if (req.url === `/${TOKEN}.html`) {
        return res.end(TOKEN);
      }
      if (req.url === '/no-meta/') {
        res.setHeader('content-type', 'text/html');
        return res.end('<html><head></head><body>nope</body></html>');
      }
      res.statusCode = 404;
      res.end('not found');
    });
    await new Promise<void>((r) => server.listen(0, r));
    host = `127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  // The lib builds https:// URLs; for the fixture we swap in a fetch that rewrites to the test server.
  const deps = (over: Partial<VerificationDeps> = {}): VerificationDeps => ({
    fetch: ((input: string | URL | Request, init?: RequestInit) => {
      const url = String(input).replace(/^https:\/\/[^/]+/, `http://${host}`);
      return fetch(url, init);
    }) as typeof fetch,
    resolveTxt: async () => [[`${DNS_PREFIX}${TOKEN}`]],
    ...over,
  });

  it('verifies via meta tag', async () => {
    const out = await verifyOwnership('meta_tag', 'example.com', TOKEN, deps());
    expect(out.verified).toBe(true);
  });

  it('fails meta tag when the tag is absent', async () => {
    const failingDeps = deps({
      fetch: ((input: string | URL | Request, init?: RequestInit) =>
        fetch(`http://${host}/no-meta/`, init)) as typeof fetch,
    });
    const out = await verifyOwnership('meta_tag', 'example.com', TOKEN, failingDeps);
    expect(out.verified).toBe(false);
    expect(out.reason).toBeTruthy();
  });

  it('verifies via HTML file', async () => {
    const out = await verifyOwnership('html_file', 'example.com', TOKEN, deps());
    expect(out.verified).toBe(true);
  });

  it('verifies via DNS TXT', async () => {
    const out = await verifyOwnership('dns_txt', 'example.com', TOKEN, deps());
    expect(out.verified).toBe(true);
  });

  it('fails DNS TXT when the record does not match', async () => {
    const out = await verifyOwnership('dns_txt', 'example.com', TOKEN, deps({ resolveTxt: async () => [['unrelated']] }));
    expect(out.verified).toBe(false);
  });
});

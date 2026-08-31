import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  applyFix,
  detectSeoPlugin,
  metaKeysFor,
  resolveObject,
  restBaseFor,
  rollbackFix,
  testConnection,
  type WpCredentials,
} from './wordpress.js';

describe('detectSeoPlugin', () => {
  it('recognises Yoast and Rank Math', () => {
    expect(detectSeoPlugin([{ plugin: 'wordpress-seo/wp-seo', status: 'active' }])).toBe('yoast');
    expect(detectSeoPlugin([{ textdomain: 'rank-math', status: 'active' }])).toBe('rankmath');
    expect(detectSeoPlugin([{ plugin: 'akismet/akismet', status: 'active' }])).toBeNull();
    expect(detectSeoPlugin(null)).toBeNull();
  });
});

describe('metaKeysFor', () => {
  it('maps plugin to meta keys', () => {
    expect(metaKeysFor('yoast').description).toBe('_yoast_wpseo_metadesc');
    expect(metaKeysFor('rankmath').title).toBe('rank_math_title');
    expect(metaKeysFor(null).title).toBe('_seo_tool_title');
  });
});

describe('restBaseFor', () => {
  it('strips trailing slashes', () => {
    expect(restBaseFor('https://blog.example.com//')).toBe('https://blog.example.com/wp-json');
  });
});

async function body(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

describe('WordPress client (fixture server)', () => {
  let server: Server;
  let base: string;
  const creds = (): WpCredentials => ({
    siteUrl: base,
    username: 'admin',
    applicationPassword: 'app pass word',
  });

  // Mutable fixture state so we can assert writes + rollback.
  let mediaAlt = 'old alt';
  let postMeta: Record<string, unknown> = { _yoast_wpseo_metadesc: 'old desc' };

  beforeAll(async () => {
    server = createServer(async (req, res) => {
      const url = req.url ?? '';
      const auth = req.headers.authorization ?? '';
      const authed = auth === `Basic ${Buffer.from('admin:app pass word').toString('base64')}`;
      res.setHeader('content-type', 'application/json');
      const send = (code: number, obj: unknown) => {
        res.statusCode = code;
        res.end(JSON.stringify(obj));
      };

      if (url.startsWith('/wp-json/wp/v2/users/me')) {
        return authed ? send(200, { id: 1 }) : send(401, { code: 'unauthorized' });
      }
      if (url === '/wp-json/wp/v2/types') return send(200, { post: {}, page: {} });
      if (url === '/wp-json/wp/v2/plugins') {
        return send(200, [{ plugin: 'wordpress-seo/wp-seo', status: 'active' }]);
      }
      if (url.startsWith('/wp-json/wp/v2/posts?slug=hello')) return send(200, [{ id: 10, slug: 'hello' }]);
      if (url.startsWith('/wp-json/wp/v2/posts?slug=')) return send(200, []);
      if (url.startsWith('/wp-json/wp/v2/pages?slug=about')) return send(200, [{ id: 20, slug: 'about' }]);
      if (url.startsWith('/wp-json/wp/v2/pages?slug=')) return send(200, []);

      if (url.startsWith('/wp-json/wp/v2/media/5')) {
        if (req.method === 'GET') return send(200, { alt_text: mediaAlt });
        const b = (await body(req)) as { alt_text?: string };
        mediaAlt = b.alt_text ?? mediaAlt;
        return send(200, { alt_text: mediaAlt });
      }
      if (url.startsWith('/wp-json/wp/v2/posts/10')) {
        if (req.method === 'GET') return send(200, { id: 10, meta: postMeta });
        const b = (await body(req)) as { meta?: Record<string, unknown> };
        postMeta = { ...postMeta, ...b.meta };
        return send(200, { id: 10, meta: postMeta });
      }
      return send(404, {});
    });
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it('testConnection succeeds and detects Yoast', async () => {
    const info = await testConnection(creds());
    expect(info).toMatchObject({ ok: true, seoPlugin: 'yoast' });
    expect(info.types).toEqual(expect.arrayContaining(['post', 'page']));
  });

  it('reports rejected auth', async () => {
    const info = await testConnection({ ...creds(), applicationPassword: 'wrong' });
    expect(info.ok).toBe(false);
  });

  it('resolveObject maps a URL slug to a post', async () => {
    expect(await resolveObject(creds(), 'https://x.tld/blog/hello/')).toEqual({
      type: 'post',
      id: 10,
      slug: 'hello',
    });
    expect(await resolveObject(creds(), 'https://x.tld/about')).toEqual({
      type: 'page',
      id: 20,
      slug: 'about',
    });
    expect(await resolveObject(creds(), 'https://x.tld/missing')).toBeNull();
  });

  it('applies + rolls back an alt-text fix', async () => {
    const applied = await applyFix(creds(), { kind: 'alt', mediaId: 5, altText: 'a helpful new alt' });
    expect(applied).toMatchObject({ applied: true, previous: { alt_text: 'old alt' } });
    expect(mediaAlt).toBe('a helpful new alt');

    await rollbackFix(creds(), { kind: 'alt', mediaId: 5, previous: applied.previous });
    expect(mediaAlt).toBe('old alt');
  });

  it('applies + rolls back a meta description fix with the Yoast key', async () => {
    const applied = await applyFix(creds(), {
      kind: 'meta',
      objectType: 'post',
      objectId: 10,
      seoPlugin: 'yoast',
      metaDescription: 'A crisp 150-character summary of the page.',
    });
    expect(applied.applied).toBe(true);
    expect(applied.previous['_yoast_wpseo_metadesc']).toBe('old desc');
    expect(postMeta['_yoast_wpseo_metadesc']).toBe('A crisp 150-character summary of the page.');

    await rollbackFix(creds(), {
      kind: 'meta',
      objectType: 'post',
      objectId: 10,
      previous: applied.previous,
    });
    expect(postMeta['_yoast_wpseo_metadesc']).toBe('old desc');
  });
});

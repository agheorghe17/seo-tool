import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { detectSeoPlugin, restBaseFor, testConnection } from './wordpress.js';

describe('detectSeoPlugin', () => {
  it('recognises Yoast and Rank Math', () => {
    expect(detectSeoPlugin([{ plugin: 'wordpress-seo/wp-seo', status: 'active' }])).toBe('yoast');
    expect(
      detectSeoPlugin([{ textdomain: 'rank-math', status: 'active' }]),
    ).toBe('rankmath');
    expect(detectSeoPlugin([{ plugin: 'akismet/akismet', status: 'active' }])).toBeNull();
    expect(detectSeoPlugin(null)).toBeNull();
  });
});

describe('restBaseFor', () => {
  it('strips trailing slashes', () => {
    expect(restBaseFor('https://blog.example.com//')).toBe('https://blog.example.com/wp-json');
  });
});

describe('testConnection', () => {
  let server: Server;
  let base: string;

  beforeAll(async () => {
    server = createServer((req, res) => {
      const auth = req.headers.authorization ?? '';
      const ok = auth === `Basic ${Buffer.from('admin:app pass word').toString('base64')}`;
      res.setHeader('content-type', 'application/json');

      if (req.url?.startsWith('/wp-json/wp/v2/users/me')) {
        if (!ok) {
          res.statusCode = 401;
          return res.end(JSON.stringify({ code: 'unauthorized' }));
        }
        return res.end(JSON.stringify({ id: 1, name: 'admin' }));
      }
      if (req.url === '/wp-json/wp/v2/types') {
        return res.end(JSON.stringify({ post: {}, page: {}, attachment: {} }));
      }
      if (req.url === '/wp-json/wp/v2/plugins') {
        return res.end(
          JSON.stringify([{ plugin: 'wordpress-seo/wp-seo', status: 'active', textdomain: 'wordpress-seo' }]),
        );
      }
      res.statusCode = 404;
      res.end('{}');
    });
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it('connects with a valid Application Password', async () => {
    const info = await testConnection({
      siteUrl: base,
      username: 'admin',
      applicationPassword: 'app pass word',
    });
    expect(info.ok).toBe(true);
    expect(info.types).toEqual(expect.arrayContaining(['post', 'page']));
    expect(info.seoPlugin).toBe('yoast');
  });

  it('reports rejected auth', async () => {
    const info = await testConnection({
      siteUrl: base,
      username: 'admin',
      applicationPassword: 'wrong',
    });
    expect(info.ok).toBe(false);
    expect(info.reason).toMatch(/respins/i);
  });
});

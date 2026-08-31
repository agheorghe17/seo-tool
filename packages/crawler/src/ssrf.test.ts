import { describe, expect, it } from 'vitest';
import { isSafeCrawlUrl } from './ssrf.js';

describe('isSafeCrawlUrl', () => {
  it('allows normal public https URLs', () => {
    expect(isSafeCrawlUrl('https://example.com/page')).toBe(true);
  });

  it('blocks localhost, private ranges and non-http schemes', () => {
    for (const bad of [
      'http://localhost/',
      'http://127.0.0.1/',
      'http://10.1.2.3/',
      'http://192.168.0.1/',
      'http://172.16.0.9/',
      'https://intranet.local/',
      'file:///etc/passwd',
      'ftp://example.com/',
      'not a url',
    ]) {
      expect(isSafeCrawlUrl(bad), bad).toBe(false);
    }
  });
});

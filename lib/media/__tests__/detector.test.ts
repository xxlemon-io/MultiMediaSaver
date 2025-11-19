import { detectProvider } from '../detector';

describe('detectProvider', () => {
  describe('Twitter/X.com URLs', () => {
    it('should detect twitter.com URLs', () => {
      expect(detectProvider('https://twitter.com/user/status/123456')).toBe('twitter');
      expect(detectProvider('https://www.twitter.com/user/status/123456')).toBe('twitter');
      expect(detectProvider('http://twitter.com/user/status/123456')).toBe('twitter');
    });

    it('should detect x.com URLs', () => {
      expect(detectProvider('https://x.com/user/status/123456')).toBe('twitter');
      expect(detectProvider('https://www.x.com/user/status/123456')).toBe('twitter');
      expect(detectProvider('http://x.com/user/status/123456')).toBe('twitter');
    });

    it('should be case-insensitive', () => {
      expect(detectProvider('HTTPS://TWITTER.COM/USER/STATUS/123456')).toBe('twitter');
      expect(detectProvider('HTTPS://X.COM/USER/STATUS/123456')).toBe('twitter');
      expect(detectProvider('Https://TwItTeR.CoM/user/status/123456')).toBe('twitter');
    });

    it('should handle URLs with query parameters', () => {
      expect(detectProvider('https://twitter.com/user/status/123456?s=20')).toBe('twitter');
      expect(detectProvider('https://x.com/user/status/123456?ref_src=twsrc')).toBe('twitter');
    });
  });

  describe('Instagram URLs', () => {
    it('should detect instagram.com URLs', () => {
      expect(detectProvider('https://instagram.com/p/ABC123/')).toBe('instagram');
      expect(detectProvider('https://www.instagram.com/p/ABC123/')).toBe('instagram');
      expect(detectProvider('http://instagram.com/p/ABC123/')).toBe('instagram');
    });

    it('should be case-insensitive', () => {
      expect(detectProvider('HTTPS://INSTAGRAM.COM/P/ABC123/')).toBe('instagram');
      expect(detectProvider('Https://InStAgRaM.CoM/p/ABC123/')).toBe('instagram');
    });

    it('should handle URLs with query parameters', () => {
      expect(detectProvider('https://instagram.com/p/ABC123/?utm_source=share')).toBe('instagram');
    });
  });

  describe('Unsupported URLs', () => {
    it('should return unknown for unsupported domains', () => {
      expect(detectProvider('https://youtube.com/watch?v=123')).toBe('unknown');
      expect(detectProvider('https://facebook.com/post/123')).toBe('unknown');
      expect(detectProvider('https://example.com')).toBe('unknown');
    });

    it('should return unknown for invalid URLs', () => {
      expect(detectProvider('not-a-url')).toBe('unknown');
      expect(detectProvider('ftp://example.com')).toBe('unknown');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty string', () => {
      expect(detectProvider('')).toBe('unknown');
    });

    it('should handle whitespace-only strings', () => {
      expect(detectProvider('   ')).toBe('unknown');
      expect(detectProvider('\t\n')).toBe('unknown');
    });

    it('should trim whitespace', () => {
      expect(detectProvider('  https://twitter.com/user/status/123456  ')).toBe('twitter');
      expect(detectProvider('  https://instagram.com/p/ABC123/  ')).toBe('instagram');
    });

    it('should handle URLs with subdomains', () => {
      expect(detectProvider('https://mobile.twitter.com/user/status/123456')).toBe('twitter');
      expect(detectProvider('https://m.instagram.com/p/ABC123/')).toBe('instagram');
    });
  });
});


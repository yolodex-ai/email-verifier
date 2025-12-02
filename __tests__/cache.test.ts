import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Cache, emailCacheKey, domainCacheKey } from '../src/cache';

describe('Cache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('get and set', () => {
    it('should store and retrieve values', () => {
      const cache = new Cache<string>();
      cache.set('key', 'value');
      expect(cache.get('key')).toBe('value');
    });

    it('should return undefined for non-existent keys', () => {
      const cache = new Cache<string>();
      expect(cache.get('nonexistent')).toBeUndefined();
    });

    it('should overwrite existing values', () => {
      const cache = new Cache<string>();
      cache.set('key', 'value1');
      cache.set('key', 'value2');
      expect(cache.get('key')).toBe('value2');
    });

    it('should store different types', () => {
      const cache = new Cache<{ name: string; count: number }>();
      cache.set('obj', { name: 'test', count: 42 });
      expect(cache.get('obj')).toEqual({ name: 'test', count: 42 });
    });
  });

  describe('TTL expiration', () => {
    it('should expire entries after TTL', () => {
      const cache = new Cache<string>(1000); // 1 second TTL
      cache.set('key', 'value');

      expect(cache.get('key')).toBe('value');

      // Advance time past TTL
      vi.advanceTimersByTime(1001);

      expect(cache.get('key')).toBeUndefined();
    });

    it('should respect custom TTL per entry', () => {
      const cache = new Cache<string>(10000); // 10 second default
      cache.set('short', 'value', 1000); // 1 second TTL
      cache.set('long', 'value', 5000); // 5 second TTL

      vi.advanceTimersByTime(1500);

      expect(cache.get('short')).toBeUndefined();
      expect(cache.get('long')).toBe('value');

      vi.advanceTimersByTime(4000);

      expect(cache.get('long')).toBeUndefined();
    });

    it('should not expire entries before TTL', () => {
      const cache = new Cache<string>(5000);
      cache.set('key', 'value');

      vi.advanceTimersByTime(4999);

      expect(cache.get('key')).toBe('value');
    });
  });

  describe('has', () => {
    it('should return true for existing non-expired keys', () => {
      const cache = new Cache<string>();
      cache.set('key', 'value');
      expect(cache.has('key')).toBe(true);
    });

    it('should return false for non-existent keys', () => {
      const cache = new Cache<string>();
      expect(cache.has('nonexistent')).toBe(false);
    });

    it('should return false for expired keys', () => {
      const cache = new Cache<string>(1000);
      cache.set('key', 'value');

      vi.advanceTimersByTime(1001);

      expect(cache.has('key')).toBe(false);
    });
  });

  describe('delete', () => {
    it('should remove entries', () => {
      const cache = new Cache<string>();
      cache.set('key', 'value');
      expect(cache.delete('key')).toBe(true);
      expect(cache.get('key')).toBeUndefined();
    });

    it('should return false for non-existent keys', () => {
      const cache = new Cache<string>();
      expect(cache.delete('nonexistent')).toBe(false);
    });
  });

  describe('clear', () => {
    it('should remove all entries', () => {
      const cache = new Cache<string>();
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.clear();

      expect(cache.size).toBe(0);
      expect(cache.get('key1')).toBeUndefined();
      expect(cache.get('key2')).toBeUndefined();
    });
  });

  describe('size', () => {
    it('should return the number of entries', () => {
      const cache = new Cache<string>();
      expect(cache.size).toBe(0);

      cache.set('key1', 'value1');
      expect(cache.size).toBe(1);

      cache.set('key2', 'value2');
      expect(cache.size).toBe(2);
    });

    it('should not include expired entries after cleanup', () => {
      const cache = new Cache<string>(1000);
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      vi.advanceTimersByTime(1001);
      cache.cleanup();

      expect(cache.size).toBe(0);
    });
  });

  describe('cleanup', () => {
    it('should remove only expired entries', () => {
      const cache = new Cache<string>();
      cache.set('expired', 'value', 1000);
      cache.set('valid', 'value', 5000);

      vi.advanceTimersByTime(2000);

      const removed = cache.cleanup();

      expect(removed).toBe(1);
      expect(cache.get('expired')).toBeUndefined();
      expect(cache.get('valid')).toBe('value');
    });

    it('should return 0 when no entries are expired', () => {
      const cache = new Cache<string>();
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      const removed = cache.cleanup();
      expect(removed).toBe(0);
    });
  });
});

describe('Cache key utilities', () => {
  describe('emailCacheKey', () => {
    it('should normalize email to lowercase', () => {
      expect(emailCacheKey('User@Example.COM')).toBe('user@example.com');
    });

    it('should trim whitespace', () => {
      expect(emailCacheKey('  user@example.com  ')).toBe('user@example.com');
    });
  });

  describe('domainCacheKey', () => {
    it('should normalize domain to lowercase', () => {
      expect(domainCacheKey('Example.COM')).toBe('example.com');
    });

    it('should trim whitespace', () => {
      expect(domainCacheKey('  example.com  ')).toBe('example.com');
    });
  });
});



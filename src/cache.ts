/**
 * Simple in-memory cache with TTL support
 * 
 * Used to cache email verification results and DNS lookups
 * to avoid unnecessary repeated lookups.
 */

import type { CacheEntry } from './types';

/**
 * Default TTL for cache entries (1 hour)
 */
const DEFAULT_TTL = 60 * 60 * 1000;

/**
 * Maximum cache size to prevent memory leaks
 */
const MAX_CACHE_SIZE = 10000;

/**
 * A simple in-memory cache with TTL support
 * 
 * @example
 * ```ts
 * const cache = new Cache<string>();
 * cache.set('key', 'value', 60000); // TTL of 60 seconds
 * cache.get('key'); // 'value'
 * ```
 */
export class Cache<T> {
  private store: Map<string, CacheEntry<T>> = new Map();
  private defaultTtl: number;

  /**
   * Creates a new cache instance
   * 
   * @param defaultTtl - Default TTL in milliseconds (default: 1 hour)
   */
  constructor(defaultTtl: number = DEFAULT_TTL) {
    this.defaultTtl = defaultTtl;
  }

  /**
   * Gets a value from the cache
   * 
   * @param key - The cache key
   * @returns The cached value, or undefined if not found or expired
   */
  get(key: string): T | undefined {
    const entry = this.store.get(key);

    if (!entry) {
      return undefined;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }

    return entry.value;
  }

  /**
   * Sets a value in the cache
   * 
   * @param key - The cache key
   * @param value - The value to cache
   * @param ttl - Time to live in milliseconds (uses default if not specified)
   */
  set(key: string, value: T, ttl?: number): void {
    // Enforce max cache size by removing oldest entries
    if (this.store.size >= MAX_CACHE_SIZE) {
      this.evictOldest();
    }

    this.store.set(key, {
      value,
      expiresAt: Date.now() + (ttl ?? this.defaultTtl),
    });
  }

  /**
   * Checks if a key exists and is not expired
   * 
   * @param key - The cache key
   * @returns true if the key exists and is not expired
   */
  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  /**
   * Deletes a key from the cache
   * 
   * @param key - The cache key
   * @returns true if the key was deleted
   */
  delete(key: string): boolean {
    return this.store.delete(key);
  }

  /**
   * Clears all entries from the cache
   */
  clear(): void {
    this.store.clear();
  }

  /**
   * Gets the current size of the cache
   */
  get size(): number {
    return this.store.size;
  }

  /**
   * Removes expired entries from the cache
   * 
   * @returns The number of entries removed
   */
  cleanup(): number {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.store.entries()) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
        removed++;
      }
    }

    return removed;
  }

  /**
   * Evicts the oldest entries when cache is full
   */
  private evictOldest(): void {
    // Remove expired entries first
    this.cleanup();

    // If still over limit, remove oldest 10%
    if (this.store.size >= MAX_CACHE_SIZE) {
      const toRemove = Math.ceil(MAX_CACHE_SIZE * 0.1);
      const keys = Array.from(this.store.keys()).slice(0, toRemove);
      keys.forEach((key) => this.store.delete(key));
    }
  }
}

/**
 * Global caches for different purposes
 */

/** Cache for full email verification results */
export const emailCache = new Cache<import('./types').VerificationResult>();

/** Cache for DNS results per domain */
export const dnsCache = new Cache<import('./types').DnsResult>();

/**
 * Generates a cache key for an email
 * 
 * @param email - The email address
 * @returns A normalized cache key
 */
export function emailCacheKey(email: string): string {
  return email.toLowerCase().trim();
}

/**
 * Generates a cache key for a domain
 * 
 * @param domain - The domain name
 * @returns A normalized cache key
 */
export function domainCacheKey(domain: string): string {
  return domain.toLowerCase().trim();
}


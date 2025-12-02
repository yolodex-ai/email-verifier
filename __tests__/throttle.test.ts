import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Throttle } from '../src/throttle';

describe('Throttle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('canProceed', () => {
    it('should allow requests when tokens available', () => {
      const throttle = new Throttle({ maxTokens: 5 });
      expect(throttle.canProceed('mx.example.com')).toBe(true);
    });

    it('should deny requests when in backoff', () => {
      const throttle = new Throttle({ 
        failureThreshold: 1,
        initialBackoff: 5000,
      });

      throttle.recordFailure('mx.example.com');
      expect(throttle.canProceed('mx.example.com')).toBe(false);
    });

    it('should allow requests after backoff expires', () => {
      const throttle = new Throttle({ 
        failureThreshold: 1,
        initialBackoff: 5000,
      });

      throttle.recordFailure('mx.example.com');
      vi.advanceTimersByTime(6000);
      
      expect(throttle.canProceed('mx.example.com')).toBe(true);
    });
  });

  describe('consume', () => {
    it('should consume tokens', () => {
      const throttle = new Throttle({ maxTokens: 2, refillRate: 0 });

      expect(throttle.consume('mx.example.com')).toBe(true);
      expect(throttle.consume('mx.example.com')).toBe(true);
      expect(throttle.consume('mx.example.com')).toBe(false);
    });

    it('should refill tokens over time', () => {
      const throttle = new Throttle({ maxTokens: 2, refillRate: 1 });

      // Consume all tokens
      throttle.consume('mx.example.com');
      throttle.consume('mx.example.com');
      expect(throttle.consume('mx.example.com')).toBe(false);

      // Wait for refill
      vi.advanceTimersByTime(1000);
      expect(throttle.consume('mx.example.com')).toBe(true);
    });

    it('should not exceed max tokens during refill', () => {
      const throttle = new Throttle({ maxTokens: 2, refillRate: 10 });

      // Wait a long time
      vi.advanceTimersByTime(10000);

      // Should still only have max tokens
      let consumed = 0;
      while (throttle.consume('mx.example.com')) {
        consumed++;
        if (consumed > 10) break; // Safety
      }

      expect(consumed).toBe(2);
    });
  });

  describe('recordSuccess', () => {
    it('should reset failure count', () => {
      const throttle = new Throttle({ failureThreshold: 3 });

      throttle.recordFailure('mx.example.com');
      throttle.recordFailure('mx.example.com');
      expect(throttle.getFailureCount('mx.example.com')).toBe(2);

      throttle.recordSuccess('mx.example.com');
      expect(throttle.getFailureCount('mx.example.com')).toBe(0);
    });

    it('should clear backoff', () => {
      const throttle = new Throttle({ 
        failureThreshold: 1,
        initialBackoff: 10000,
      });

      throttle.recordFailure('mx.example.com');
      expect(throttle.isInBackoff('mx.example.com')).toBe(true);

      throttle.recordSuccess('mx.example.com');
      expect(throttle.isInBackoff('mx.example.com')).toBe(false);
    });
  });

  describe('recordFailure', () => {
    it('should increment failure count', () => {
      const throttle = new Throttle();

      throttle.recordFailure('mx.example.com');
      expect(throttle.getFailureCount('mx.example.com')).toBe(1);

      throttle.recordFailure('mx.example.com');
      expect(throttle.getFailureCount('mx.example.com')).toBe(2);
    });

    it('should trigger backoff after threshold', () => {
      const throttle = new Throttle({ 
        failureThreshold: 2,
        initialBackoff: 5000,
      });

      throttle.recordFailure('mx.example.com');
      expect(throttle.isInBackoff('mx.example.com')).toBe(false);

      throttle.recordFailure('mx.example.com');
      expect(throttle.isInBackoff('mx.example.com')).toBe(true);
    });

    it('should use exponential backoff', () => {
      const throttle = new Throttle({ 
        failureThreshold: 1,
        initialBackoff: 1000,
        backoffMultiplier: 2,
      });

      // First failure - 1000ms backoff
      throttle.recordFailure('mx.example.com');
      let waitTime = throttle.getWaitTime('mx.example.com');
      expect(waitTime).toBeGreaterThan(900);
      expect(waitTime).toBeLessThanOrEqual(1000);

      vi.advanceTimersByTime(1100);

      // Second failure - 2000ms backoff
      throttle.recordFailure('mx.example.com');
      waitTime = throttle.getWaitTime('mx.example.com');
      expect(waitTime).toBeGreaterThan(1900);
      expect(waitTime).toBeLessThanOrEqual(2000);
    });

    it('should cap backoff at maximum', () => {
      const throttle = new Throttle({ 
        failureThreshold: 1,
        initialBackoff: 1000,
        maxBackoff: 5000,
        backoffMultiplier: 10,
      });

      // Many failures - should cap at 5000ms
      for (let i = 0; i < 10; i++) {
        throttle.recordFailure('mx.example.com');
        vi.advanceTimersByTime(throttle.getWaitTime('mx.example.com') + 100);
      }

      throttle.recordFailure('mx.example.com');
      const waitTime = throttle.getWaitTime('mx.example.com');
      expect(waitTime).toBeLessThanOrEqual(5000);
    });
  });

  describe('getWaitTime', () => {
    it('should return 0 when tokens available', () => {
      const throttle = new Throttle({ maxTokens: 5 });
      expect(throttle.getWaitTime('mx.example.com')).toBe(0);
    });

    it('should return backoff time when in backoff', () => {
      const throttle = new Throttle({ 
        failureThreshold: 1,
        initialBackoff: 5000,
      });

      throttle.recordFailure('mx.example.com');
      const waitTime = throttle.getWaitTime('mx.example.com');

      expect(waitTime).toBeGreaterThan(4900);
      expect(waitTime).toBeLessThanOrEqual(5000);
    });

    it('should return time until token refill when out of tokens', () => {
      const throttle = new Throttle({ maxTokens: 1, refillRate: 1 });

      throttle.consume('mx.example.com');
      const waitTime = throttle.getWaitTime('mx.example.com');

      expect(waitTime).toBeGreaterThan(900);
      expect(waitTime).toBeLessThanOrEqual(1000);
    });
  });

  describe('reset', () => {
    it('should clear state for a host', () => {
      const throttle = new Throttle({ failureThreshold: 1 });

      throttle.recordFailure('mx.example.com');
      expect(throttle.isInBackoff('mx.example.com')).toBe(true);

      throttle.reset('mx.example.com');
      expect(throttle.isInBackoff('mx.example.com')).toBe(false);
      expect(throttle.getFailureCount('mx.example.com')).toBe(0);
    });
  });

  describe('clear', () => {
    it('should clear all state', () => {
      const throttle = new Throttle({ failureThreshold: 1 });

      throttle.recordFailure('mx1.example.com');
      throttle.recordFailure('mx2.example.com');

      throttle.clear();

      expect(throttle.isInBackoff('mx1.example.com')).toBe(false);
      expect(throttle.isInBackoff('mx2.example.com')).toBe(false);
    });
  });

  describe('host normalization', () => {
    it('should treat hosts case-insensitively', () => {
      const throttle = new Throttle({ failureThreshold: 1 });

      throttle.recordFailure('MX.Example.COM');
      expect(throttle.isInBackoff('mx.example.com')).toBe(true);
    });
  });
});



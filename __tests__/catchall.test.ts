/**
 * Tests for catch-all analysis
 */

import { describe, it, expect } from 'vitest';
import {
  analyzeEmailPattern,
  analyzeNameLikeness,
  analyzeResponseTiming,
} from '../src/analyzers/catchall';

describe('Catch-all Analysis', () => {
  describe('analyzeEmailPattern', () => {
    it('should detect first.last pattern', () => {
      const result = analyzeEmailPattern('john.smith');
      expect(result.pattern).toBe('first.last');
      expect(result.score).toBe(0.9);
    });

    it('should detect first_last pattern', () => {
      const result = analyzeEmailPattern('john_smith');
      expect(result.pattern).toBe('first_last');
      expect(result.score).toBe(0.85);
    });

    it('should detect first-last pattern', () => {
      const result = analyzeEmailPattern('john-smith');
      expect(result.pattern).toBe('first-last');
      expect(result.score).toBe(0.85);
    });

    it('should detect first.m.last pattern', () => {
      const result = analyzeEmailPattern('john.a.smith');
      expect(result.pattern).toBe('first.m.last');
      expect(result.score).toBe(0.9);
    });

    it('should detect common first name in email', () => {
      // 'michael' matches the 'firstlast' pattern first since it's all lowercase letters
      const result = analyzeEmailPattern('michael');
      expect(result.score).toBeGreaterThanOrEqual(0.5);
      // A separated pattern with a name should score higher
      const separatedResult = analyzeEmailPattern('michael.wilson');
      expect(separatedResult.pattern).toBe('first.last');
      expect(separatedResult.score).toBe(0.9);
    });

    it('should give lower score to patterns with numbers', () => {
      const result = analyzeEmailPattern('user123');
      expect(result.pattern).toBe('contains_numbers');
      expect(result.score).toBe(0.2);
    });

    it('should handle empty input', () => {
      const result = analyzeEmailPattern('');
      expect(result.score).toBe(0);
      expect(result.pattern).toBeNull();
    });

    it('should recognize single word as possible name', () => {
      const result = analyzeEmailPattern('anton');
      expect(result.score).toBeGreaterThan(0.3);
    });
  });

  describe('analyzeNameLikeness', () => {
    it('should give high score to known first names', () => {
      expect(analyzeNameLikeness('michael')).toBeGreaterThanOrEqual(0.7);
      expect(analyzeNameLikeness('jennifer')).toBeGreaterThanOrEqual(0.7);
    });

    it('should give high score to first.last patterns with known names', () => {
      expect(analyzeNameLikeness('john.smith')).toBe(0.95);
      expect(analyzeNameLikeness('sarah.jones')).toBe(0.95);
    });

    it('should give moderate score to first.last patterns without known names', () => {
      expect(analyzeNameLikeness('xyz.abc')).toBe(0.75);
    });

    it('should give lower score to patterns with numbers', () => {
      expect(analyzeNameLikeness('user123')).toBeLessThan(0.5);
    });

    it('should handle empty input', () => {
      expect(analyzeNameLikeness('')).toBe(0);
    });

    it('should handle international names', () => {
      // Names added to the common names list
      expect(analyzeNameLikeness('andreas')).toBeGreaterThan(0.5);
      expect(analyzeNameLikeness('giuseppe')).toBeGreaterThan(0.5);
      expect(analyzeNameLikeness('pablo')).toBeGreaterThan(0.5);
    });
  });

  describe('analyzeResponseTiming', () => {
    it('should give high score when real email responds much faster', () => {
      // Real: 100ms, Fake: 200ms (100% slower)
      expect(analyzeResponseTiming(100, 200)).toBe(0.8);
    });

    it('should give moderate score when real email responds somewhat faster', () => {
      // Real: 100ms, Fake: 130ms (30% slower)
      expect(analyzeResponseTiming(100, 130)).toBe(0.6);
    });

    it('should give neutral score when timings are similar', () => {
      // Real: 100ms, Fake: 105ms (5% slower)
      expect(analyzeResponseTiming(100, 105)).toBe(0.5);
    });

    it('should give lower score when fake email responds faster', () => {
      // Real: 200ms, Fake: 100ms
      expect(analyzeResponseTiming(200, 100)).toBe(0.4);
    });
  });

  describe('Real-world email patterns', () => {
    it('should give high confidence to typical corporate emails', () => {
      const corporateEmails = [
        'john.smith',
        'jane.doe',
        'michael.johnson',
        'sarah.williams',
        'david.brown',
      ];

      for (const email of corporateEmails) {
        const pattern = analyzeEmailPattern(email);
        const name = analyzeNameLikeness(email);
        expect(pattern.score).toBeGreaterThanOrEqual(0.7);
        expect(name).toBeGreaterThanOrEqual(0.7);
      }
    });

    it('should give lower confidence to suspicious emails', () => {
      const suspiciousEmails = [
        'test123',
        'abc123xyz',
        'user1234',
        'x9x0random',
      ];

      for (const email of suspiciousEmails) {
        const pattern = analyzeEmailPattern(email);
        expect(pattern.score).toBeLessThan(0.5);
      }
    });

    it('should handle typical corporate email patterns', () => {
      // Single name - should be recognized
      const alexPattern = analyzeEmailPattern('alex');
      const alexName = analyzeNameLikeness('alex');
      expect(alexPattern.score).toBeGreaterThan(0.3);
      expect(alexName).toBeGreaterThan(0.5);

      // first.last pattern - common corporate format
      const corporatePattern = analyzeEmailPattern('james.wilson');
      expect(corporatePattern.pattern).toBe('first.last');
      expect(corporatePattern.score).toBe(0.9);
    });
  });
});


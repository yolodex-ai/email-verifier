import { describe, it, expect } from 'vitest';
import {
  isValidFormat,
  extractDomain,
  extractLocalPart,
  normalizeEmail,
} from '../src/validators/format';

describe('isValidFormat', () => {
  describe('valid emails', () => {
    const validEmails = [
      'simple@example.com',
      'very.common@example.com',
      'disposable.style.email.with+symbol@example.com',
      'other.email-with-hyphen@example.com',
      'fully-qualified-domain@example.com',
      'user.name+tag+sorting@example.com',
      'x@example.com',
      'example-indeed@strange-example.com',
      'example@s.example',
      'user@subdomain.example.com',
      'user@sub.subdomain.example.com',
      'mailhost!username@example.org',
      'user%example.com@example.org',
      'user-@example.org',
      'test@test.co.uk',
      'test@xn--n3h.com', // punycode domain
    ];

    it.each(validEmails)('should accept "%s"', (email) => {
      expect(isValidFormat(email)).toBe(true);
    });
  });

  describe('invalid emails', () => {
    const invalidEmails = [
      '',
      'plainaddress',
      '@no-local-part.com',
      'no-at-sign.com',
      'no-domain@',
      '@',
      'missing@.com',
      'missing@domain.',
      '.starts-with-dot@example.com',
      'ends-with-dot.@example.com',
      'two..dots@example.com',
      'spaces in@example.com',
      'spaces@in domain.com',
      'test@.example.com',
      'test@example..com',
      'test@-example.com',
      'a"b(c)d,e:f;g<h>i[j\\k]l@example.com',
      'just"not"right@example.com',
      'this is"not\\allowed@example.com',
      'test@example.c', // TLD too short
    ];

    it.each(invalidEmails)('should reject "%s"', (email) => {
      expect(isValidFormat(email)).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should reject null', () => {
      expect(isValidFormat(null as unknown as string)).toBe(false);
    });

    it('should reject undefined', () => {
      expect(isValidFormat(undefined as unknown as string)).toBe(false);
    });

    it('should reject numbers', () => {
      expect(isValidFormat(123 as unknown as string)).toBe(false);
    });

    it('should reject objects', () => {
      expect(isValidFormat({} as unknown as string)).toBe(false);
    });

    it('should handle whitespace-padded emails', () => {
      expect(isValidFormat('  user@example.com  ')).toBe(true);
    });

    it('should reject emails that are too long (> 254 chars)', () => {
      const longLocal = 'a'.repeat(64);
      const longDomain = 'b'.repeat(63) + '.' + 'c'.repeat(63) + '.' + 'd'.repeat(63) + '.com';
      const longEmail = `${longLocal}@${longDomain}`;
      expect(longEmail.length).toBeGreaterThan(254);
      expect(isValidFormat(longEmail)).toBe(false);
    });

    it('should reject local parts longer than 64 chars', () => {
      const longLocal = 'a'.repeat(65);
      expect(isValidFormat(`${longLocal}@example.com`)).toBe(false);
    });
  });
});

describe('extractDomain', () => {
  it('should extract domain from valid email', () => {
    expect(extractDomain('user@example.com')).toBe('example.com');
  });

  it('should extract domain with subdomains', () => {
    expect(extractDomain('user@sub.example.com')).toBe('sub.example.com');
  });

  it('should return lowercase domain', () => {
    expect(extractDomain('user@EXAMPLE.COM')).toBe('example.com');
  });

  it('should return null for invalid input', () => {
    expect(extractDomain('noemail')).toBe(null);
    expect(extractDomain('')).toBe(null);
    expect(extractDomain(null as unknown as string)).toBe(null);
    expect(extractDomain('test@')).toBe(null);
  });
});

describe('extractLocalPart', () => {
  it('should extract local part from valid email', () => {
    expect(extractLocalPart('user@example.com')).toBe('user');
  });

  it('should extract local part with dots', () => {
    expect(extractLocalPart('user.name@example.com')).toBe('user.name');
  });

  it('should extract local part with plus', () => {
    expect(extractLocalPart('user+tag@example.com')).toBe('user+tag');
  });

  it('should return null for invalid input', () => {
    expect(extractLocalPart('noemail')).toBe(null);
    expect(extractLocalPart('')).toBe(null);
    expect(extractLocalPart(null as unknown as string)).toBe(null);
    expect(extractLocalPart('@example.com')).toBe(null);
  });
});

describe('normalizeEmail', () => {
  it('should lowercase and trim email', () => {
    expect(normalizeEmail('  User@EXAMPLE.COM  ')).toBe('user@example.com');
  });

  it('should handle already normalized email', () => {
    expect(normalizeEmail('user@example.com')).toBe('user@example.com');
  });

  it('should return null for invalid input', () => {
    expect(normalizeEmail('')).toBe(null);
    expect(normalizeEmail(null as unknown as string)).toBe(null);
  });
});


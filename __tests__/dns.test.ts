import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import dns from 'dns';
import { checkDns, lookupMx, lookupA, getPrimaryMx } from '../src/validators/dns';

// Mock the dns module
vi.mock('dns', () => ({
  default: {
    resolveMx: vi.fn(),
    resolve4: vi.fn(),
  },
}));

describe('DNS Validators', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('lookupMx', () => {
    it('should return MX records sorted by priority', async () => {
      const mockMx = [
        { exchange: 'mx2.example.com', priority: 20 },
        { exchange: 'mx1.example.com', priority: 10 },
        { exchange: 'mx3.example.com', priority: 30 },
      ];

      vi.mocked(dns.resolveMx).mockImplementation((_domain, callback) => {
        (callback as Function)(null, mockMx);
      });

      const result = await lookupMx('example.com');

      expect(result).toEqual([
        { exchange: 'mx1.example.com', priority: 10 },
        { exchange: 'mx2.example.com', priority: 20 },
        { exchange: 'mx3.example.com', priority: 30 },
      ]);
    });

    it('should return empty array when no MX records', async () => {
      vi.mocked(dns.resolveMx).mockImplementation((_domain, callback) => {
        (callback as Function)(null, []);
      });

      const result = await lookupMx('no-mx.example.com');
      expect(result).toEqual([]);
    });

    it('should return empty array on DNS error', async () => {
      vi.mocked(dns.resolveMx).mockImplementation((_domain, callback) => {
        (callback as Function)(new Error('ENOTFOUND'), null);
      });

      const result = await lookupMx('nonexistent.example.com');
      expect(result).toEqual([]);
    });
  });

  describe('lookupA', () => {
    it('should return A records', async () => {
      const mockA = ['93.184.216.34', '93.184.216.35'];

      vi.mocked(dns.resolve4).mockImplementation((_domain, callback) => {
        (callback as Function)(null, mockA);
      });

      const result = await lookupA('example.com');
      expect(result).toEqual(mockA);
    });

    it('should return empty array when no A records', async () => {
      vi.mocked(dns.resolve4).mockImplementation((_domain, callback) => {
        (callback as Function)(new Error('ENOTFOUND'), null);
      });

      const result = await lookupA('nonexistent.example.com');
      expect(result).toEqual([]);
    });
  });

  describe('checkDns', () => {
    it('should return MX records when available', async () => {
      const mockMx = [{ exchange: 'mx.example.com', priority: 10 }];

      vi.mocked(dns.resolveMx).mockImplementation((_domain, callback) => {
        (callback as Function)(null, mockMx);
      });

      const result = await checkDns('example.com');

      expect(result.hasValidDns).toBe(true);
      expect(result.mxRecords).toEqual([{ exchange: 'mx.example.com', priority: 10 }]);
    });

    it('should fallback to A record when no MX', async () => {
      vi.mocked(dns.resolveMx).mockImplementation((_domain, callback) => {
        (callback as Function)(null, []);
      });

      vi.mocked(dns.resolve4).mockImplementation((_domain, callback) => {
        (callback as Function)(null, ['93.184.216.34']);
      });

      const result = await checkDns('example.com');

      expect(result.hasValidDns).toBe(true);
      // Should use domain as implicit MX
      expect(result.mxRecords).toEqual([{ exchange: 'example.com', priority: 0 }]);
    });

    it('should return invalid when no MX and no A records', async () => {
      vi.mocked(dns.resolveMx).mockImplementation((_domain, callback) => {
        (callback as Function)(new Error('ENOTFOUND'), null);
      });

      vi.mocked(dns.resolve4).mockImplementation((_domain, callback) => {
        (callback as Function)(new Error('ENOTFOUND'), null);
      });

      const result = await checkDns('nonexistent.example.com');

      expect(result.hasValidDns).toBe(false);
      expect(result.mxRecords).toEqual([]);
    });
  });

  describe('getPrimaryMx', () => {
    it('should return the lowest priority MX', async () => {
      const mockMx = [
        { exchange: 'mx2.example.com', priority: 20 },
        { exchange: 'mx1.example.com', priority: 10 },
      ];

      vi.mocked(dns.resolveMx).mockImplementation((_domain, callback) => {
        (callback as Function)(null, mockMx);
      });

      const result = await getPrimaryMx('example.com');
      expect(result).toBe('mx1.example.com');
    });

    it('should return null when no MX and no A records', async () => {
      vi.mocked(dns.resolveMx).mockImplementation((_domain, callback) => {
        (callback as Function)(new Error('ENOTFOUND'), null);
      });

      vi.mocked(dns.resolve4).mockImplementation((_domain, callback) => {
        (callback as Function)(new Error('ENOTFOUND'), null);
      });

      const result = await getPrimaryMx('nonexistent.example.com');
      expect(result).toBeNull();
    });
  });
});


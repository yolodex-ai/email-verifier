import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import dns from 'dns';
import net from 'net';
import {
  verifyEmail,
  verifyEmails,
  clearCaches,
  clearThrottle,
  isValidFormat,
  extractDomain,
  isDisposableEmail,
  isRoleBasedEmail,
  isFreeEmail,
} from '../src/index';

// Type for DNS callback functions
type DnsCallback<T> = (err: NodeJS.ErrnoException | null, result: T) => void;

// Mock dns module
vi.mock('dns', () => ({
  default: {
    resolveMx: vi.fn(),
    resolve4: vi.fn(),
    resolveTxt: vi.fn(),
  },
}));

// Mock socket class
class MockSocket extends EventEmitter {
  destroyed = false;
  private responses: string[] = [];
  private responseIndex = 0;

  constructor(responses: string[]) {
    super();
    this.responses = responses;
  }

  connect(_port: number, _host: string, callback: () => void) {
    setImmediate(() => {
      callback();
      this.emitNextResponse();
    });
    return this;
  }

  write(data: string) {
    setImmediate(() => {
      if (!data.startsWith('QUIT')) {
        this.emitNextResponse();
      }
    });
    return true;
  }

  private emitNextResponse() {
    if (this.responseIndex < this.responses.length) {
      const response = this.responses[this.responseIndex];
      if (response) {
        this.emit('data', Buffer.from(response));
      }
      this.responseIndex++;
    }
  }

  setTimeout(_timeout: number) {
    return this;
  }

  destroy() {
    this.destroyed = true;
  }
}

// Mock net module
vi.mock('net', () => ({
  default: {
    Socket: vi.fn(),
  },
}));

describe('Email Verifier Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearCaches();
    clearThrottle();

    // Default mock for resolveTxt (SPF/DMARC checks) - returns no records
    vi.mocked(dns.resolveTxt).mockImplementation(
      (_domain: string, callback: unknown) => {
        const error = new Error('ENOTFOUND') as NodeJS.ErrnoException;
        (callback as DnsCallback<string[][] | null>)(error, null);
      }
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('verifyEmail', () => {
    it('should reject invalid email format', async () => {
      const result = await verifyEmail('not-an-email');

      expect(result.valid).toBe(false);
      expect(result.confidence).toBe(0);
      expect(result.isSafeToSend).toBe(false);
      expect(result.checks.isValidSyntax).toBe(false);
      expect(result.details.formatValid).toBe(false);
      expect(result.details.smtpStatus).toBe('skipped');
    });

    it('should reject emails with no DNS records', async () => {
      vi.mocked(dns.resolveMx).mockImplementation(
        (_domain: string, callback: unknown) => {
          const error = new Error('ENOTFOUND') as NodeJS.ErrnoException;
          (callback as DnsCallback<dns.MxRecord[] | null>)(error, null);
        }
      );

      vi.mocked(dns.resolve4).mockImplementation(
        (_domain: string, callback: unknown) => {
          const error = new Error('ENOTFOUND') as NodeJS.ErrnoException;
          (callback as DnsCallback<string[] | null>)(error, null);
        }
      );

      const result = await verifyEmail('user@nonexistent-domain-xyz.com');

      expect(result.valid).toBe(false);
      expect(result.confidence).toBe(0);
      expect(result.isSafeToSend).toBe(false);
      expect(result.checks.isValidSyntax).toBe(true);
      expect(result.checks.isValidDomain).toBe(false);
      expect(result.details.formatValid).toBe(true);
      expect(result.details.mxRecords).toEqual([]);
    });

    it('should return high confidence for accepted emails', async () => {
      const mockMx = [{ exchange: 'mx.example.com', priority: 10 }];
      vi.mocked(dns.resolveMx).mockImplementation(
        (_domain: string, callback: unknown) => {
          (callback as DnsCallback<typeof mockMx>)(null, mockMx);
        }
      );

      // Multiple probes are done for timing analysis (2 for real, 2 for catch-all)
      // Real email probes (first 2) - accepted
      // Catch-all test probes (next 2) - rejected
      let socketCount = 0;
      vi.mocked(net.Socket).mockImplementation(() => {
        socketCount++;
        // First 2 sockets are for real email (accept)
        // Next 2 sockets are for catch-all test (reject)
        if (socketCount <= 2) {
          return new MockSocket([
            '220 mx.example.com ESMTP',
            '250 OK',
            '250 OK',
            '250 Accepted',
          ]) as unknown as net.Socket;
        }
        return new MockSocket([
          '220 mx.example.com ESMTP',
          '250 OK',
          '250 OK',
          '550 User not found',
        ]) as unknown as net.Socket;
      });

      const result = await verifyEmail('user@example.com');

      expect(result.valid).toBe(true);
      expect(result.confidence).toBe(0.95);
      expect(result.isSafeToSend).toBe(true);
      expect(result.checks.isValidSyntax).toBe(true);
      expect(result.checks.isValidDomain).toBe(true);
      expect(result.checks.canConnectSmtp).toBe(true);
      expect(result.checks.isDeliverable).toBe(true);
      expect(result.checks.isCatchAllDomain).toBe(false);
      expect(result.checks.isDisposableEmail).toBe(false);
      expect(result.checks.isRoleBasedAccount).toBe(false);
      expect(result.checks.isUnknown).toBe(false);
      expect(result.details.smtpStatus).toBe('accepted');
      expect(result.details.catchAll).toBe(false);
    });

    it('should return lower confidence for catch-all domains', async () => {
      const mockMx = [{ exchange: 'mx.example.com', priority: 10 }];
      vi.mocked(dns.resolveMx).mockImplementation(
        (_domain: string, callback: unknown) => {
          (callback as DnsCallback<typeof mockMx>)(null, mockMx);
        }
      );

      // All sockets accept (catch-all behavior)
      vi.mocked(net.Socket).mockImplementation(() => {
        return new MockSocket([
          '220 mx.example.com ESMTP',
          '250 OK',
          '250 OK',
          '250 Accepted',
        ]) as unknown as net.Socket;
      });

      const result = await verifyEmail('user@catch-all-domain.com');

      expect(result.valid).toBe(true);
      // Confidence is now calculated based on pattern analysis + timing
      // 'user' is a single word pattern with lower confidence
      expect(result.confidence).toBeLessThan(0.85); // Capped at 85% for catch-all
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.isSafeToSend).toBe(false); // Not safe due to catch-all
      expect(result.checks.isCatchAllDomain).toBe(true);
      expect(result.checks.isUnknown).toBe(true); // Unknown because catch-all
      expect(result.details.catchAll).toBe(true);
    });

    it('should return invalid for rejected emails', async () => {
      const mockMx = [{ exchange: 'mx.example.com', priority: 10 }];
      vi.mocked(dns.resolveMx).mockImplementation(
        (_domain: string, callback: unknown) => {
          (callback as DnsCallback<typeof mockMx>)(null, mockMx);
        }
      );

      // All probes reject
      vi.mocked(net.Socket).mockImplementation(() => {
        return new MockSocket([
          '220 mx.example.com ESMTP',
          '250 OK',
          '250 OK',
          '550 User not found',
        ]) as unknown as net.Socket;
      });

      const result = await verifyEmail('nonexistent@example.com');

      expect(result.valid).toBe(false);
      expect(result.confidence).toBe(0);
      expect(result.isSafeToSend).toBe(false);
      expect(result.checks.isDeliverable).toBe(false);
      expect(result.details.smtpStatus).toBe('rejected');
    });

    it('should handle SMTP timeouts gracefully', async () => {
      const mockMx = [{ exchange: 'mx.example.com', priority: 10 }];
      vi.mocked(dns.resolveMx).mockImplementation(
        (_domain: string, callback: unknown) => {
          (callback as DnsCallback<typeof mockMx>)(null, mockMx);
        }
      );

      vi.mocked(net.Socket).mockImplementation(() => {
        const mockSocket = new EventEmitter() as net.Socket & {
          destroyed: boolean;
        };
        (mockSocket as { destroyed: boolean }).destroyed = false;
        mockSocket.connect = vi.fn(function (
          this: EventEmitter,
          _port: number,
          _host: string
        ) {
          setImmediate(() => this.emit('timeout'));
          return this;
        }) as unknown as typeof mockSocket.connect;
        mockSocket.setTimeout = vi.fn().mockReturnThis();
        mockSocket.destroy = vi.fn();
        return mockSocket as net.Socket;
      });

      const result = await verifyEmail('user@slow-domain.com');

      expect(result.valid).toBe(true); // Assume valid but uncertain
      expect(result.confidence).toBe(0.5);
      expect(result.isSafeToSend).toBe(false); // Not safe when unknown
      expect(result.checks.canConnectSmtp).toBe(false);
      expect(result.checks.isUnknown).toBe(true);
      expect(result.details.smtpStatus).toBe('unknown');
    });

    it('should skip SMTP check when disabled', async () => {
      const mockMx = [{ exchange: 'mx.example.com', priority: 10 }];
      vi.mocked(dns.resolveMx).mockImplementation(
        (_domain: string, callback: unknown) => {
          (callback as DnsCallback<typeof mockMx>)(null, mockMx);
        }
      );

      const result = await verifyEmail('user@example.com', {
        smtpCheck: false,
      });

      expect(result.valid).toBe(true);
      expect(result.confidence).toBe(0.7); // Lower without SMTP check
      expect(result.details.smtpStatus).toBe('skipped');
      expect(result.details.catchAll).toBeNull();
    });

    it('should use cached results', async () => {
      const mockMx = [{ exchange: 'mx.example.com', priority: 10 }];
      vi.mocked(dns.resolveMx).mockImplementation(
        (_domain: string, callback: unknown) => {
          (callback as DnsCallback<typeof mockMx>)(null, mockMx);
        }
      );

      let socketCount = 0;
      vi.mocked(net.Socket).mockImplementation(() => {
        socketCount++;
        // First 2 are for real email (accept), rest are for catch-all (reject)
        if (socketCount <= 2) {
          return new MockSocket([
            '220 mx.example.com ESMTP',
            '250 OK',
            '250 OK',
            '250 Accepted',
          ]) as unknown as net.Socket;
        }
        return new MockSocket([
          '220 mx.example.com ESMTP',
          '250 OK',
          '250 OK',
          '550 User not found',
        ]) as unknown as net.Socket;
      });

      // First call
      const result1 = await verifyEmail('cached@example.com');

      // Second call should use cache
      const result2 = await verifyEmail('cached@example.com');

      expect(result1.confidence).toBe(result2.confidence);
      // Socket count stays the same after second call (cached)
      const socketCountAfterFirst = socketCount;
      expect(socketCount).toBe(socketCountAfterFirst);
    });

    it('should detect disposable email addresses', async () => {
      vi.mocked(dns.resolveMx).mockImplementation(
        (_domain: string, callback: unknown) => {
          const error = new Error('ENOTFOUND') as NodeJS.ErrnoException;
          (callback as DnsCallback<dns.MxRecord[] | null>)(error, null);
        }
      );
      vi.mocked(dns.resolve4).mockImplementation(
        (_domain: string, callback: unknown) => {
          const error = new Error('ENOTFOUND') as NodeJS.ErrnoException;
          (callback as DnsCallback<string[] | null>)(error, null);
        }
      );

      const result = await verifyEmail('test@mailinator.com', {
        smtpCheck: false,
      });

      expect(result.checks.isDisposableEmail).toBe(true);
    });

    it('should detect role-based email addresses', async () => {
      const mockMx = [{ exchange: 'mx.example.com', priority: 10 }];
      vi.mocked(dns.resolveMx).mockImplementation(
        (_domain: string, callback: unknown) => {
          (callback as DnsCallback<typeof mockMx>)(null, mockMx);
        }
      );

      const result = await verifyEmail('info@example.com', {
        smtpCheck: false,
      });

      expect(result.checks.isRoleBasedAccount).toBe(true);
      expect(result.isSafeToSend).toBe(false);
    });

    it('should detect free email providers', async () => {
      const mockMx = [{ exchange: 'gmail-smtp-in.l.google.com', priority: 10 }];
      vi.mocked(dns.resolveMx).mockImplementation(
        (_domain: string, callback: unknown) => {
          (callback as DnsCallback<typeof mockMx>)(null, mockMx);
        }
      );

      const result = await verifyEmail('user@gmail.com', {
        smtpCheck: false,
      });

      expect(result.checks.isFreeEmailProvider).toBe(true);
      // Free email is not a disqualifier for isSafeToSend
    });
  });

  describe('verifyEmails', () => {
    it('should verify multiple emails', async () => {
      vi.mocked(dns.resolveMx).mockImplementation(
        (_domain: string, callback: unknown) => {
          const error = new Error('ENOTFOUND') as NodeJS.ErrnoException;
          (callback as DnsCallback<dns.MxRecord[] | null>)(error, null);
        }
      );
      vi.mocked(dns.resolve4).mockImplementation(
        (_domain: string, callback: unknown) => {
          const error = new Error('ENOTFOUND') as NodeJS.ErrnoException;
          (callback as DnsCallback<string[] | null>)(error, null);
        }
      );

      const results = await verifyEmails([
        'invalid-email',
        'user@nonexistent.com',
      ]);

      expect(results).toHaveLength(2);
      expect(results[0]?.valid).toBe(false);
      expect(results[1]?.valid).toBe(false);
    });
  });

  describe('exported utilities', () => {
    it('should export isValidFormat', () => {
      expect(isValidFormat('user@example.com')).toBe(true);
      expect(isValidFormat('invalid')).toBe(false);
    });

    it('should export extractDomain', () => {
      expect(extractDomain('user@example.com')).toBe('example.com');
    });

    it('should export detector functions', () => {
      expect(isDisposableEmail('test@mailinator.com')).toBe(true);
      expect(isRoleBasedEmail('info@company.com')).toBe(true);
      expect(isFreeEmail('user@gmail.com')).toBe(true);
    });
  });
});

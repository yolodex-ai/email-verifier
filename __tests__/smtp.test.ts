import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import net from 'net';
import { smtpProbe, probeWithFallback } from '../src/validators/smtp';

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
      // Emit banner
      this.emitNextResponse();
    });
    return this;
  }

  write(data: string) {
    // Simulate receiving response to command
    setImmediate(() => {
      if (!data.startsWith('QUIT')) {
        this.emitNextResponse();
      }
    });
    return true;
  }

  private emitNextResponse() {
    if (this.responseIndex < this.responses.length) {
      this.emit('data', Buffer.from(this.responses[this.responseIndex]));
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

// Mock the net module
vi.mock('net', () => ({
  default: {
    Socket: vi.fn(),
  },
}));

describe('SMTP Validators', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('smtpProbe', () => {
    it('should return accepted for 250 response to RCPT TO', async () => {
      const responses = [
        '220 mx.example.com ESMTP ready',
        '250-mx.example.com Hello',
        '250 OK',
        '250 Accepted',
      ];

      vi.mocked(net.Socket).mockImplementation(() => new MockSocket(responses) as unknown as net.Socket);

      const result = await smtpProbe({
        host: 'mx.example.com',
        recipientEmail: 'user@example.com',
      });

      expect(result.status).toBe('accepted');
      expect(result.responseCode).toBe(250);
    });

    it('should return rejected for 550 response to RCPT TO', async () => {
      const responses = [
        '220 mx.example.com ESMTP ready',
        '250-mx.example.com Hello',
        '250 OK',
        '550 User not found',
      ];

      vi.mocked(net.Socket).mockImplementation(() => new MockSocket(responses) as unknown as net.Socket);

      const result = await smtpProbe({
        host: 'mx.example.com',
        recipientEmail: 'nonexistent@example.com',
      });

      expect(result.status).toBe('rejected');
      expect(result.responseCode).toBe(550);
    });

    it('should return unknown for 4xx response', async () => {
      const responses = [
        '220 mx.example.com ESMTP ready',
        '250-mx.example.com Hello',
        '250 OK',
        '451 Temporary failure',
      ];

      vi.mocked(net.Socket).mockImplementation(() => new MockSocket(responses) as unknown as net.Socket);

      const result = await smtpProbe({
        host: 'mx.example.com',
        recipientEmail: 'user@example.com',
      });

      expect(result.status).toBe('unknown');
      expect(result.responseCode).toBe(451);
    });

    it('should return unknown on connection timeout', async () => {
      const mockSocket = new EventEmitter() as net.Socket;
      mockSocket.destroyed = false;
      mockSocket.connect = vi.fn(function(this: EventEmitter, _port: number, _host: string) {
        // Simulate timeout
        setImmediate(() => this.emit('timeout'));
        return this;
      }) as unknown as typeof mockSocket.connect;
      mockSocket.setTimeout = vi.fn().mockReturnThis();
      mockSocket.destroy = vi.fn();

      vi.mocked(net.Socket).mockImplementation(() => mockSocket);

      const result = await smtpProbe({
        host: 'slow.example.com',
        recipientEmail: 'user@example.com',
        timeout: 100,
      });

      expect(result.status).toBe('unknown');
      expect(result.responseMessage).toBe('Connection timeout');
    });

    it('should return unknown on connection error', async () => {
      const mockSocket = new EventEmitter() as net.Socket;
      mockSocket.destroyed = false;
      mockSocket.connect = vi.fn(function(this: EventEmitter, _port: number, _host: string) {
        setImmediate(() => this.emit('error', new Error('Connection refused')));
        return this;
      }) as unknown as typeof mockSocket.connect;
      mockSocket.setTimeout = vi.fn().mockReturnThis();
      mockSocket.destroy = vi.fn();

      vi.mocked(net.Socket).mockImplementation(() => mockSocket);

      const result = await smtpProbe({
        host: 'unreachable.example.com',
        recipientEmail: 'user@example.com',
      });

      expect(result.status).toBe('unknown');
      expect(result.responseMessage).toBe('Connection refused');
    });

    it('should handle 553 rejection', async () => {
      const responses = [
        '220 mx.example.com ESMTP ready',
        '250-mx.example.com Hello',
        '250 OK',
        '553 Mailbox name not allowed',
      ];

      vi.mocked(net.Socket).mockImplementation(() => new MockSocket(responses) as unknown as net.Socket);

      const result = await smtpProbe({
        host: 'mx.example.com',
        recipientEmail: 'invalid@example.com',
      });

      expect(result.status).toBe('rejected');
      expect(result.responseCode).toBe(553);
    });
  });

  describe('probeWithFallback', () => {
    it('should try multiple hosts until one responds with definitive answer', async () => {
      let hostIndex = 0;

      vi.mocked(net.Socket).mockImplementation(() => {
        // First host times out, second accepts
        if (hostIndex++ === 0) {
          const mockSocket = new EventEmitter() as net.Socket;
          mockSocket.destroyed = false;
          mockSocket.connect = vi.fn(function(this: EventEmitter, _port: number, _host: string) {
            setImmediate(() => this.emit('timeout'));
            return this;
          }) as unknown as typeof mockSocket.connect;
          mockSocket.setTimeout = vi.fn().mockReturnThis();
          mockSocket.destroy = vi.fn();
          return mockSocket;
        }

        const responses = [
          '220 mx2.example.com ESMTP ready',
          '250 OK',
          '250 OK',
          '250 Accepted',
        ];
        return new MockSocket(responses) as unknown as net.Socket;
      });

      const result = await probeWithFallback(
        ['mx1.example.com', 'mx2.example.com'],
        'user@example.com'
      );

      expect(result.status).toBe('accepted');
    });

    it('should return unknown if all hosts fail', async () => {
      vi.mocked(net.Socket).mockImplementation(() => {
        const mockSocket = new EventEmitter() as net.Socket;
        mockSocket.destroyed = false;
        mockSocket.connect = vi.fn(function(this: EventEmitter, _port: number, _host: string) {
          setImmediate(() => this.emit('timeout'));
          return this;
        }) as unknown as typeof mockSocket.connect;
        mockSocket.setTimeout = vi.fn().mockReturnThis();
        mockSocket.destroy = vi.fn();
        return mockSocket;
      });

      const result = await probeWithFallback(
        ['mx1.example.com', 'mx2.example.com'],
        'user@example.com'
      );

      expect(result.status).toBe('unknown');
    });

    it('should stop on first rejected response', async () => {
      const responses = [
        '220 mx.example.com ESMTP ready',
        '250 OK',
        '250 OK',
        '550 User not found',
      ];

      vi.mocked(net.Socket).mockImplementation(() => new MockSocket(responses) as unknown as net.Socket);

      const result = await probeWithFallback(
        ['mx1.example.com', 'mx2.example.com'],
        'nonexistent@example.com'
      );

      expect(result.status).toBe('rejected');
      // Should have only tried first host
    });
  });
});


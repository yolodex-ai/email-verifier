import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "events";
import dns from "dns";
import net from "net";
import {
  verifyEmail,
  verifyEmails,
  clearCaches,
  clearThrottle,
  isValidFormat,
  extractDomain,
} from "../src/index";

// Mock dns module
vi.mock("dns", () => ({
  default: {
    resolveMx: vi.fn(),
    resolve4: vi.fn(),
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
      if (!data.startsWith("QUIT")) {
        this.emitNextResponse();
      }
    });
    return true;
  }

  private emitNextResponse() {
    if (this.responseIndex < this.responses.length) {
      this.emit("data", Buffer.from(this.responses[this.responseIndex]));
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
vi.mock("net", () => ({
  default: {
    Socket: vi.fn(),
  },
}));

describe("Email Verifier Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearCaches();
    clearThrottle();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("verifyEmail", () => {
    it("should reject invalid email format", async () => {
      const result = await verifyEmail("not-an-email");

      expect(result.valid).toBe(false);
      expect(result.confidence).toBe(0);
      expect(result.details.formatValid).toBe(false);
      expect(result.details.smtpStatus).toBe("skipped");
    });

    it("should reject emails with no DNS records", async () => {
      vi.mocked(dns.resolveMx).mockImplementation((_domain, callback) => {
        (callback as Function)(new Error("ENOTFOUND"), null);
      });

      vi.mocked(dns.resolve4).mockImplementation((_domain, callback) => {
        (callback as Function)(new Error("ENOTFOUND"), null);
      });

      const result = await verifyEmail("user@nonexistent-domain-xyz.com");

      expect(result.valid).toBe(false);
      expect(result.confidence).toBe(0);
      expect(result.details.formatValid).toBe(true);
      expect(result.details.mxRecords).toEqual([]);
    });

    it("should return high confidence for accepted emails", async () => {
      const mockMx = [{ exchange: "mx.example.com", priority: 10 }];
      vi.mocked(dns.resolveMx).mockImplementation((_domain, callback) => {
        (callback as Function)(null, mockMx);
      });

      // First socket for main email - accepts
      // Second socket for catch-all test - rejects
      let socketCount = 0;
      vi.mocked(net.Socket).mockImplementation(() => {
        socketCount++;
        if (socketCount === 1) {
          // Main email - accepted
          return new MockSocket([
            "220 mx.example.com ESMTP",
            "250 OK",
            "250 OK",
            "250 Accepted",
          ]) as unknown as net.Socket;
        }
        // Catch-all test - rejected
        return new MockSocket([
          "220 mx.example.com ESMTP",
          "250 OK",
          "250 OK",
          "550 User not found",
        ]) as unknown as net.Socket;
      });

      const result = await verifyEmail("user@example.com");

      expect(result.valid).toBe(true);
      expect(result.confidence).toBe(0.95);
      expect(result.details.smtpStatus).toBe("accepted");
      expect(result.details.catchAll).toBe(false);
    });

    it("should return lower confidence for catch-all domains", async () => {
      const mockMx = [{ exchange: "mx.example.com", priority: 10 }];
      vi.mocked(dns.resolveMx).mockImplementation((_domain, callback) => {
        (callback as Function)(null, mockMx);
      });

      // Both sockets accept (catch-all)
      vi.mocked(net.Socket).mockImplementation(() => {
        return new MockSocket([
          "220 mx.example.com ESMTP",
          "250 OK",
          "250 OK",
          "250 Accepted",
        ]) as unknown as net.Socket;
      });

      const result = await verifyEmail("user@catch-all-domain.com");

      expect(result.valid).toBe(true);
      expect(result.confidence).toBe(0.6); // Lower due to catch-all
      expect(result.details.catchAll).toBe(true);
    });

    it("should return invalid for rejected emails", async () => {
      const mockMx = [{ exchange: "mx.example.com", priority: 10 }];
      vi.mocked(dns.resolveMx).mockImplementation((_domain, callback) => {
        (callback as Function)(null, mockMx);
      });

      vi.mocked(net.Socket).mockImplementation(() => {
        return new MockSocket([
          "220 mx.example.com ESMTP",
          "250 OK",
          "250 OK",
          "550 User not found",
        ]) as unknown as net.Socket;
      });

      const result = await verifyEmail("nonexistent@example.com");

      expect(result.valid).toBe(false);
      expect(result.confidence).toBe(0);
      expect(result.details.smtpStatus).toBe("rejected");
    });

    it("should handle SMTP timeouts gracefully", async () => {
      const mockMx = [{ exchange: "mx.example.com", priority: 10 }];
      vi.mocked(dns.resolveMx).mockImplementation((_domain, callback) => {
        (callback as Function)(null, mockMx);
      });

      vi.mocked(net.Socket).mockImplementation(() => {
        const mockSocket = new EventEmitter() as net.Socket;
        mockSocket.destroyed = false;
        mockSocket.connect = vi.fn(function (
          this: EventEmitter,
          _port: number,
          _host: string
        ) {
          setImmediate(() => this.emit("timeout"));
          return this;
        }) as unknown as typeof mockSocket.connect;
        mockSocket.setTimeout = vi.fn().mockReturnThis();
        mockSocket.destroy = vi.fn();
        return mockSocket;
      });

      const result = await verifyEmail("user@slow-domain.com");

      expect(result.valid).toBe(true); // Assume valid but uncertain
      expect(result.confidence).toBe(0.5);
      expect(result.details.smtpStatus).toBe("unknown");
    });

    it("should skip SMTP check when disabled", async () => {
      const mockMx = [{ exchange: "mx.example.com", priority: 10 }];
      vi.mocked(dns.resolveMx).mockImplementation((_domain, callback) => {
        (callback as Function)(null, mockMx);
      });

      const result = await verifyEmail("user@example.com", {
        smtpCheck: false,
      });

      expect(result.valid).toBe(true);
      expect(result.confidence).toBe(0.7); // Lower without SMTP check
      expect(result.details.smtpStatus).toBe("skipped");
      expect(result.details.catchAll).toBeNull();
    });

    it("should use cached results", async () => {
      const mockMx = [{ exchange: "mx.example.com", priority: 10 }];
      vi.mocked(dns.resolveMx).mockImplementation((_domain, callback) => {
        (callback as Function)(null, mockMx);
      });

      let socketCount = 0;
      vi.mocked(net.Socket).mockImplementation(() => {
        socketCount++;
        return new MockSocket([
          "220 mx.example.com ESMTP",
          "250 OK",
          "250 OK",
          socketCount === 1 ? "250 Accepted" : "550 User not found",
        ]) as unknown as net.Socket;
      });

      // First call
      const result1 = await verifyEmail("cached@example.com");

      // Second call should use cache
      const result2 = await verifyEmail("cached@example.com");

      expect(result1.confidence).toBe(result2.confidence);
      // Socket should only have been created for first call (+ catch-all check)
      expect(socketCount).toBeLessThanOrEqual(2);
    });
  });

  describe("verifyEmails", () => {
    it("should verify multiple emails", async () => {
      vi.mocked(dns.resolveMx).mockImplementation((_domain, callback) => {
        (callback as Function)(new Error("ENOTFOUND"), null);
      });
      vi.mocked(dns.resolve4).mockImplementation((_domain, callback) => {
        (callback as Function)(new Error("ENOTFOUND"), null);
      });

      const results = await verifyEmails([
        "invalid-email",
        "user@nonexistent.com",
      ]);

      expect(results).toHaveLength(2);
      expect(results[0].valid).toBe(false);
      expect(results[1].valid).toBe(false);
    });
  });

  describe("exported utilities", () => {
    it("should export isValidFormat", () => {
      expect(isValidFormat("user@example.com")).toBe(true);
      expect(isValidFormat("invalid")).toBe(false);
    });

    it("should export extractDomain", () => {
      expect(extractDomain("user@example.com")).toBe("example.com");
    });
  });
});

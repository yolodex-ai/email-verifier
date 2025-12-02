/**
 * Rate limiting and throttling for SMTP connections
 * 
 * Implements a token bucket algorithm with exponential backoff
 * to avoid overwhelming mail servers.
 */

import type { ThrottleState } from './types';

/**
 * Default configuration for throttling
 */
const DEFAULT_CONFIG = {
  /** Maximum tokens (requests) per host */
  maxTokens: 10,
  /** Token refill rate (tokens per second) */
  refillRate: 1,
  /** Initial backoff duration in ms after failure */
  initialBackoff: 5000,
  /** Maximum backoff duration in ms */
  maxBackoff: 300000, // 5 minutes
  /** Backoff multiplier for each consecutive failure */
  backoffMultiplier: 2,
  /** Number of failures before triggering backoff */
  failureThreshold: 3,
};

export type ThrottleConfig = typeof DEFAULT_CONFIG;

/**
 * Throttle manager for rate limiting SMTP connections per host
 * 
 * Uses a token bucket algorithm to limit the rate of connections,
 * and exponential backoff when encountering failures.
 * 
 * @example
 * ```ts
 * const throttle = new Throttle();
 * 
 * if (await throttle.canProceed('mx.example.com')) {
 *   // Make SMTP connection
 *   throttle.recordSuccess('mx.example.com');
 * } else {
 *   // Wait or skip
 * }
 * ```
 */
export class Throttle {
  private states: Map<string, ThrottleState> = new Map();
  private config: ThrottleConfig;

  /**
   * Creates a new throttle manager
   * 
   * @param config - Optional configuration overrides
   */
  constructor(config: Partial<ThrottleConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Gets or creates the throttle state for a host
   */
  private getState(host: string): ThrottleState {
    const key = host.toLowerCase();
    let state = this.states.get(key);

    if (!state) {
      state = {
        tokens: this.config.maxTokens,
        lastRefill: Date.now(),
        failureCount: 0,
        backoffUntil: 0,
      };
      this.states.set(key, state);
    }

    return state;
  }

  /**
   * Refills tokens based on time elapsed
   */
  private refillTokens(state: ThrottleState): void {
    const now = Date.now();
    const elapsed = (now - state.lastRefill) / 1000; // seconds
    const tokensToAdd = elapsed * this.config.refillRate;

    state.tokens = Math.min(
      this.config.maxTokens,
      state.tokens + tokensToAdd
    );
    state.lastRefill = now;
  }

  /**
   * Checks if a request can proceed for a given host
   * 
   * @param host - The MX hostname
   * @returns true if the request can proceed, false if it should wait
   */
  canProceed(host: string): boolean {
    const state = this.getState(host);
    const now = Date.now();

    // Check if in backoff period
    if (now < state.backoffUntil) {
      return false;
    }

    // Refill tokens
    this.refillTokens(state);

    // Check if we have tokens
    return state.tokens >= 1;
  }

  /**
   * Consumes a token for a host (call before making request)
   * 
   * @param host - The MX hostname
   * @returns true if token was consumed, false if no tokens available
   */
  consume(host: string): boolean {
    const state = this.getState(host);
    this.refillTokens(state);

    if (state.tokens >= 1) {
      state.tokens -= 1;
      return true;
    }

    return false;
  }

  /**
   * Records a successful request (resets failure count)
   * 
   * @param host - The MX hostname
   */
  recordSuccess(host: string): void {
    const state = this.getState(host);
    state.failureCount = 0;
    state.backoffUntil = 0;
  }

  /**
   * Records a failed request (may trigger backoff)
   * 
   * @param host - The MX hostname
   */
  recordFailure(host: string): void {
    const state = this.getState(host);
    state.failureCount++;

    // Trigger backoff after threshold
    if (state.failureCount >= this.config.failureThreshold) {
      const backoffTime = Math.min(
        this.config.initialBackoff * Math.pow(
          this.config.backoffMultiplier,
          state.failureCount - this.config.failureThreshold
        ),
        this.config.maxBackoff
      );
      state.backoffUntil = Date.now() + backoffTime;
    }
  }

  /**
   * Gets the time until a host can be accessed (in ms)
   * 
   * @param host - The MX hostname
   * @returns Time in milliseconds until host can be accessed, 0 if ready
   */
  getWaitTime(host: string): number {
    const state = this.getState(host);
    const now = Date.now();

    // If in backoff, return backoff time
    if (now < state.backoffUntil) {
      return state.backoffUntil - now;
    }

    // Refill and check tokens
    this.refillTokens(state);

    if (state.tokens >= 1) {
      return 0;
    }

    // Calculate time until next token
    const tokensNeeded = 1 - state.tokens;
    return Math.ceil((tokensNeeded / this.config.refillRate) * 1000);
  }

  /**
   * Waits until a request can proceed for a host
   * 
   * @param host - The MX hostname
   * @param maxWait - Maximum time to wait in ms (default: 60000)
   * @returns true if ready to proceed, false if max wait exceeded
   */
  async waitForAccess(host: string, maxWait: number = 60000): Promise<boolean> {
    const waitTime = this.getWaitTime(host);

    if (waitTime === 0) {
      return true;
    }

    if (waitTime > maxWait) {
      return false;
    }

    await new Promise((resolve) => setTimeout(resolve, waitTime));
    return this.canProceed(host);
  }

  /**
   * Resets throttle state for a host
   * 
   * @param host - The MX hostname
   */
  reset(host: string): void {
    this.states.delete(host.toLowerCase());
  }

  /**
   * Clears all throttle states
   */
  clear(): void {
    this.states.clear();
  }

  /**
   * Gets the current failure count for a host
   * 
   * @param host - The MX hostname
   * @returns The number of consecutive failures
   */
  getFailureCount(host: string): number {
    const state = this.getState(host);
    return state.failureCount;
  }

  /**
   * Checks if a host is currently in backoff
   * 
   * @param host - The MX hostname
   * @returns true if the host is in backoff period
   */
  isInBackoff(host: string): boolean {
    const state = this.getState(host);
    return Date.now() < state.backoffUntil;
  }
}

/**
 * Global throttle instance for SMTP connections
 */
export const smtpThrottle = new Throttle();



/**
 * SMTP validation for email verification
 *
 * Connects to the mail server and performs an SMTP handshake
 * to verify if the mailbox exists without actually sending email.
 */

import net from 'net';
import type { SmtpResult, SmtpStatus } from '../types';

/**
 * Default SMTP port
 */
const DEFAULT_SMTP_PORT = 25;

/**
 * Default connection timeout (10 seconds)
 */
const DEFAULT_TIMEOUT = 10000;

/**
 * Default sender email for MAIL FROM command
 */
const DEFAULT_SENDER = 'test@example.com';

/**
 * SMTP response code categories
 */
const RESPONSE_CODES = {
  SUCCESS: 2,      // 2xx - success
  TEMPORARY: 4,    // 4xx - temporary failure
  PERMANENT: 5,    // 5xx - permanent failure
} as const;

/**
 * Detailed timing for each SMTP stage
 */
export interface SmtpTiming {
  /** Time to establish TCP connection (ms) */
  connect: number;
  /** Time for banner response (ms) */
  banner: number;
  /** Time for EHLO/HELO response (ms) */
  ehlo: number;
  /** Time for MAIL FROM response (ms) */
  mailFrom: number;
  /** Time for RCPT TO response (ms) */
  rcptTo: number;
  /** Total time for entire probe (ms) */
  total: number;
}

/**
 * Extended SMTP result with detailed timing
 */
export interface SmtpResultWithTiming extends SmtpResult {
  /** Detailed timing for each stage */
  timing?: SmtpTiming;
}

/**
 * Parses an SMTP response code from a response line
 *
 * @param response - The SMTP response line
 * @returns The numeric response code, or null if invalid
 */
function parseResponseCode(response: string): number | null {
  const match = response.match(/^(\d{3})/);
  const code = match?.[1];
  return code ? parseInt(code, 10) : null;
}

/**
 * Gets the category of an SMTP response code
 *
 * @param code - The SMTP response code
 * @returns The category (2, 4, or 5) or null if invalid
 */
function getResponseCategory(code: number): number | null {
  const category = Math.floor(code / 100);
  return [2, 4, 5].includes(category) ? category : null;
}

/**
 * Converts an SMTP response code to a status
 *
 * @param code - The SMTP response code
 * @returns The corresponding SmtpStatus
 */
function codeToStatus(code: number | null): SmtpStatus {
  if (code === null) return 'unknown';

  const category = getResponseCategory(code);

  switch (category) {
    case RESPONSE_CODES.SUCCESS:
      return 'accepted';
    case RESPONSE_CODES.PERMANENT:
      return 'rejected';
    case RESPONSE_CODES.TEMPORARY:
    default:
      return 'unknown';
  }
}

/**
 * Creates a promise that sends a command and waits for response
 */
function sendCommand(
  socket: net.Socket,
  command: string,
  timeout: number
): Promise<{ code: number | null; message: string }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('SMTP timeout'));
    }, timeout);

    const onData = (data: Buffer) => {
      clearTimeout(timer);
      socket.removeListener('data', onData);
      socket.removeListener('error', onError);

      const response = data.toString();
      const code = parseResponseCode(response);
      resolve({ code, message: response.trim() });
    };

    const onError = (err: Error) => {
      clearTimeout(timer);
      socket.removeListener('data', onData);
      reject(err);
    };

    socket.once('data', onData);
    socket.once('error', onError);

    if (command) {
      socket.write(command + '\r\n');
    }
  });
}

/**
 * Waits for the initial SMTP banner
 */
function waitForBanner(
  socket: net.Socket,
  timeout: number
): Promise<{ code: number | null; message: string }> {
  return sendCommand(socket, '', timeout);
}

/**
 * Options for SMTP probe
 */
export interface SmtpProbeOptions {
  /** The MX host to connect to */
  host: string;
  /** The port to connect to (default: 25) */
  port?: number;
  /** Connection timeout in milliseconds (default: 10000) */
  timeout?: number;
  /** The sender email address for MAIL FROM (default: test@example.com) */
  senderEmail?: string;
  /** The recipient email address to verify */
  recipientEmail: string;
  /** Whether to collect detailed timing (default: false) */
  collectTiming?: boolean;
}

/**
 * Performs an SMTP probe to verify if an email address exists
 *
 * The probe performs the following steps:
 * 1. Connect to the MX server
 * 2. Receive the banner (220)
 * 3. Send EHLO
 * 4. Send MAIL FROM
 * 5. Send RCPT TO (the actual verification)
 * 6. Send QUIT
 *
 * @param options - The probe options
 * @returns SmtpResult with the verification status
 *
 * @example
 * ```ts
 * const result = await smtpProbe({
 *   host: 'mx.example.com',
 *   recipientEmail: 'user@example.com',
 * });
 *
 * if (result.status === 'accepted') {
 *   console.log('Email exists!');
 * }
 * ```
 */
export async function smtpProbe(options: SmtpProbeOptions): Promise<SmtpResultWithTiming> {
  const {
    host,
    port = DEFAULT_SMTP_PORT,
    timeout = DEFAULT_TIMEOUT,
    senderEmail = DEFAULT_SENDER,
    recipientEmail,
    collectTiming = false,
  } = options;

  const startTime = Date.now();
  const timing: SmtpTiming = {
    connect: 0,
    banner: 0,
    ehlo: 0,
    mailFrom: 0,
    rcptTo: 0,
    total: 0,
  };

  return new Promise((resolve) => {
    const socket = new net.Socket();
    let resolved = false;
    let connectTime = 0;

    const cleanup = () => {
      if (!socket.destroyed) {
        socket.destroy();
      }
    };

    const resolveOnce = (result: SmtpResultWithTiming) => {
      if (!resolved) {
        resolved = true;
        cleanup();
        // Add total time
        timing.total = Date.now() - startTime;
        result.responseTime = timing.total;
        if (collectTiming) {
          result.timing = timing;
        }
        resolve(result);
      }
    };

    // Set up timeout
    socket.setTimeout(timeout);

    socket.on('timeout', () => {
      resolveOnce({
        status: 'unknown',
        responseMessage: 'Connection timeout',
      });
    });

    socket.on('error', (err) => {
      resolveOnce({
        status: 'unknown',
        responseMessage: err.message,
      });
    });

    socket.connect(port, host, async () => {
      connectTime = Date.now();
      timing.connect = connectTime - startTime;

      try {
        // Wait for banner
        const bannerStart = Date.now();
        const banner = await waitForBanner(socket, timeout);
        timing.banner = Date.now() - bannerStart;

        if (banner.code === null || getResponseCategory(banner.code) !== RESPONSE_CODES.SUCCESS) {
          resolveOnce({
            status: 'unknown',
            responseCode: banner.code ?? undefined,
            responseMessage: banner.message,
          });
          return;
        }

        // Send EHLO
        const ehloStart = Date.now();
        const ehlo = await sendCommand(socket, `EHLO ${senderEmail.split('@')[1] || 'localhost'}`, timeout);
        timing.ehlo = Date.now() - ehloStart;

        if (ehlo.code === null || getResponseCategory(ehlo.code) !== RESPONSE_CODES.SUCCESS) {
          // Try HELO as fallback
          const helo = await sendCommand(socket, 'HELO localhost', timeout);
          timing.ehlo = Date.now() - ehloStart;
          if (helo.code === null || getResponseCategory(helo.code) !== RESPONSE_CODES.SUCCESS) {
            resolveOnce({
              status: 'unknown',
              responseCode: helo.code ?? undefined,
              responseMessage: helo.message,
            });
            return;
          }
        }

        // Send MAIL FROM
        const mailFromStart = Date.now();
        const mailFrom = await sendCommand(socket, `MAIL FROM:<${senderEmail}>`, timeout);
        timing.mailFrom = Date.now() - mailFromStart;

        if (mailFrom.code === null || getResponseCategory(mailFrom.code) !== RESPONSE_CODES.SUCCESS) {
          resolveOnce({
            status: 'unknown',
            responseCode: mailFrom.code ?? undefined,
            responseMessage: mailFrom.message,
          });
          return;
        }

        // Send RCPT TO - this is the actual verification
        const rcptToStart = Date.now();
        const rcptTo = await sendCommand(socket, `RCPT TO:<${recipientEmail}>`, timeout);
        timing.rcptTo = Date.now() - rcptToStart;

        const status = codeToStatus(rcptTo.code);

        // Send QUIT (best effort, don't wait)
        try {
          socket.write('QUIT\r\n');
        } catch {
          // Ignore quit errors
        }

        resolveOnce({
          status,
          responseCode: rcptTo.code ?? undefined,
          responseMessage: rcptTo.message,
        });
      } catch (err) {
        resolveOnce({
          status: 'unknown',
          responseMessage: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    });
  });
}

/**
 * Probes multiple MX hosts in order until one responds
 *
 * @param mxHosts - Array of MX hostnames in priority order
 * @param recipientEmail - The email address to verify
 * @param options - Additional options
 * @returns SmtpResult from the first responsive host
 */
export async function probeWithFallback(
  mxHosts: string[],
  recipientEmail: string,
  options: {
    port?: number;
    timeout?: number;
    senderEmail?: string;
    collectTiming?: boolean;
  } = {}
): Promise<SmtpResultWithTiming> {
  for (const host of mxHosts) {
    const result = await smtpProbe({
      host,
      recipientEmail,
      ...options,
    });

    // If we got a definitive answer, return it
    if (result.status === 'accepted' || result.status === 'rejected') {
      return result;
    }

    // If we got unknown, try the next host
    // (might be a temporary failure on this host)
  }

  // All hosts returned unknown
  return {
    status: 'unknown',
    responseMessage: 'All MX hosts returned unknown status',
  };
}

/**
 * Performs multiple SMTP probes and returns timing statistics
 *
 * @param mxHosts - Array of MX hostnames
 * @param recipientEmail - The email to verify
 * @param probeCount - Number of probes to perform (default: 3)
 * @param options - Additional options
 * @returns Result with timing statistics
 */
export async function probeWithTimingStats(
  mxHosts: string[],
  recipientEmail: string,
  probeCount = 3,
  options: {
    port?: number;
    timeout?: number;
    senderEmail?: string;
  } = {}
): Promise<{
  result: SmtpResultWithTiming;
  timings: SmtpTiming[];
  avgRcptToTime: number;
  minRcptToTime: number;
  maxRcptToTime: number;
}> {
  const timings: SmtpTiming[] = [];
  let finalResult: SmtpResultWithTiming | null = null;

  for (let i = 0; i < probeCount; i++) {
    const result = await probeWithFallback(mxHosts, recipientEmail, {
      ...options,
      collectTiming: true,
    });

    if (result.timing) {
      timings.push(result.timing);
    }

    // Keep track of the result
    if (!finalResult || result.status !== 'unknown') {
      finalResult = result;
    }

    // Small delay between probes to avoid rate limiting
    if (i < probeCount - 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  // Calculate statistics
  const rcptToTimes = timings.map((t) => t.rcptTo).filter((t) => t > 0);
  const avgRcptToTime = rcptToTimes.length > 0
    ? rcptToTimes.reduce((a, b) => a + b, 0) / rcptToTimes.length
    : 0;
  const minRcptToTime = rcptToTimes.length > 0 ? Math.min(...rcptToTimes) : 0;
  const maxRcptToTime = rcptToTimes.length > 0 ? Math.max(...rcptToTimes) : 0;

  return {
    result: finalResult || { status: 'unknown', responseMessage: 'No probes completed' },
    timings,
    avgRcptToTime,
    minRcptToTime,
    maxRcptToTime,
  };
}

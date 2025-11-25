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
export async function smtpProbe(options: SmtpProbeOptions): Promise<SmtpResult> {
  const {
    host,
    port = DEFAULT_SMTP_PORT,
    timeout = DEFAULT_TIMEOUT,
    senderEmail = DEFAULT_SENDER,
    recipientEmail,
  } = options;

  return new Promise((resolve) => {
    const socket = new net.Socket();
    let resolved = false;

    const cleanup = () => {
      if (!socket.destroyed) {
        socket.destroy();
      }
    };

    const resolveOnce = (result: SmtpResult) => {
      if (!resolved) {
        resolved = true;
        cleanup();
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
      try {
        // Wait for banner
        const banner = await waitForBanner(socket, timeout);
        if (banner.code === null || getResponseCategory(banner.code) !== RESPONSE_CODES.SUCCESS) {
          resolveOnce({
            status: 'unknown',
            responseCode: banner.code ?? undefined,
            responseMessage: banner.message,
          });
          return;
        }

        // Send EHLO
        const ehlo = await sendCommand(socket, `EHLO ${senderEmail.split('@')[1] || 'localhost'}`, timeout);
        if (ehlo.code === null || getResponseCategory(ehlo.code) !== RESPONSE_CODES.SUCCESS) {
          // Try HELO as fallback
          const helo = await sendCommand(socket, 'HELO localhost', timeout);
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
        const mailFrom = await sendCommand(socket, `MAIL FROM:<${senderEmail}>`, timeout);
        if (mailFrom.code === null || getResponseCategory(mailFrom.code) !== RESPONSE_CODES.SUCCESS) {
          resolveOnce({
            status: 'unknown',
            responseCode: mailFrom.code ?? undefined,
            responseMessage: mailFrom.message,
          });
          return;
        }

        // Send RCPT TO - this is the actual verification
        const rcptTo = await sendCommand(socket, `RCPT TO:<${recipientEmail}>`, timeout);
        
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
  } = {}
): Promise<SmtpResult> {
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


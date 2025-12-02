/**
 * Email Verifier
 *
 * A simple, zero-dependency email verification library with format validation,
 * DNS checking, and SMTP probing.
 */

import type { VerificationResult, VerifyOptions, SmtpStatus, VerificationChecks } from './types';
import { isValidFormat, extractDomain, extractLocalPart, normalizeEmail } from './validators/format';
import { checkDns } from './validators/dns';
import { probeWithFallback } from './validators/smtp';
import { emailCache, dnsCache, emailCacheKey, domainCacheKey } from './cache';
import { smtpThrottle } from './throttle';
import { detectProvider } from './providers';
import { isDisposableEmail } from './detectors/disposable';
import { isRoleBasedEmail } from './detectors/role-based';
import { isFreeEmail } from './detectors/free-provider';

// Re-export types
export type { VerificationResult, VerifyOptions, SmtpStatus, MailProvider, VerificationChecks } from './types';

/**
 * Default options for email verification
 */
const DEFAULT_OPTIONS: Required<VerifyOptions> = {
  dnsTimeout: 5000,
  smtpTimeout: 10000,
  smtpCheck: true,
  catchAllCheck: true,
  senderEmail: 'test@example.com',
  smtpPort: 25,
};

/**
 * Confidence scores for different verification states
 */
const CONFIDENCE = {
  INVALID: 0,
  SMTP_UNKNOWN: 0.5,
  CATCH_ALL: 0.6,
  VERIFIED: 0.95,
};

/**
 * Generates a "corrupted" test email for catch-all detection
 *
 * Prepends "x9x0" to the local part to create an address
 * that shouldn't exist on non-catch-all servers.
 *
 * @param email - The original email address
 * @returns The test email address
 */
function generateCatchAllTestEmail(email: string): string {
  const localPart = extractLocalPart(email);
  const domain = extractDomain(email);

  if (!localPart || !domain) {
    return email;
  }

  return `x9x0${localPart}@${domain}`;
}

/**
 * Creates a default checks object with all false values
 */
function createDefaultChecks(): VerificationChecks {
  return {
    isValidSyntax: false,
    isValidDomain: false,
    canConnectSmtp: false,
    isDeliverable: false,
    isCatchAllDomain: false,
    isDisposableEmail: false,
    isRoleBasedAccount: false,
    isFreeEmailProvider: false,
    isUnknown: true,
  };
}

/**
 * Verifies a single email address
 *
 * Performs the following checks:
 * 1. Format validation (RFC 5322)
 * 2. DNS lookup (MX records, A record fallback)
 * 3. SMTP probe (RCPT TO verification)
 * 4. Catch-all detection (optional)
 * 5. Disposable email detection
 * 6. Role-based account detection
 * 7. Free email provider detection
 *
 * @param email - The email address to verify
 * @param options - Optional verification settings
 * @returns Verification result with validity and confidence score
 *
 * @example
 * ```ts
 * const result = await verifyEmail('user@example.com');
 *
 * if (result.valid && result.confidence > 0.8) {
 *   console.log('Email is likely valid!');
 * }
 * ```
 */
export async function verifyEmail(
  email: string,
  options: VerifyOptions = {}
): Promise<VerificationResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const normalizedEmail = normalizeEmail(email);

  // Check cache first
  if (normalizedEmail) {
    const cached = emailCache.get(emailCacheKey(normalizedEmail));
    if (cached) {
      return cached;
    }
  }

  // Initialize checks
  const checks = createDefaultChecks();

  // Run immediate detections (don't require network)
  checks.isDisposableEmail = isDisposableEmail(email);
  checks.isRoleBasedAccount = isRoleBasedEmail(email);
  checks.isFreeEmailProvider = isFreeEmail(email);

  // Step 1: Format validation
  checks.isValidSyntax = isValidFormat(email);

  if (!checks.isValidSyntax) {
    const result: VerificationResult = {
      email,
      valid: false,
      confidence: CONFIDENCE.INVALID,
      isSafeToSend: false,
      checks,
      details: {
        formatValid: false,
        mxRecords: [],
        smtpStatus: 'skipped',
        catchAll: null,
        provider: null,
      },
    };
    return result;
  }

  const domain = extractDomain(email);
  if (!domain) {
    const result: VerificationResult = {
      email,
      valid: false,
      confidence: CONFIDENCE.INVALID,
      isSafeToSend: false,
      checks,
      details: {
        formatValid: false,
        mxRecords: [],
        smtpStatus: 'skipped',
        catchAll: null,
        provider: null,
      },
    };
    return result;
  }

  // Step 2: DNS check
  let dnsResult = dnsCache.get(domainCacheKey(domain));
  if (!dnsResult) {
    dnsResult = await checkDns(domain, opts.dnsTimeout);
    dnsCache.set(domainCacheKey(domain), dnsResult);
  }

  checks.isValidDomain = dnsResult.hasValidDns;

  if (!dnsResult.hasValidDns) {
    checks.isUnknown = false; // We know it's invalid
    const result: VerificationResult = {
      email,
      valid: false,
      confidence: CONFIDENCE.INVALID,
      isSafeToSend: false,
      checks,
      details: {
        formatValid: true,
        mxRecords: [],
        smtpStatus: 'skipped',
        catchAll: null,
        provider: null,
      },
    };

    if (normalizedEmail) {
      emailCache.set(emailCacheKey(normalizedEmail), result);
    }
    return result;
  }

  const mxHosts = dnsResult.mxRecords.map((mx) => mx.exchange);
  const provider = detectProvider(mxHosts);

  // Step 3: SMTP check (if enabled)
  let smtpStatus: SmtpStatus = 'skipped';
  const primaryMx = mxHosts[0];

  if (opts.smtpCheck && mxHosts.length > 0 && primaryMx) {
    // Check throttle
    if (!smtpThrottle.canProceed(primaryMx)) {
      // In backoff, return unknown status
      checks.isUnknown = true;
      const result: VerificationResult = {
        email,
        valid: true, // Assume valid but uncertain
        confidence: CONFIDENCE.SMTP_UNKNOWN,
        isSafeToSend: false, // Not safe when unknown
        checks,
        details: {
          formatValid: true,
          mxRecords: mxHosts,
          smtpStatus: 'unknown',
          catchAll: null,
          provider,
        },
      };
      return result;
    }

    smtpThrottle.consume(primaryMx);

    const smtpResult = await probeWithFallback(
      mxHosts,
      email,
      {
        port: opts.smtpPort,
        timeout: opts.smtpTimeout,
        senderEmail: opts.senderEmail,
      }
    );

    smtpStatus = smtpResult.status;
    checks.canConnectSmtp = smtpStatus !== 'unknown';
    checks.isDeliverable = smtpStatus === 'accepted';

    // Update throttle based on result
    if (smtpStatus === 'unknown') {
      smtpThrottle.recordFailure(primaryMx);
    } else {
      smtpThrottle.recordSuccess(primaryMx);
    }
  }

  // If SMTP rejected, email is invalid
  if (smtpStatus === 'rejected') {
    checks.isUnknown = false;
    const result: VerificationResult = {
      email,
      valid: false,
      confidence: CONFIDENCE.INVALID,
      isSafeToSend: false,
      checks,
      details: {
        formatValid: true,
        mxRecords: mxHosts,
        smtpStatus,
        catchAll: null,
        provider,
      },
    };

    if (normalizedEmail) {
      emailCache.set(emailCacheKey(normalizedEmail), result);
    }
    return result;
  }

  // If SMTP unknown, return uncertain result
  if (smtpStatus === 'unknown') {
    checks.isUnknown = true;
    const result: VerificationResult = {
      email,
      valid: true, // Could be valid
      confidence: CONFIDENCE.SMTP_UNKNOWN,
      isSafeToSend: false, // Not safe when unknown
      checks,
      details: {
        formatValid: true,
        mxRecords: mxHosts,
        smtpStatus,
        catchAll: null,
        provider,
      },
    };
    return result;
  }

  // Step 4: Catch-all detection (if enabled and SMTP accepted)
  let catchAll: boolean | null = null;

  if (opts.catchAllCheck && smtpStatus === 'accepted' && mxHosts.length > 0) {
    const testEmail = generateCatchAllTestEmail(email);

    const catchAllResult = await probeWithFallback(
      mxHosts,
      testEmail,
      {
        port: opts.smtpPort,
        timeout: opts.smtpTimeout,
        senderEmail: opts.senderEmail,
      }
    );

    // If the fake email is also accepted, it's a catch-all
    catchAll = catchAllResult.status === 'accepted';
    checks.isCatchAllDomain = catchAll;
  }

  // Calculate final confidence
  let confidence: number;
  checks.isUnknown = false;

  if (smtpStatus === 'skipped') {
    // No SMTP check - format and DNS valid, moderate confidence
    confidence = 0.7;
    checks.isUnknown = true; // Still somewhat unknown without SMTP
  } else if (catchAll === true) {
    // Catch-all detected - lower confidence
    confidence = CONFIDENCE.CATCH_ALL;
    checks.isUnknown = true; // Catch-all means we can't verify the specific mailbox
  } else {
    // SMTP accepted and not catch-all - high confidence
    confidence = CONFIDENCE.VERIFIED;
  }

  // Determine if safe to send
  const isSafeToSend =
    checks.isValidSyntax &&
    checks.isValidDomain &&
    checks.isDeliverable &&
    !checks.isCatchAllDomain &&
    !checks.isDisposableEmail &&
    !checks.isRoleBasedAccount &&
    !checks.isUnknown;

  const result: VerificationResult = {
    email,
    valid: true,
    confidence,
    isSafeToSend,
    checks,
    details: {
      formatValid: true,
      mxRecords: mxHosts,
      smtpStatus,
      catchAll,
      provider,
    },
  };

  if (normalizedEmail) {
    emailCache.set(emailCacheKey(normalizedEmail), result);
  }

  return result;
}

// Export provider detection for direct use
export { detectProvider } from './providers';

// Export detectors for direct use
export { isDisposableEmail, isDisposableDomain } from './detectors/disposable';
export { isRoleBasedEmail, isRoleBasedLocalPart } from './detectors/role-based';
export { isFreeEmail, isFreeEmailDomain } from './detectors/free-provider';

/**
 * Verifies multiple email addresses
 *
 * Processes emails sequentially to respect throttling.
 *
 * @param emails - Array of email addresses to verify
 * @param options - Optional verification settings
 * @returns Array of verification results
 *
 * @example
 * ```ts
 * const results = await verifyEmails([
 *   'user1@example.com',
 *   'user2@example.com',
 * ]);
 * ```
 */
export async function verifyEmails(
  emails: string[],
  options: VerifyOptions = {}
): Promise<VerificationResult[]> {
  const results: VerificationResult[] = [];

  for (const email of emails) {
    const result = await verifyEmail(email, options);
    results.push(result);
  }

  return results;
}

/**
 * Clears all caches
 *
 * Useful for testing or when you want fresh results.
 */
export function clearCaches(): void {
  emailCache.clear();
  dnsCache.clear();
}

/**
 * Clears throttle state
 *
 * Useful for testing or after extended downtime.
 */
export function clearThrottle(): void {
  smtpThrottle.clear();
}

// Export validators for direct use
export { isValidFormat, extractDomain, extractLocalPart } from './validators/format';
export { checkDns, getPrimaryMx } from './validators/dns';
export { smtpProbe } from './validators/smtp';

/**
 * Email Verifier
 *
 * A simple, zero-dependency email verification library with format validation,
 * DNS checking, SMTP probing, and advanced catch-all analysis.
 */

import type {
  VerificationResult,
  VerifyOptions,
  SmtpStatus,
  SmtpResult,
  VerificationChecks,
  CatchAllSignals,
} from './types';
import { isValidFormat, extractDomain, extractLocalPart, normalizeEmail } from './validators/format';
import { checkDns } from './validators/dns';
import { probeWithTimingStats } from './validators/smtp';
import { emailCache, dnsCache, emailCacheKey, domainCacheKey } from './cache';
import { smtpThrottle } from './throttle';
import { detectProvider } from './providers';
import { isDisposableEmail } from './detectors/disposable';
import { isRoleBasedEmail } from './detectors/role-based';
import { isFreeEmail } from './detectors/free-provider';
import {
  analyzeEmailPattern,
  analyzeNameLikeness,
  checkSPF,
  checkDMARC,
} from './analyzers/catchall';

// Re-export types
export type {
  VerificationResult,
  VerifyOptions,
  SmtpStatus,
  MailProvider,
  VerificationChecks,
  CatchAllSignals,
} from './types';

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
  VERIFIED: 0.95,
};

/**
 * Number of probes to use for timing analysis
 */
const TIMING_PROBE_COUNT = 2;

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
 * Creates a default CatchAllSignals object
 */
function createDefaultSignals(): CatchAllSignals {
  return {
    patternMatch: 0,
    patternName: null,
    nameScore: 0,
    timingScore: 0.5,
    hasSPF: false,
    hasDMARC: false,
    mxCount: 0,
  };
}

/**
 * Calculate Z-score for timing analysis
 * 
 * @param realAvg - Average RCPT TO time for real email (ms)
 * @param fakeAvg - Average RCPT TO time for fake email (ms)
 * @param fakeStdDev - Standard deviation of fake email times (estimated from single probe variance)
 * @returns Z-score indicating statistical significance
 */
function calculateZScore(
  realAvg: number,
  fakeAvg: number,
  fakeStdDev: number
): number {
  if (fakeStdDev === 0) {
    // If no variance, use the difference itself as indicator
    const diff = Math.abs(realAvg - fakeAvg);
    if (diff > 100) return diff / 50; // Rough z-score estimate
    return 0;
  }
  return Math.abs(realAvg - fakeAvg) / fakeStdDev;
}

/**
 * Analyzes timing difference using Z-score
 * Works for any mail provider - high Z-score = statistically significant difference
 *
 * @param realAvg - Average RCPT TO time for real email (ms)
 * @param fakeAvg - Average RCPT TO time for fake email (ms)
 * @returns Analysis with Z-score and confidence boost
 */
function analyzeTimingDifference(
  realAvg: number,
  fakeAvg: number
): { zScore: number; confidence: number; reason: string } {
  if (realAvg === 0 || fakeAvg === 0) {
    return { zScore: 0, confidence: 0.5, reason: 'Insufficient timing data' };
  }

  const diffMs = Math.abs(fakeAvg - realAvg);
  const diffPercent = Math.round(((fakeAvg - realAvg) / realAvg) * 100);
  
  // Estimate standard deviation as 30% of the average (typical for network latency)
  const estimatedStdDev = Math.max(fakeAvg * 0.3, 30);
  const zScore = calculateZScore(realAvg, fakeAvg, estimatedStdDev);
  
  // Z-score interpretation:
  // |z| > 5: Very strong signal
  // |z| > 3: Strong signal  
  // |z| > 2: Statistically significant
  // |z| < 2: Not significant (within normal variance)
  
  if (zScore > 5) {
    return {
      zScore,
      confidence: 0.85,
      reason: `Strong timing signal (z=${zScore.toFixed(1)}, ${diffPercent}% diff, ${diffMs}ms)`,
    };
  }
  if (zScore > 3) {
    return {
      zScore,
      confidence: 0.75,
      reason: `Good timing signal (z=${zScore.toFixed(1)}, ${diffPercent}% diff, ${diffMs}ms)`,
    };
  }
  if (zScore > 2) {
    return {
      zScore,
      confidence: 0.65,
      reason: `Moderate timing signal (z=${zScore.toFixed(1)}, ${diffPercent}% diff)`,
    };
  }
  
  // No significant signal
  return {
    zScore,
    confidence: 0.5,
    reason: `No timing signal (z=${zScore.toFixed(1)}, within normal variance)`,
  };
}

/**
 * Apply pattern penalty for suspicious email formats
 * 
 * Only REDUCES confidence - good patterns are expected and don't boost score
 * 
 * @param patternScore - Score from pattern analysis (0-1)
 * @param nameScore - Score from name likeness analysis (0-1)
 * @returns Penalty to apply (0 or negative)
 */
function getPatternPenalty(patternScore: number, nameScore: number): { penalty: number; reason: string | null } {
  // Good patterns (first.last, first_last) - no penalty, this is expected
  if (patternScore >= 0.7) {
    return { penalty: 0, reason: null };
  }
  
  // Moderate patterns (single name, flast) - small penalty if name doesn't look real
  if (patternScore >= 0.5) {
    if (nameScore >= 0.7) {
      return { penalty: 0, reason: null };
    }
    return { penalty: -0.05, reason: 'Uncommon email pattern' };
  }
  
  // Poor patterns (contains numbers, unknown) - significant penalty
  if (patternScore >= 0.3) {
    if (nameScore >= 0.7) {
      return { penalty: -0.1, reason: 'Unusual email format' };
    }
    return { penalty: -0.15, reason: 'Suspicious email pattern' };
  }
  
  // Very poor pattern (random chars, test-like) - heavy penalty
  return { penalty: -0.25, reason: 'Does not follow standard email naming conventions' };
}

/**
 * Verifies a single email address
 *
 * Performs the following checks:
 * 1. Format validation (RFC 5322)
 * 2. DNS lookup (MX records, A record fallback)
 * 3. SMTP probe (RCPT TO verification)
 * 4. Catch-all detection with timing analysis
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
  const confidenceReasons: string[] = [];

  // Run immediate detections (don't require network)
  checks.isDisposableEmail = isDisposableEmail(email);
  checks.isRoleBasedAccount = isRoleBasedEmail(email);
  checks.isFreeEmailProvider = isFreeEmail(email);

  // Step 1: Format validation
  checks.isValidSyntax = isValidFormat(email);

  if (!checks.isValidSyntax) {
    confidenceReasons.push('Invalid email format');
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
        catchAllSignals: null,
        confidenceReasons,
      },
    };
    return result;
  }

  const domain = extractDomain(email);
  if (!domain) {
    confidenceReasons.push('Could not extract domain');
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
        catchAllSignals: null,
        confidenceReasons,
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
    confidenceReasons.push('No valid DNS records found');
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
        catchAllSignals: null,
        confidenceReasons,
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
  let realSmtpResult: SmtpResult | null = null;
  let realAvgRcptToTime = 0;
  const primaryMx = mxHosts[0];

  if (opts.smtpCheck && mxHosts.length > 0 && primaryMx) {
    // Check throttle
    if (!smtpThrottle.canProceed(primaryMx)) {
      // In backoff, return unknown status
      checks.isUnknown = true;
      confidenceReasons.push('SMTP throttled - in backoff period');
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
          catchAllSignals: null,
          confidenceReasons,
        },
      };
      return result;
    }

    smtpThrottle.consume(primaryMx);

    // Use timing stats for better analysis
    const realProbeStats = await probeWithTimingStats(
      mxHosts,
      email,
      TIMING_PROBE_COUNT,
      {
        port: opts.smtpPort,
        timeout: opts.smtpTimeout,
        senderEmail: opts.senderEmail,
      }
    );

    realSmtpResult = realProbeStats.result;
    realAvgRcptToTime = realProbeStats.avgRcptToTime;
    smtpStatus = realSmtpResult.status;
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
    confidenceReasons.push('SMTP server rejected the recipient');
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
        catchAllSignals: null,
        confidenceReasons,
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
    confidenceReasons.push('SMTP connection failed or timed out');
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
        catchAllSignals: null,
        confidenceReasons,
      },
    };
    return result;
  }

  // Step 4: Catch-all detection with timing analysis
  let catchAll: boolean | null = null;
  let fakeAvgRcptToTime = 0;
  let catchAllSignals: CatchAllSignals = createDefaultSignals();
  catchAllSignals.mxCount = mxHosts.length;

  if (opts.catchAllCheck && smtpStatus === 'accepted' && mxHosts.length > 0) {
    const testEmail = generateCatchAllTestEmail(email);

    // Use timing stats for catch-all probe too
    const fakeProbeStats = await probeWithTimingStats(
      mxHosts,
      testEmail,
      TIMING_PROBE_COUNT,
      {
        port: opts.smtpPort,
        timeout: opts.smtpTimeout,
        senderEmail: opts.senderEmail,
      }
    );

    fakeAvgRcptToTime = fakeProbeStats.avgRcptToTime;

    // If the fake email is also accepted, it's a catch-all
    catchAll = fakeProbeStats.result.status === 'accepted';
    checks.isCatchAllDomain = catchAll;

    // Analyze timing difference using Z-score
    const timingAnalysis = analyzeTimingDifference(realAvgRcptToTime, fakeAvgRcptToTime);
    catchAllSignals.timingScore = timingAnalysis.confidence;
    catchAllSignals.zScore = timingAnalysis.zScore;
    confidenceReasons.push(timingAnalysis.reason);

    // Store timing analysis details
    if (realAvgRcptToTime > 0 && fakeAvgRcptToTime > 0) {
      catchAllSignals.timingAnalysis = {
        realAvgMs: Math.round(realAvgRcptToTime),
        fakeAvgMs: Math.round(fakeAvgRcptToTime),
        diffMs: Math.round(fakeAvgRcptToTime - realAvgRcptToTime),
        diffPercent: Math.round(((fakeAvgRcptToTime - realAvgRcptToTime) / realAvgRcptToTime) * 100),
        probeCount: TIMING_PROBE_COUNT,
      };
    }
  }

  // Step 5: Advanced analysis - email pattern and domain maturity
  const localPart = extractLocalPart(email);
  const patternResult = analyzeEmailPattern(localPart || '');
  const nameScore = analyzeNameLikeness(localPart || '');

  catchAllSignals.patternMatch = patternResult.score;
  catchAllSignals.patternName = patternResult.pattern;
  catchAllSignals.nameScore = nameScore;

  // Get domain security info in parallel
  const [hasSPF, hasDMARC] = await Promise.all([
    checkSPF(domain, opts.dnsTimeout),
    checkDMARC(domain, opts.dnsTimeout),
  ]);
  catchAllSignals.hasSPF = hasSPF;
  catchAllSignals.hasDMARC = hasDMARC;

  // Calculate final confidence
  let confidence: number;
  checks.isUnknown = false;

  if (smtpStatus === 'skipped') {
    // No SMTP check - format and DNS valid, moderate confidence
    confidence = 0.7;
    checks.isUnknown = true;
    confidenceReasons.push('SMTP check skipped - limited verification');
  } else if (catchAll === true) {
    // Catch-all detected - use simple Z-score based approach
    // This works for any mail provider - high Z-score = statistically significant timing difference
    
    const zScore = catchAllSignals.zScore ?? 0;
    
    // Start with Z-score based confidence
    if (zScore > 5) {
      confidence = 0.85;  // Very strong signal
      checks.isUnknown = false;
    } else if (zScore > 3) {
      confidence = 0.75;  // Strong signal
      checks.isUnknown = false;
    } else if (zScore > 2) {
      confidence = 0.65;  // Moderate signal
      checks.isUnknown = true;
    } else {
      confidence = 0.50;  // No signal - truly unknown
      checks.isUnknown = true;
    }
    
    // Apply pattern penalty (ONLY reduces, never increases)
    const patternPenalty = getPatternPenalty(patternResult.score, nameScore);
    if (patternPenalty.penalty < 0) {
      confidence += patternPenalty.penalty;
      if (patternPenalty.reason) {
        confidenceReasons.push(patternPenalty.reason);
      }
    }
    
    // Ensure confidence stays in valid range
    confidence = Math.max(0, Math.min(confidence, 0.85));
    
    confidenceReasons.push('Domain is catch-all (accepts any email address)');
  } else {
    // SMTP accepted and not catch-all - high confidence
    confidence = CONFIDENCE.VERIFIED;
    confidenceReasons.push('SMTP server accepted recipient');
    confidenceReasons.push('Not a catch-all domain');
  }

  // Add informational notes (don't affect scoring)
  if (hasSPF && hasDMARC) {
    confidenceReasons.push('Domain has proper email security (SPF + DMARC)');
  }

  // Determine if safe to send
  // For catch-all domains, require strong timing signal (z > 2)
  const isSafeToSend =
    checks.isValidSyntax &&
    checks.isValidDomain &&
    checks.isDeliverable &&
    !checks.isDisposableEmail &&
    !checks.isRoleBasedAccount &&
    (catchAll !== true || (catchAllSignals.zScore ?? 0) > 2); // Only safe if catch-all has timing signal

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
      catchAllSignals,
      confidenceReasons,
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

// Export analyzers for direct use
export {
  analyzeCatchAll,
  analyzeEmailPattern,
  analyzeNameLikeness,
  checkSPF,
  checkDMARC,
} from './analyzers/catchall';
export type { CatchAllAnalysis } from './analyzers/catchall';

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
export { smtpProbe, probeWithFallback, probeWithTimingStats } from './validators/smtp';

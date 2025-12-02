/**
 * Catch-all Domain Analysis
 *
 * Advanced analysis to determine confidence in emails from catch-all domains.
 * Uses multiple signals to estimate validity even when SMTP accepts everything.
 */

import dns from 'dns';
import { SmtpResult } from '../types';

/**
 * Result of catch-all analysis
 */
export interface CatchAllAnalysis {
  /** Whether the domain is a catch-all */
  isCatchAll: boolean;

  /** Confidence that the email is real (0.0 - 1.0) even on catch-all */
  confidence: number;

  /** Individual signal scores */
  signals: {
    /** Email follows common corporate naming patterns */
    patternMatch: number;

    /** Local part looks like a real person's name */
    nameScore: number;

    /** Response timing difference between real and fake probes */
    timingDiff: number;

    /** Domain has SPF record (indicates maturity) */
    hasSPF: boolean;

    /** Domain has DMARC record (indicates maturity) */
    hasDMARC: boolean;

    /** Number of MX records (more = more established) */
    mxCount: number;
  };

  /** Reasons explaining the confidence score */
  reasons: string[];
}

/**
 * Common corporate email patterns
 * Higher priority = more common/trustworthy
 */
const EMAIL_PATTERNS = [
  // first.last@domain.com
  { regex: /^[a-z]+\.[a-z]+$/i, score: 0.9, name: 'first.last' },

  // firstlast@domain.com
  { regex: /^[a-z]{4,}[a-z]{3,}$/i, score: 0.7, name: 'firstlast' },

  // first_last@domain.com
  { regex: /^[a-z]+_[a-z]+$/i, score: 0.85, name: 'first_last' },

  // flast@domain.com (initial + lastname)
  { regex: /^[a-z][a-z]{3,}$/i, score: 0.6, name: 'flast' },

  // first.m.last@domain.com
  { regex: /^[a-z]+\.[a-z]\.[a-z]+$/i, score: 0.9, name: 'first.m.last' },

  // first-last@domain.com
  { regex: /^[a-z]+-[a-z]+$/i, score: 0.85, name: 'first-last' },

  // firstl@domain.com (firstname + initial)
  { regex: /^[a-z]{3,}[a-z]$/i, score: 0.5, name: 'firstl' },
];

/**
 * Common first names (subset for quick checking)
 */
const COMMON_FIRST_NAMES = new Set([
  'james', 'john', 'robert', 'michael', 'william', 'david', 'richard', 'joseph',
  'thomas', 'charles', 'christopher', 'daniel', 'matthew', 'anthony', 'mark',
  'donald', 'steven', 'paul', 'andrew', 'joshua', 'kenneth', 'kevin', 'brian',
  'george', 'timothy', 'ronald', 'edward', 'jason', 'jeffrey', 'ryan', 'jacob',
  'gary', 'nicholas', 'eric', 'jonathan', 'stephen', 'larry', 'justin', 'scott',
  'brandon', 'benjamin', 'samuel', 'raymond', 'gregory', 'frank', 'alexander',
  'patrick', 'jack', 'dennis', 'jerry', 'tyler', 'aaron', 'jose', 'adam', 'nathan',
  'mary', 'patricia', 'jennifer', 'linda', 'barbara', 'elizabeth', 'susan',
  'jessica', 'sarah', 'karen', 'lisa', 'nancy', 'betty', 'margaret', 'sandra',
  'ashley', 'kimberly', 'emily', 'donna', 'michelle', 'dorothy', 'carol', 'amanda',
  'melissa', 'deborah', 'stephanie', 'rebecca', 'sharon', 'laura', 'cynthia',
  'kathleen', 'amy', 'angela', 'shirley', 'anna', 'brenda', 'pamela', 'emma',
  'nicole', 'helen', 'samantha', 'katherine', 'christine', 'debra', 'rachel',
  'carolyn', 'janet', 'catherine', 'maria', 'heather', 'diane', 'ruth', 'julie',
  // International names
  'alex', 'max', 'leo', 'oscar', 'oliver', 'hugo', 'felix', 'lucas', 'marco', 'carlos',
  'andreas', 'stefan', 'jan', 'peter', 'hans', 'lars', 'erik', 'magnus', 'sven', 'nils',
  'pierre', 'jean', 'marc', 'andre', 'philippe', 'laurent', 'michel', 'alain', 'yves',
  'giuseppe', 'mario', 'luigi', 'paolo', 'francesco', 'antonio', 'giovanni', 'roberto',
  'pablo', 'carlos', 'jose', 'miguel', 'juan', 'pedro', 'rafael', 'diego', 'manuel',
]);

/**
 * Analyzes the local part of an email for pattern matching
 *
 * @param localPart - The part before @ in the email
 * @returns Pattern match score (0.0 - 1.0)
 */
export function analyzeEmailPattern(localPart: string): { score: number; pattern: string | null } {
  if (!localPart) {
    return { score: 0, pattern: null };
  }

  const normalized = localPart.toLowerCase();

  // Check against known patterns
  for (const pattern of EMAIL_PATTERNS) {
    if (pattern.regex.test(normalized)) {
      return { score: pattern.score, pattern: pattern.name };
    }
  }

  // Check if it contains a common first name
  const parts = normalized.split(/[._-]/);
  for (const part of parts) {
    if (COMMON_FIRST_NAMES.has(part)) {
      return { score: 0.6, pattern: 'contains_name' };
    }
  }

  // Single word that's 3+ chars might be a name
  if (/^[a-z]{3,12}$/i.test(normalized)) {
    return { score: 0.4, pattern: 'single_word' };
  }

  // Contains numbers - less likely to be a real personal email
  if (/\d/.test(normalized)) {
    return { score: 0.2, pattern: 'contains_numbers' };
  }

  return { score: 0.3, pattern: 'unknown' };
}

/**
 * Checks if a domain has SPF record
 */
export function checkSPF(domain: string, timeout = 5000): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeout);

    dns.resolveTxt(domain, (err, records) => {
      clearTimeout(timer);
      if (err || !records) {
        resolve(false);
        return;
      }

      const hasSPF = records.some((record) =>
        record.some((txt) => txt.toLowerCase().startsWith('v=spf1'))
      );
      resolve(hasSPF);
    });
  });
}

/**
 * Checks if a domain has DMARC record
 */
export function checkDMARC(domain: string, timeout = 5000): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeout);

    dns.resolveTxt(`_dmarc.${domain}`, (err, records) => {
      clearTimeout(timer);
      if (err || !records) {
        resolve(false);
        return;
      }

      const hasDMARC = records.some((record) =>
        record.some((txt) => txt.toLowerCase().startsWith('v=dmarc1'))
      );
      resolve(hasDMARC);
    });
  });
}

/**
 * Analyzes name-likeness of the local part
 *
 * @param localPart - The part before @ in the email
 * @returns Score indicating how likely this is a real name (0.0 - 1.0)
 */
export function analyzeNameLikeness(localPart: string): number {
  if (!localPart) return 0;

  const normalized = localPart.toLowerCase();
  const parts = normalized.split(/[._-]/);

  // If has separator, check if parts look like names
  if (parts.length >= 2) {
    const firstPart = parts[0];
    const secondPart = parts[1];

    if (!firstPart || !secondPart) return 0.3;

    // Both parts are alphabetic and reasonable length
    if (
      /^[a-z]{2,15}$/.test(firstPart) &&
      /^[a-z]{2,15}$/.test(secondPart)
    ) {
      // First part is a known name
      if (COMMON_FIRST_NAMES.has(firstPart)) {
        return 0.95;
      }
      // Both parts look like names (capitalized pattern)
      return 0.75;
    }
  }

  // Single part - check if it's a known name
  if (COMMON_FIRST_NAMES.has(normalized)) {
    return 0.7;
  }

  // Single word, reasonable length, all letters
  if (/^[a-z]{3,12}$/.test(normalized)) {
    return 0.5;
  }

  // Has numbers or special chars
  if (/[0-9]/.test(normalized) || /[^a-z._-]/i.test(normalized)) {
    return 0.2;
  }

  return 0.3;
}

/**
 * Analyzes SMTP response timing for catch-all detection
 *
 * @param realResponseTime - Response time for the real email (ms)
 * @param fakeResponseTime - Response time for the fake email (ms)
 * @returns Score based on timing difference (higher if real is faster)
 */
export function analyzeResponseTiming(
  realResponseTime: number,
  fakeResponseTime: number
): number {
  // If real email responded significantly faster, might indicate it exists
  const diff = fakeResponseTime - realResponseTime;
  const percentDiff = diff / Math.max(realResponseTime, 1);

  // Real email was much faster (>50% faster) - good signal
  if (percentDiff > 0.5) {
    return 0.8;
  }

  // Real email was somewhat faster (>20% faster)
  if (percentDiff > 0.2) {
    return 0.6;
  }

  // Similar timing - no signal
  if (Math.abs(percentDiff) < 0.2) {
    return 0.5;
  }

  // Fake was faster - slightly negative signal
  return 0.4;
}

/**
 * Performs comprehensive catch-all analysis
 *
 * @param email - The email address to analyze
 * @param domain - The domain of the email
 * @param isCatchAll - Whether the domain is detected as catch-all
 * @param realSmtpResult - SMTP result for the real email
 * @param fakeSmtpResult - SMTP result for the fake email
 * @param mxCount - Number of MX records for the domain
 * @param realResponseTime - Optional response time for real email (ms)
 * @param fakeResponseTime - Optional response time for fake email (ms)
 */
export async function analyzeCatchAll(
  email: string,
  domain: string,
  isCatchAll: boolean,
  realSmtpResult: SmtpResult,
  _fakeSmtpResult: SmtpResult | null, // Used for future enhancements (response text analysis)
  mxCount: number,
  realResponseTime?: number,
  fakeResponseTime?: number
): Promise<CatchAllAnalysis> {
  const atIndex = email.lastIndexOf('@');
  const localPart = atIndex > 0 ? email.substring(0, atIndex) : '';

  const reasons: string[] = [];
  let confidence = 0;

  // If not a catch-all, return high confidence
  if (!isCatchAll) {
    return {
      isCatchAll: false,
      confidence: realSmtpResult.status === 'accepted' ? 0.95 : 0,
      signals: {
        patternMatch: 1,
        nameScore: 1,
        timingDiff: 0.5,
        hasSPF: false,
        hasDMARC: false,
        mxCount,
      },
      reasons: ['Not a catch-all domain, SMTP verification is reliable'],
    };
  }

  // Analyze email pattern
  const patternResult = analyzeEmailPattern(localPart);
  const nameScore = analyzeNameLikeness(localPart);

  // Check domain maturity signals
  const [hasSPF, hasDMARC] = await Promise.all([
    checkSPF(domain),
    checkDMARC(domain),
  ]);

  // Analyze timing if available
  let timingScore = 0.5;
  if (realResponseTime && fakeResponseTime) {
    timingScore = analyzeResponseTiming(realResponseTime, fakeResponseTime);
  }

  // Build confidence score from signals
  const weights = {
    pattern: 0.30,     // Email pattern is very important
    name: 0.25,        // Name-likeness is important
    timing: 0.15,      // Timing can help but not always reliable
    domainMaturity: 0.20, // SPF/DMARC/MX count indicates established domain
    mxCount: 0.10,     // More MX records = more established
  };

  // Pattern score
  confidence += patternResult.score * weights.pattern;
  if (patternResult.score > 0.7) {
    reasons.push(`Email follows '${patternResult.pattern}' pattern (common for corporate emails)`);
  } else if (patternResult.score < 0.4) {
    reasons.push('Email does not follow common corporate naming patterns');
  }

  // Name score
  confidence += nameScore * weights.name;
  if (nameScore > 0.7) {
    reasons.push('Local part appears to be a real person\'s name');
  } else if (nameScore < 0.4) {
    reasons.push('Local part does not appear to be a real name');
  }

  // Timing score
  confidence += timingScore * weights.timing;
  if (timingScore > 0.7) {
    reasons.push('SMTP responded faster for real email (positive signal)');
  }

  // Domain maturity
  const maturityScore = (hasSPF ? 0.5 : 0) + (hasDMARC ? 0.5 : 0);
  confidence += maturityScore * weights.domainMaturity;
  if (hasSPF && hasDMARC) {
    reasons.push('Domain has SPF and DMARC (well-configured email infrastructure)');
  } else if (hasSPF || hasDMARC) {
    reasons.push('Domain has partial email security configuration');
  }

  // MX count score (normalize to 0-1, cap at 5 MX records)
  const mxScore = Math.min(mxCount / 5, 1);
  confidence += mxScore * weights.mxCount;
  if (mxCount >= 3) {
    reasons.push(`Domain has ${mxCount} MX records (enterprise-level infrastructure)`);
  }

  // Catch-all penalty - but not as severe if other signals are strong
  if (isCatchAll) {
    reasons.push('Domain is catch-all (accepts any email address)');
    // Only apply catch-all penalty if confidence is middling
    if (confidence > 0.7) {
      confidence = Math.min(confidence, 0.85); // Cap at 85% for catch-all
    }
  }

  return {
    isCatchAll,
    confidence: Math.min(Math.max(confidence, 0), 1), // Clamp 0-1
    signals: {
      patternMatch: patternResult.score,
      nameScore,
      timingDiff: timingScore,
      hasSPF,
      hasDMARC,
      mxCount,
    },
    reasons,
  };
}


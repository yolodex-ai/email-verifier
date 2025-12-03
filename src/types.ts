/**
 * Status of the SMTP verification probe
 */
export type SmtpStatus =
  | 'accepted'    // 2xx response - mailbox exists
  | 'rejected'    // 5xx response - mailbox doesn't exist
  | 'unknown'     // 4xx or timeout - can't determine
  | 'skipped';    // SMTP check was not performed

/**
 * Information about the mail provider
 */
export interface MailProvider {
  /** Name of the mail provider (e.g., "Google Workspace", "Microsoft 365") */
  name: string;
  /** URL to the provider's website */
  url: string;
}

/**
 * Signals used for catch-all analysis
 */
export interface CatchAllSignals {
  /** Score for email pattern match (0.0 - 1.0) */
  patternMatch: number;

  /** Matched pattern name (e.g., 'first.last', 'firstlast') */
  patternName: string | null;

  /** Score for name-likeness (0.0 - 1.0) */
  nameScore: number;

  /** Score from response timing analysis (0.0 - 1.0) */
  timingScore: number;

  /** Z-score for timing analysis (|z| > 2 = statistically significant) */
  zScore?: number;

  /** Whether domain has SPF record */
  hasSPF: boolean;

  /** Whether domain has DMARC record */
  hasDMARC: boolean;

  /** Number of MX records for the domain */
  mxCount: number;

  /** Timing analysis details */
  timingAnalysis?: {
    /** Average RCPT TO time for real email (ms) */
    realAvgMs: number;
    /** Average RCPT TO time for fake email (ms) */
    fakeAvgMs: number;
    /** Difference in ms (positive = fake is slower = good signal) */
    diffMs: number;
    /** Percentage difference */
    diffPercent: number;
    /** Number of probes used */
    probeCount: number;
  };
}

/**
 * Comprehensive verification checks
 */
export interface VerificationChecks {
  /** Whether the email syntax is valid (RFC 5322) */
  isValidSyntax: boolean;

  /** Whether the domain has valid MX or A records */
  isValidDomain: boolean;

  /** Whether SMTP connection was successful */
  canConnectSmtp: boolean;

  /** Whether SMTP accepted the recipient (2xx response) */
  isDeliverable: boolean;

  /** Whether the domain is a catch-all (accepts any email) */
  isCatchAllDomain: boolean;

  /** Whether the email is from a disposable/temporary email service */
  isDisposableEmail: boolean;

  /** Whether the email is a role-based account (info@, support@, etc.) */
  isRoleBasedAccount: boolean;

  /** Whether the email is from a free email provider (gmail, yahoo, etc.) */
  isFreeEmailProvider: boolean;

  /** Whether the result is unknown/uncertain */
  isUnknown: boolean;
}

/**
 * Result of an email verification
 */
export interface VerificationResult {
  /** The email address that was verified */
  email: string;

  /** Whether the email appears to be valid */
  valid: boolean;

  /** Confidence score from 0.0 to 1.0 */
  confidence: number;

  /** Whether it's safe to send to this email (not disposable, not role-based, deliverable) */
  isSafeToSend: boolean;

  /** Comprehensive verification checks */
  checks: VerificationChecks;

  /** Detailed information about the verification */
  details: {
    /** Whether the email format is valid */
    formatValid: boolean;

    /** MX records found for the domain (empty if none) */
    mxRecords: string[];

    /** Result of the SMTP probe */
    smtpStatus: SmtpStatus;

    /** Whether the domain accepts any email (catch-all), null if not tested */
    catchAll: boolean | null;

    /** Information about the mail provider, null if unknown */
    provider: MailProvider | null;

    /** Signals used for catch-all confidence analysis */
    catchAllSignals: CatchAllSignals | null;

    /** Reasons explaining the confidence score */
    confidenceReasons: string[];
  };
}

/**
 * Options for email verification
 */
export interface VerifyOptions {
  /** Timeout for DNS lookups in milliseconds (default: 5000) */
  dnsTimeout?: number;

  /** Timeout for SMTP connections in milliseconds (default: 10000) */
  smtpTimeout?: number;

  /** Whether to perform SMTP verification (default: true) */
  smtpCheck?: boolean;

  /** Whether to perform catch-all detection (default: true) */
  catchAllCheck?: boolean;

  /** The sender email to use in SMTP MAIL FROM (default: test@example.com) */
  senderEmail?: string;

  /** SMTP port to connect to (default: 25) */
  smtpPort?: number;
}

/**
 * Internal representation of an MX record
 */
export interface MxRecord {
  exchange: string;
  priority: number;
}

/**
 * Result of a DNS lookup
 */
export interface DnsResult {
  mxRecords: MxRecord[];
  hasValidDns: boolean;
}

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
 * Result of an SMTP probe
 */
export interface SmtpResult {
  status: SmtpStatus;
  responseCode?: number;
  responseMessage?: string;
  /** Time taken for the SMTP probe in milliseconds */
  responseTime?: number;
  /** Detailed timing for each stage */
  timing?: SmtpTiming;
}

/**
 * Cache entry for storing verification results
 */
export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

/**
 * Throttle state for a single host
 */
export interface ThrottleState {
  tokens: number;
  lastRefill: number;
  failureCount: number;
  backoffUntil: number;
}

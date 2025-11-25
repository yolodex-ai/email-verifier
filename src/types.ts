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
 * Result of an email verification
 */
export interface VerificationResult {
  /** The email address that was verified */
  email: string;
  
  /** Whether the email appears to be valid */
  valid: boolean;
  
  /** Confidence score from 0.0 to 1.0 */
  confidence: number;
  
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
 * Result of an SMTP probe
 */
export interface SmtpResult {
  status: SmtpStatus;
  responseCode?: number;
  responseMessage?: string;
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


/**
 * DNS validation for email domains
 * 
 * Checks MX records and falls back to A records to verify
 * that a domain can receive email.
 */

import dns from 'dns';
import { promisify } from 'util';
import type { DnsResult, MxRecord } from '../types';

// Promisified DNS functions
const resolveMx = promisify(dns.resolveMx);
const resolve4 = promisify(dns.resolve4);

/**
 * Default timeout for DNS lookups (5 seconds)
 */
const DEFAULT_DNS_TIMEOUT = 5000;

/**
 * Performs a DNS lookup with timeout
 * 
 * @param lookupFn - The DNS lookup function to execute
 * @param timeout - Timeout in milliseconds
 * @returns The result of the lookup, or null on timeout/error
 */
async function withTimeout<T>(
  lookupFn: () => Promise<T>,
  timeout: number
): Promise<T | null> {
  return Promise.race([
    lookupFn(),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), timeout)),
  ]);
}

/**
 * Looks up MX records for a domain
 * 
 * @param domain - The domain to look up
 * @param timeout - Timeout in milliseconds
 * @returns Array of MX records sorted by priority, or empty array on failure
 */
export async function lookupMx(
  domain: string,
  timeout: number = DEFAULT_DNS_TIMEOUT
): Promise<MxRecord[]> {
  try {
    const records = await withTimeout(
      () => resolveMx(domain),
      timeout
    );

    if (!records || records.length === 0) {
      return [];
    }

    // Sort by priority (lower is better) and map to our type
    return records
      .sort((a, b) => a.priority - b.priority)
      .map((record) => ({
        exchange: record.exchange,
        priority: record.priority,
      }));
  } catch {
    // DNS lookup failed (ENOTFOUND, ENODATA, etc.)
    return [];
  }
}

/**
 * Looks up A records for a domain (fallback when no MX)
 * 
 * Per RFC 5321, if no MX records exist, the A record can be used
 * as an implicit MX with priority 0.
 * 
 * @param domain - The domain to look up
 * @param timeout - Timeout in milliseconds
 * @returns Array of IP addresses, or empty array on failure
 */
export async function lookupA(
  domain: string,
  timeout: number = DEFAULT_DNS_TIMEOUT
): Promise<string[]> {
  try {
    const records = await withTimeout(
      () => resolve4(domain),
      timeout
    );

    return records || [];
  } catch {
    return [];
  }
}

/**
 * Checks DNS records for an email domain
 * 
 * First attempts to find MX records. If none exist, falls back
 * to A records per RFC 5321 implicit MX rules.
 * 
 * @param domain - The domain to check
 * @param timeout - Timeout in milliseconds (default: 5000)
 * @returns DnsResult with MX records and validity status
 * 
 * @example
 * ```ts
 * const result = await checkDns('example.com');
 * if (result.hasValidDns) {
 *   console.log('MX records:', result.mxRecords);
 * }
 * ```
 */
export async function checkDns(
  domain: string,
  timeout: number = DEFAULT_DNS_TIMEOUT
): Promise<DnsResult> {
  // First, try to get MX records
  const mxRecords = await lookupMx(domain, timeout);

  if (mxRecords.length > 0) {
    return {
      mxRecords,
      hasValidDns: true,
    };
  }

  // No MX records, try A record fallback
  const aRecords = await lookupA(domain, timeout);

  if (aRecords.length > 0) {
    // Use the domain itself as implicit MX (RFC 5321)
    return {
      mxRecords: [{ exchange: domain, priority: 0 }],
      hasValidDns: true,
    };
  }

  // No MX and no A records - domain can't receive email
  return {
    mxRecords: [],
    hasValidDns: false,
  };
}

/**
 * Gets the primary MX host for a domain
 * 
 * @param domain - The domain to look up
 * @param timeout - Timeout in milliseconds
 * @returns The primary MX hostname, or null if none found
 */
export async function getPrimaryMx(
  domain: string,
  timeout: number = DEFAULT_DNS_TIMEOUT
): Promise<string | null> {
  const result = await checkDns(domain, timeout);
  
  if (result.mxRecords.length === 0) {
    return null;
  }

  return result.mxRecords[0].exchange;
}


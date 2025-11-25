/**
 * Mail provider detection
 * 
 * Maps MX record patterns to known mail providers.
 */

import type { MailProvider } from './types';

/**
 * Known mail provider patterns
 * 
 * Each entry maps an MX record pattern (substring match) to provider info.
 * Patterns are checked in order, so more specific patterns should come first.
 */
const PROVIDER_PATTERNS: Array<{ pattern: string; provider: MailProvider }> = [
  // Google
  {
    pattern: 'google.com',
    provider: { name: 'Google Workspace', url: 'https://workspace.google.com' },
  },
  {
    pattern: 'googlemail.com',
    provider: { name: 'Google Workspace', url: 'https://workspace.google.com' },
  },
  {
    pattern: 'aspmx.l.google.com',
    provider: { name: 'Google Workspace', url: 'https://workspace.google.com' },
  },
  
  // Microsoft
  {
    pattern: 'outlook.com',
    provider: { name: 'Microsoft 365', url: 'https://www.microsoft.com/microsoft-365' },
  },
  {
    pattern: 'mail.protection.outlook.com',
    provider: { name: 'Microsoft 365', url: 'https://www.microsoft.com/microsoft-365' },
  },
  {
    pattern: 'hotmail.com',
    provider: { name: 'Microsoft Outlook', url: 'https://outlook.com' },
  },
  
  // Proofpoint
  {
    pattern: 'pphosted.com',
    provider: { name: 'Proofpoint', url: 'https://www.proofpoint.com' },
  },
  {
    pattern: 'ppe-hosted.com',
    provider: { name: 'Proofpoint Essentials', url: 'https://www.proofpoint.com/us/products/email-protection/essentials' },
  },
  
  // Mimecast
  {
    pattern: 'mimecast.com',
    provider: { name: 'Mimecast', url: 'https://www.mimecast.com' },
  },
  
  // Barracuda
  {
    pattern: 'barracudanetworks.com',
    provider: { name: 'Barracuda', url: 'https://www.barracuda.com' },
  },
  
  // Yahoo
  {
    pattern: 'yahoodns.net',
    provider: { name: 'Yahoo Mail', url: 'https://mail.yahoo.com' },
  },
  {
    pattern: 'yahoo.com',
    provider: { name: 'Yahoo Mail', url: 'https://mail.yahoo.com' },
  },
  
  // Zoho
  {
    pattern: 'zoho.com',
    provider: { name: 'Zoho Mail', url: 'https://www.zoho.com/mail' },
  },
  {
    pattern: 'zoho.eu',
    provider: { name: 'Zoho Mail', url: 'https://www.zoho.com/mail' },
  },
  
  // Fastmail
  {
    pattern: 'fastmail.com',
    provider: { name: 'Fastmail', url: 'https://www.fastmail.com' },
  },
  {
    pattern: 'messagingengine.com',
    provider: { name: 'Fastmail', url: 'https://www.fastmail.com' },
  },
  
  // ProtonMail
  {
    pattern: 'protonmail.ch',
    provider: { name: 'Proton Mail', url: 'https://proton.me/mail' },
  },
  {
    pattern: 'proton.me',
    provider: { name: 'Proton Mail', url: 'https://proton.me/mail' },
  },
  
  // iCloud
  {
    pattern: 'icloud.com',
    provider: { name: 'iCloud Mail', url: 'https://www.icloud.com/mail' },
  },
  {
    pattern: 'apple.com',
    provider: { name: 'Apple Mail', url: 'https://www.apple.com' },
  },
  
  // Amazon SES
  {
    pattern: 'amazonses.com',
    provider: { name: 'Amazon SES', url: 'https://aws.amazon.com/ses' },
  },
  {
    pattern: 'amazonaws.com',
    provider: { name: 'Amazon SES', url: 'https://aws.amazon.com/ses' },
  },
  
  // SendGrid
  {
    pattern: 'sendgrid.net',
    provider: { name: 'SendGrid', url: 'https://sendgrid.com' },
  },
  
  // Mailgun
  {
    pattern: 'mailgun.org',
    provider: { name: 'Mailgun', url: 'https://www.mailgun.com' },
  },
  
  // Postmark
  {
    pattern: 'postmarkapp.com',
    provider: { name: 'Postmark', url: 'https://postmarkapp.com' },
  },
  
  // SparkPost
  {
    pattern: 'sparkpostmail.com',
    provider: { name: 'SparkPost', url: 'https://www.sparkpost.com' },
  },
  
  // Mailchimp/Mandrill
  {
    pattern: 'mandrillapp.com',
    provider: { name: 'Mailchimp Transactional', url: 'https://mailchimp.com/features/transactional-email' },
  },
  
  // GoDaddy
  {
    pattern: 'secureserver.net',
    provider: { name: 'GoDaddy Email', url: 'https://www.godaddy.com/email' },
  },
  
  // Rackspace
  {
    pattern: 'emailsrvr.com',
    provider: { name: 'Rackspace Email', url: 'https://www.rackspace.com/email-hosting' },
  },
  
  // Namecheap
  {
    pattern: 'privateemail.com',
    provider: { name: 'Namecheap Private Email', url: 'https://www.namecheap.com/hosting/email' },
  },
  
  // OVH
  {
    pattern: 'ovh.net',
    provider: { name: 'OVH Mail', url: 'https://www.ovhcloud.com' },
  },
];

/**
 * Detects the mail provider from MX records
 * 
 * @param mxRecords - Array of MX record hostnames
 * @returns The detected mail provider, or null if unknown
 * 
 * @example
 * ```ts
 * detectProvider(['aspmx.l.google.com']);
 * // { name: 'Google Workspace', url: 'https://workspace.google.com' }
 * ```
 */
export function detectProvider(mxRecords: string[]): MailProvider | null {
  if (!mxRecords || mxRecords.length === 0) {
    return null;
  }

  // Check each MX record against known patterns
  for (const mx of mxRecords) {
    const mxLower = mx.toLowerCase();
    
    for (const { pattern, provider } of PROVIDER_PATTERNS) {
      if (mxLower.includes(pattern.toLowerCase())) {
        return provider;
      }
    }
  }

  return null;
}


/**
 * Role-based email account detection
 *
 * Role-based emails are addresses associated with a function or group
 * rather than an individual person (e.g., info@, support@, admin@).
 * These are often not suitable for personal outreach.
 */

/**
 * Common role-based email prefixes
 */
const ROLE_BASED_PREFIXES = new Set([
  // Administrative
  'admin',
  'administrator',
  'postmaster',
  'hostmaster',
  'webmaster',
  'root',
  'sysadmin',

  // Support & Service
  'support',
  'help',
  'helpdesk',
  'customerservice',
  'customer-service',
  'customercare',
  'customer-care',
  'service',
  'tech',
  'technical',
  'techsupport',
  'tech-support',

  // Information
  'info',
  'information',
  'contact',
  'contactus',
  'contact-us',
  'enquiries',
  'enquiry',
  'inquiries',
  'inquiry',
  'hello',
  'hi',

  // Sales & Marketing
  'sales',
  'marketing',
  'press',
  'media',
  'pr',
  'advertising',
  'ads',
  'partnerships',
  'partner',
  'partners',
  'affiliate',
  'affiliates',
  'sponsors',
  'sponsorship',

  // Business Operations
  'billing',
  'accounts',
  'accounting',
  'finance',
  'invoices',
  'invoice',
  'payments',
  'payment',
  'orders',
  'order',
  'purchasing',
  'procurement',

  // Human Resources
  'hr',
  'humanresources',
  'human-resources',
  'jobs',
  'careers',
  'career',
  'recruiting',
  'recruitment',
  'talent',
  'hiring',
  'employment',
  'resume',
  'resumes',
  'cv',

  // Legal & Compliance
  'legal',
  'compliance',
  'privacy',
  'abuse',
  'spam',
  'dmca',
  'copyright',
  'security',
  'fraud',

  // IT & Technical
  'it',
  'noc',
  'ops',
  'operations',
  'devops',
  'engineering',
  'developers',
  'dev',
  'development',
  'bugs',
  'feedback',

  // Communication
  'mail',
  'email',
  'noreply',
  'no-reply',
  'donotreply',
  'do-not-reply',
  'mailer-daemon',
  'mailerdaemon',
  'bounce',
  'bounces',
  'notifications',
  'alerts',
  'newsletter',
  'news',
  'updates',
  'subscribe',
  'unsubscribe',

  // Generic
  'office',
  'team',
  'staff',
  'all',
  'everyone',
  'company',
  'general',
  'main',
  'reception',
  'front',
  'frontdesk',
  'front-desk',

  // E-commerce
  'shop',
  'store',
  'returns',
  'refunds',
  'shipping',
  'delivery',
  'tracking',

  // Education
  'admissions',
  'registrar',
  'library',
  'dean',
]);

/**
 * Checks if a local part (the part before @) is a role-based address
 *
 * @param localPart - The local part of the email (before @)
 * @returns true if it's a role-based address
 *
 * @example
 * ```ts
 * isRoleBasedLocalPart('info'); // true
 * isRoleBasedLocalPart('john.smith'); // false
 * ```
 */
export function isRoleBasedLocalPart(localPart: string): boolean {
  if (!localPart) return false;

  // Normalize: lowercase and remove common separators for comparison
  const normalized = localPart.toLowerCase().replace(/[._-]/g, '');

  // Check exact match
  if (ROLE_BASED_PREFIXES.has(normalized)) {
    return true;
  }

  // Also check the original lowercase version
  if (ROLE_BASED_PREFIXES.has(localPart.toLowerCase())) {
    return true;
  }

  return false;
}

/**
 * Checks if an email address is a role-based account
 *
 * @param email - The email address to check
 * @returns true if the email is role-based
 *
 * @example
 * ```ts
 * isRoleBasedEmail('info@company.com'); // true
 * isRoleBasedEmail('john.smith@company.com'); // false
 * ```
 */
export function isRoleBasedEmail(email: string): boolean {
  if (!email) return false;

  const atIndex = email.lastIndexOf('@');
  if (atIndex === -1 || atIndex === 0) return false;

  const localPart = email.substring(0, atIndex);
  return isRoleBasedLocalPart(localPart);
}


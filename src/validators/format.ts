/**
 * Email format validation
 * 
 * Validates email addresses against a simplified RFC 5322 pattern.
 * This catches most invalid emails while allowing legitimate edge cases.
 */

/**
 * RFC 5322 compliant email regex pattern
 * 
 * Local part allows:
 * - Alphanumeric characters
 * - Special characters: .!#$%&'*+/=?^_`{|}~-
 * - Dots (not at start/end, not consecutive)
 * 
 * Domain part allows:
 * - Alphanumeric characters and hyphens
 * - Multiple subdomains separated by dots
 * - TLD must be at least 2 characters
 */
const EMAIL_REGEX = /^(?!\.)(?!.*\.\.)([a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+)@([a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,})$/;

/**
 * Maximum allowed email length per RFC 5321
 */
const MAX_EMAIL_LENGTH = 254;

/**
 * Maximum allowed local part length per RFC 5321
 */
const MAX_LOCAL_PART_LENGTH = 64;

/**
 * Maximum allowed domain length
 */
const MAX_DOMAIN_LENGTH = 253;

/**
 * Validates an email address format
 * 
 * @param email - The email address to validate
 * @returns true if the email format is valid, false otherwise
 * 
 * @example
 * ```ts
 * isValidFormat('user@example.com'); // true
 * isValidFormat('invalid-email'); // false
 * isValidFormat('user@.com'); // false
 * ```
 */
export function isValidFormat(email: string): boolean {
  // Check for empty or non-string input
  if (!email || typeof email !== 'string') {
    return false;
  }

  // Trim whitespace
  const trimmed = email.trim();

  // Check overall length
  if (trimmed.length > MAX_EMAIL_LENGTH || trimmed.length === 0) {
    return false;
  }

  // Split into local and domain parts
  const atIndex = trimmed.lastIndexOf('@');
  if (atIndex === -1) {
    return false;
  }

  const localPart = trimmed.substring(0, atIndex);
  const domain = trimmed.substring(atIndex + 1);

  // Check local part length
  if (localPart.length > MAX_LOCAL_PART_LENGTH || localPart.length === 0) {
    return false;
  }

  // Check domain length
  if (domain.length > MAX_DOMAIN_LENGTH || domain.length === 0) {
    return false;
  }

  // Check local part doesn't end with a dot
  if (localPart.endsWith('.')) {
    return false;
  }

  // Validate against regex
  return EMAIL_REGEX.test(trimmed);
}

/**
 * Extracts the domain from an email address
 * 
 * @param email - The email address
 * @returns The domain part of the email, or null if invalid
 * 
 * @example
 * ```ts
 * extractDomain('user@example.com'); // 'example.com'
 * extractDomain('invalid'); // null
 * ```
 */
export function extractDomain(email: string): string | null {
  if (!email || typeof email !== 'string') {
    return null;
  }

  const atIndex = email.lastIndexOf('@');
  if (atIndex === -1 || atIndex === email.length - 1) {
    return null;
  }

  return email.substring(atIndex + 1).toLowerCase();
}

/**
 * Extracts the local part from an email address
 * 
 * @param email - The email address
 * @returns The local part of the email, or null if invalid
 * 
 * @example
 * ```ts
 * extractLocalPart('user@example.com'); // 'user'
 * extractLocalPart('invalid'); // null
 * ```
 */
export function extractLocalPart(email: string): string | null {
  if (!email || typeof email !== 'string') {
    return null;
  }

  const atIndex = email.lastIndexOf('@');
  if (atIndex === -1 || atIndex === 0) {
    return null;
  }

  return email.substring(0, atIndex);
}

/**
 * Normalizes an email address (lowercase, trimmed)
 * 
 * @param email - The email address to normalize
 * @returns The normalized email, or null if invalid
 * 
 * @example
 * ```ts
 * normalizeEmail('  User@EXAMPLE.COM  '); // 'user@example.com'
 * ```
 */
export function normalizeEmail(email: string): string | null {
  if (!email || typeof email !== 'string') {
    return null;
  }

  return email.trim().toLowerCase();
}



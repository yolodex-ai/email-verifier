/**
 * Tests for email detectors
 */

import { describe, it, expect } from 'vitest';
import { isDisposableEmail, isDisposableDomain } from '../src/detectors/disposable';
import { isRoleBasedEmail, isRoleBasedLocalPart } from '../src/detectors/role-based';
import { isFreeEmail, isFreeEmailDomain } from '../src/detectors/free-provider';

describe('Disposable Email Detection', () => {
  describe('isDisposableDomain', () => {
    it('should detect known disposable domains', () => {
      expect(isDisposableDomain('mailinator.com')).toBe(true);
      expect(isDisposableDomain('guerrillamail.com')).toBe(true);
      expect(isDisposableDomain('tempmail.com')).toBe(true);
      expect(isDisposableDomain('10minutemail.com')).toBe(true);
      expect(isDisposableDomain('yopmail.com')).toBe(true);
    });

    it('should not flag legitimate domains', () => {
      expect(isDisposableDomain('gmail.com')).toBe(false);
      expect(isDisposableDomain('yahoo.com')).toBe(false);
      expect(isDisposableDomain('company.com')).toBe(false);
      expect(isDisposableDomain('outlook.com')).toBe(false);
    });

    it('should be case-insensitive', () => {
      expect(isDisposableDomain('MAILINATOR.COM')).toBe(true);
      expect(isDisposableDomain('Mailinator.Com')).toBe(true);
    });

    it('should handle empty/invalid input', () => {
      expect(isDisposableDomain('')).toBe(false);
    });
  });

  describe('isDisposableEmail', () => {
    it('should detect disposable emails', () => {
      expect(isDisposableEmail('test@mailinator.com')).toBe(true);
      expect(isDisposableEmail('user@guerrillamail.com')).toBe(true);
      expect(isDisposableEmail('temp@10minutemail.com')).toBe(true);
    });

    it('should not flag legitimate emails', () => {
      expect(isDisposableEmail('john@gmail.com')).toBe(false);
      expect(isDisposableEmail('jane@company.com')).toBe(false);
    });

    it('should handle invalid input', () => {
      expect(isDisposableEmail('')).toBe(false);
      expect(isDisposableEmail('invalid-email')).toBe(false);
    });
  });
});

describe('Role-Based Email Detection', () => {
  describe('isRoleBasedLocalPart', () => {
    it('should detect common role-based prefixes', () => {
      expect(isRoleBasedLocalPart('info')).toBe(true);
      expect(isRoleBasedLocalPart('support')).toBe(true);
      expect(isRoleBasedLocalPart('admin')).toBe(true);
      expect(isRoleBasedLocalPart('sales')).toBe(true);
      expect(isRoleBasedLocalPart('hr')).toBe(true);
      expect(isRoleBasedLocalPart('noreply')).toBe(true);
      expect(isRoleBasedLocalPart('contact')).toBe(true);
      expect(isRoleBasedLocalPart('helpdesk')).toBe(true);
    });

    it('should not flag personal names', () => {
      expect(isRoleBasedLocalPart('john')).toBe(false);
      expect(isRoleBasedLocalPart('john.smith')).toBe(false);
      expect(isRoleBasedLocalPart('jsmith')).toBe(false);
      expect(isRoleBasedLocalPart('jane.doe')).toBe(false);
    });

    it('should be case-insensitive', () => {
      expect(isRoleBasedLocalPart('INFO')).toBe(true);
      expect(isRoleBasedLocalPart('Support')).toBe(true);
      expect(isRoleBasedLocalPart('ADMIN')).toBe(true);
    });

    it('should handle variations with separators', () => {
      expect(isRoleBasedLocalPart('no-reply')).toBe(true);
      expect(isRoleBasedLocalPart('customer-service')).toBe(true);
      expect(isRoleBasedLocalPart('tech-support')).toBe(true);
    });

    it('should handle empty input', () => {
      expect(isRoleBasedLocalPart('')).toBe(false);
    });
  });

  describe('isRoleBasedEmail', () => {
    it('should detect role-based emails', () => {
      expect(isRoleBasedEmail('info@company.com')).toBe(true);
      expect(isRoleBasedEmail('support@example.org')).toBe(true);
      expect(isRoleBasedEmail('admin@domain.net')).toBe(true);
      expect(isRoleBasedEmail('noreply@service.io')).toBe(true);
    });

    it('should not flag personal emails', () => {
      expect(isRoleBasedEmail('john@company.com')).toBe(false);
      expect(isRoleBasedEmail('john.smith@example.org')).toBe(false);
    });

    it('should handle invalid input', () => {
      expect(isRoleBasedEmail('')).toBe(false);
      expect(isRoleBasedEmail('invalid-email')).toBe(false);
      expect(isRoleBasedEmail('@nodomain.com')).toBe(false);
    });
  });
});

describe('Free Email Provider Detection', () => {
  describe('isFreeEmailDomain', () => {
    it('should detect major free email providers', () => {
      expect(isFreeEmailDomain('gmail.com')).toBe(true);
      expect(isFreeEmailDomain('yahoo.com')).toBe(true);
      expect(isFreeEmailDomain('hotmail.com')).toBe(true);
      expect(isFreeEmailDomain('outlook.com')).toBe(true);
      expect(isFreeEmailDomain('icloud.com')).toBe(true);
      expect(isFreeEmailDomain('protonmail.com')).toBe(true);
      expect(isFreeEmailDomain('aol.com')).toBe(true);
    });

    it('should detect international variants', () => {
      expect(isFreeEmailDomain('yahoo.co.uk')).toBe(true);
      expect(isFreeEmailDomain('hotmail.fr')).toBe(true);
      expect(isFreeEmailDomain('gmx.de')).toBe(true);
    });

    it('should not flag business domains', () => {
      expect(isFreeEmailDomain('company.com')).toBe(false);
      expect(isFreeEmailDomain('enterprise.io')).toBe(false);
      expect(isFreeEmailDomain('startup.co')).toBe(false);
    });

    it('should be case-insensitive', () => {
      expect(isFreeEmailDomain('GMAIL.COM')).toBe(true);
      expect(isFreeEmailDomain('Gmail.Com')).toBe(true);
    });

    it('should handle empty input', () => {
      expect(isFreeEmailDomain('')).toBe(false);
    });
  });

  describe('isFreeEmail', () => {
    it('should detect free email addresses', () => {
      expect(isFreeEmail('john@gmail.com')).toBe(true);
      expect(isFreeEmail('jane@yahoo.com')).toBe(true);
      expect(isFreeEmail('user@hotmail.com')).toBe(true);
    });

    it('should not flag business email addresses', () => {
      expect(isFreeEmail('john@company.com')).toBe(false);
      expect(isFreeEmail('jane@startup.io')).toBe(false);
    });

    it('should handle invalid input', () => {
      expect(isFreeEmail('')).toBe(false);
      expect(isFreeEmail('invalid-email')).toBe(false);
    });
  });
});

describe('Combined Detection Scenarios', () => {
  it('should correctly identify a disposable role-based email', () => {
    expect(isDisposableEmail('info@mailinator.com')).toBe(true);
    expect(isRoleBasedEmail('info@mailinator.com')).toBe(true);
  });

  it('should correctly identify a free provider role-based email', () => {
    expect(isFreeEmail('support@gmail.com')).toBe(true);
    expect(isRoleBasedEmail('support@gmail.com')).toBe(true);
  });

  it('should correctly identify a personal business email', () => {
    expect(isFreeEmail('john.smith@company.com')).toBe(false);
    expect(isRoleBasedEmail('john.smith@company.com')).toBe(false);
    expect(isDisposableEmail('john.smith@company.com')).toBe(false);
  });
});


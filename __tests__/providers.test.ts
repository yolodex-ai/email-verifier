import { describe, it, expect } from 'vitest';
import { detectProvider } from '../src/providers';

describe('detectProvider', () => {
  describe('Google Workspace', () => {
    it('should detect Google from aspmx.l.google.com', () => {
      const provider = detectProvider(['aspmx.l.google.com']);
      expect(provider).toEqual({
        name: 'Google Workspace',
        url: 'https://workspace.google.com',
      });
    });

    it('should detect Google from alt MX records', () => {
      const provider = detectProvider(['alt1.aspmx.l.google.com', 'alt2.aspmx.l.google.com']);
      expect(provider).toEqual({
        name: 'Google Workspace',
        url: 'https://workspace.google.com',
      });
    });
  });

  describe('Microsoft 365', () => {
    it('should detect Microsoft from outlook.com', () => {
      const provider = detectProvider(['mail.protection.outlook.com']);
      expect(provider).toEqual({
        name: 'Microsoft 365',
        url: 'https://www.microsoft.com/microsoft-365',
      });
    });

    it('should detect Microsoft from custom domain MX', () => {
      const provider = detectProvider(['company-com.mail.protection.outlook.com']);
      expect(provider).toEqual({
        name: 'Microsoft 365',
        url: 'https://www.microsoft.com/microsoft-365',
      });
    });
  });

  describe('Proofpoint', () => {
    it('should detect Proofpoint from pphosted.com', () => {
      const provider = detectProvider(['mx1.pphosted.com']);
      expect(provider).toEqual({
        name: 'Proofpoint',
        url: 'https://www.proofpoint.com',
      });
    });

    it('should detect Proofpoint Essentials', () => {
      const provider = detectProvider(['mx2-us1.ppe-hosted.com']);
      expect(provider).toEqual({
        name: 'Proofpoint Essentials',
        url: 'https://www.proofpoint.com/us/products/email-protection/essentials',
      });
    });
  });

  describe('Other providers', () => {
    it('should detect Zoho', () => {
      const provider = detectProvider(['mx.zoho.com']);
      expect(provider).toEqual({
        name: 'Zoho Mail',
        url: 'https://www.zoho.com/mail',
      });
    });

    it('should detect Fastmail', () => {
      const provider = detectProvider(['in1-smtp.messagingengine.com']);
      expect(provider).toEqual({
        name: 'Fastmail',
        url: 'https://www.fastmail.com',
      });
    });

    it('should detect ProtonMail', () => {
      const provider = detectProvider(['mail.protonmail.ch']);
      expect(provider).toEqual({
        name: 'Proton Mail',
        url: 'https://proton.me/mail',
      });
    });

    it('should detect Amazon SES', () => {
      const provider = detectProvider(['inbound-smtp.us-east-1.amazonaws.com']);
      expect(provider).toEqual({
        name: 'Amazon SES',
        url: 'https://aws.amazon.com/ses',
      });
    });
  });

  describe('Edge cases', () => {
    it('should return null for empty array', () => {
      const provider = detectProvider([]);
      expect(provider).toBeNull();
    });

    it('should return null for unknown provider', () => {
      const provider = detectProvider(['mail.unknown-provider.com']);
      expect(provider).toBeNull();
    });

    it('should be case insensitive', () => {
      const provider = detectProvider(['ASPMX.L.GOOGLE.COM']);
      expect(provider).toEqual({
        name: 'Google Workspace',
        url: 'https://workspace.google.com',
      });
    });

    it('should check all MX records', () => {
      // First MX is unknown, second is Google
      const provider = detectProvider(['mail.custom.com', 'aspmx.l.google.com']);
      expect(provider?.name).toBe('Google Workspace');
    });
  });
});


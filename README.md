# Email Verifier
[![CI](https://github.com/yolodex-ai/email-verifier/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/yolodex-ai/email-verifier/actions/workflows/ci.yml)

A simple, zero-runtime-dependency email verification library for Node.js. Verify email addresses through format validation, DNS checking, and SMTP probing.

## Features

- **Format Validation** - RFC 5322 compliant email format checking
- **DNS Verification** - MX record lookup with A record fallback
- **SMTP Probing** - RCPT TO verification without sending email
- **Catch-all Detection** - Identifies domains that accept any email
- **Provider Detection** - Identifies mail providers (Google, Microsoft, etc.)
- **Caching** - Built-in caching for performance
- **Rate Limiting** - Token bucket throttling with exponential backoff
- **Zero Dependencies** - Uses only Node.js built-ins at runtime

## Installation

```bash
npm install email-verifier-check
```

## CLI Usage

```bash
# Verify a single email
npx email-verifier-check check user@example.com

# Verify multiple emails
npx email-verifier-check check user1@a.com user2@b.com

# Output as JSON
npx email-verifier-check check user@example.com --json

# Skip SMTP check (faster, less accurate)
npx email-verifier-check check user@example.com --no-smtp

# Skip catch-all detection
npx email-verifier-check check user@example.com --no-catchall
```

## Programmatic Usage

```typescript
import { verifyEmail, verifyEmails } from "email-verifier-check";

// Verify a single email
const result = await verifyEmail("user@example.com");

console.log(result);
// {
//   email: 'user@example.com',
//   valid: true,
//   confidence: 0.95,
//   details: {
//     formatValid: true,
//     mxRecords: ['aspmx.l.google.com'],
//     smtpStatus: 'accepted',
//     catchAll: false,
//     provider: {
//       name: 'Google Workspace',
//       url: 'https://workspace.google.com'
//     }
//   }
// }

// Verify multiple emails
const results = await verifyEmails(["user1@example.com", "user2@example.com"]);
```

## Options

```typescript
interface VerifyOptions {
  // Timeout for DNS lookups in milliseconds (default: 5000)
  dnsTimeout?: number;

  // Timeout for SMTP connections in milliseconds (default: 10000)
  smtpTimeout?: number;

  // Whether to perform SMTP verification (default: true)
  smtpCheck?: boolean;

  // Whether to perform catch-all detection (default: true)
  catchAllCheck?: boolean;

  // The sender email to use in SMTP MAIL FROM (default: test@example.com)
  senderEmail?: string;

  // SMTP port to connect to (default: 25)
  smtpPort?: number;
}

// Example with options
const result = await verifyEmail("user@example.com", {
  smtpTimeout: 15000,
  catchAllCheck: false,
});
```

## Understanding Results

### Confidence Scores

| Scenario                 | Valid   | Confidence | Meaning                       |
| ------------------------ | ------- | ---------- | ----------------------------- |
| Invalid format           | `false` | 0%         | Email syntax is invalid       |
| No DNS records           | `false` | 0%         | Domain cannot receive email   |
| SMTP rejected (5xx)      | `false` | 0%         | Mailbox doesn't exist         |
| SMTP timeout/error       | `true`  | 50%        | Could be valid, can't confirm |
| Accepted + catch-all     | `true`  | 60%        | Domain accepts any email      |
| Accepted + NOT catch-all | `true`  | 95%        | High confidence valid         |

### SMTP Status Values

- `accepted` - Server returned 2xx to RCPT TO
- `rejected` - Server returned 5xx to RCPT TO
- `unknown` - Server returned 4xx or connection failed
- `skipped` - SMTP check was not performed

### Supported Mail Providers

The library automatically detects these mail providers from MX records:

- Google Workspace
- Microsoft 365
- Proofpoint / Proofpoint Essentials
- Mimecast
- Yahoo Mail
- Zoho Mail
- Fastmail
- Proton Mail
- iCloud Mail
- Amazon SES
- SendGrid
- Mailgun
- Postmark
- And more...

## How It Works

### Verification Pipeline

1. **Format Check** - Validates email against RFC 5322 pattern
2. **DNS Check** - Queries MX records, falls back to A record per RFC 5321
3. **SMTP Probe** - Connects to mail server and tests with `RCPT TO`
4. **Catch-all Detection** - Tests with fake `x9x0{localpart}@domain`

### Rate Limiting

The library includes built-in rate limiting to avoid overwhelming mail servers:

- Token bucket algorithm (10 requests per host, 1/second refill)
- Exponential backoff on failures (5s initial, 5min max)
- Automatic recovery after successful requests

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Build
npm run build

# Type check
npm run lint
```

## License

MIT

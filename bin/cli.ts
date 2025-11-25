#!/usr/bin/env node

/**
 * Email Verifier CLI
 * 
 * A command-line interface for verifying email addresses.
 * 
 * Usage:
 *   npx email-verifier check user@example.com
 *   npx email-verifier check user1@a.com user2@b.com
 *   npx email-verifier check user@example.com --json
 *   npx email-verifier check user@example.com --no-smtp
 */

import { verifyEmail, verifyEmails } from '../src/index';
import type { VerificationResult } from '../src/types';

/**
 * ANSI color codes for terminal output
 */
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
};

/**
 * Command line arguments
 */
interface CliArgs {
  command: string;
  emails: string[];
  json: boolean;
  noSmtp: boolean;
  noCatchAll: boolean;
  timeout: number;
  help: boolean;
  version: boolean;
}

/**
 * Parses command line arguments
 */
function parseArgs(args: string[]): CliArgs {
  const result: CliArgs = {
    command: '',
    emails: [],
    json: false,
    noSmtp: false,
    noCatchAll: false,
    timeout: 10000,
    help: false,
    version: false,
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (!arg) {
      i++;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      result.help = true;
    } else if (arg === '--version' || arg === '-v') {
      result.version = true;
    } else if (arg === '--json' || arg === '-j') {
      result.json = true;
    } else if (arg === '--no-smtp') {
      result.noSmtp = true;
    } else if (arg === '--no-catchall') {
      result.noCatchAll = true;
    } else if (arg === '--timeout' || arg === '-t') {
      i++;
      const nextArg = args[i];
      result.timeout = nextArg ? parseInt(nextArg, 10) || 10000 : 10000;
    } else if (arg.startsWith('-')) {
      // Unknown flag, ignore
    } else if (!result.command) {
      result.command = arg;
    } else {
      result.emails.push(arg);
    }

    i++;
  }

  return result;
}

/**
 * Prints help message
 */
function printHelp(): void {
  console.log(`
${colors.bold}Email Verifier${colors.reset}

Verify email addresses through format validation, DNS checking, and SMTP probing.

${colors.bold}USAGE${colors.reset}
  email-verifier <command> [options] [emails...]

${colors.bold}COMMANDS${colors.reset}
  check <email...>    Verify one or more email addresses

${colors.bold}OPTIONS${colors.reset}
  -h, --help          Show this help message
  -v, --version       Show version number
  -j, --json          Output results as JSON
  --no-smtp           Skip SMTP verification
  --no-catchall       Skip catch-all detection
  -t, --timeout <ms>  SMTP timeout in milliseconds (default: 10000)

${colors.bold}EXAMPLES${colors.reset}
  ${colors.dim}# Verify a single email${colors.reset}
  email-verifier check user@example.com

  ${colors.dim}# Verify multiple emails${colors.reset}
  email-verifier check user1@a.com user2@b.com

  ${colors.dim}# Output as JSON${colors.reset}
  email-verifier check user@example.com --json

  ${colors.dim}# Skip SMTP check (faster, less accurate)${colors.reset}
  email-verifier check user@example.com --no-smtp
`);
}

/**
 * Prints version number
 */
function printVersion(): void {
  console.log('1.0.0');
}

/**
 * Formats a single result for human-readable output
 */
function formatResult(result: VerificationResult): string {
  const validIcon = result.valid 
    ? `${colors.green}✓${colors.reset}` 
    : `${colors.red}✗${colors.reset}`;
  
  const confidenceColor = result.confidence >= 0.8 
    ? colors.green 
    : result.confidence >= 0.5 
      ? colors.yellow 
      : colors.red;

  const confidencePercent = Math.round(result.confidence * 100);

  let output = `\n${validIcon} ${colors.bold}${result.email}${colors.reset}\n`;
  output += `  ${colors.dim}Valid:${colors.reset} ${result.valid ? 'Yes' : 'No'}\n`;
  output += `  ${colors.dim}Confidence:${colors.reset} ${confidenceColor}${confidencePercent}%${colors.reset}\n`;
  
  if (result.details.formatValid) {
    output += `  ${colors.dim}Format:${colors.reset} ${colors.green}Valid${colors.reset}\n`;
  } else {
    output += `  ${colors.dim}Format:${colors.reset} ${colors.red}Invalid${colors.reset}\n`;
  }

  if (result.details.mxRecords.length > 0) {
    output += `  ${colors.dim}MX Records:${colors.reset} ${result.details.mxRecords.slice(0, 3).join(', ')}`;
    if (result.details.mxRecords.length > 3) {
      output += ` ${colors.dim}(+${result.details.mxRecords.length - 3} more)${colors.reset}`;
    }
    output += '\n';
  }

  if (result.details.smtpStatus !== 'skipped') {
    const smtpColor = result.details.smtpStatus === 'accepted'
      ? colors.green
      : result.details.smtpStatus === 'rejected'
        ? colors.red
        : colors.yellow;
    output += `  ${colors.dim}SMTP Status:${colors.reset} ${smtpColor}${result.details.smtpStatus}${colors.reset}\n`;
  }

  if (result.details.catchAll !== null) {
    output += `  ${colors.dim}Catch-all:${colors.reset} ${result.details.catchAll ? colors.yellow + 'Yes' : colors.green + 'No'}${colors.reset}\n`;
  }

  if (result.details.provider) {
    output += `  ${colors.dim}Provider:${colors.reset} ${colors.cyan}${result.details.provider.name}${colors.reset}\n`;
    output += `  ${colors.dim}Provider URL:${colors.reset} ${result.details.provider.url}\n`;
  }

  return output;
}

/**
 * Formats results as a table for multiple emails
 */
function formatTable(results: VerificationResult[]): string {
  const header = `
${colors.bold}Email${' '.repeat(40)}Valid  Confidence  SMTP      Catch-all  Provider${colors.reset}
${'─'.repeat(110)}`;

  const rows = results.map((r) => {
    const email = r.email.padEnd(45).slice(0, 45);
    const valid = r.valid ? `${colors.green}Yes${colors.reset}  ` : `${colors.red}No${colors.reset}   `;
    const confidence = `${Math.round(r.confidence * 100)}%`.padStart(3).padEnd(12);
    const smtp = r.details.smtpStatus.padEnd(10);
    const catchAll = (r.details.catchAll === null 
      ? '-' 
      : r.details.catchAll 
        ? 'Yes' 
        : 'No').padEnd(11);
    const provider = r.details.provider?.name || '-';

    return `${email}${valid}${confidence}${smtp}${catchAll}${provider}`;
  });

  return header + '\n' + rows.join('\n');
}

/**
 * Main CLI entry point
 */
async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (args.version) {
    printVersion();
    process.exit(0);
  }

  if (args.command !== 'check' || args.emails.length === 0) {
    console.error(`${colors.red}Error: Please provide email addresses to check${colors.reset}`);
    console.error(`\nUsage: email-verifier check <email...>`);
    console.error(`\nRun 'email-verifier --help' for more information.`);
    process.exit(1);
  }

  const options = {
    smtpCheck: !args.noSmtp,
    catchAllCheck: !args.noCatchAll,
    smtpTimeout: args.timeout,
  };

  try {
    const firstEmail = args.emails[0];
    if (args.emails.length === 1 && firstEmail) {
      // Single email
      const result = await verifyEmail(firstEmail, options);

      if (args.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(formatResult(result));
      }

      process.exit(result.valid ? 0 : 1);
    } else {
      // Multiple emails
      console.log(`\n${colors.cyan}Verifying ${args.emails.length} email addresses...${colors.reset}\n`);
      
      const results = await verifyEmails(args.emails, options);

      if (args.json) {
        console.log(JSON.stringify(results, null, 2));
      } else {
        console.log(formatTable(results));
        
        const validCount = results.filter((r) => r.valid).length;
        console.log(`\n${colors.dim}Summary: ${colors.reset}${colors.green}${validCount}${colors.reset} valid, ${colors.red}${results.length - validCount}${colors.reset} invalid`);
      }

      const allValid = results.every((r) => r.valid);
      process.exit(allValid ? 0 : 1);
    }
  } catch (error) {
    console.error(`${colors.red}Error:${colors.reset}`, error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();


/**
 * Free email provider detection
 *
 * Identifies emails from free consumer email providers like Gmail, Yahoo, etc.
 * This can be useful for B2B contexts where you want to identify
 * personal vs business email addresses.
 */

/**
 * Known free email provider domains
 */
const FREE_EMAIL_DOMAINS = new Set([
  // Google
  'gmail.com',
  'googlemail.com',

  // Microsoft
  'outlook.com',
  'hotmail.com',
  'hotmail.co.uk',
  'hotmail.fr',
  'hotmail.de',
  'hotmail.it',
  'hotmail.es',
  'live.com',
  'live.co.uk',
  'live.fr',
  'live.de',
  'live.it',
  'live.es',
  'msn.com',

  // Yahoo
  'yahoo.com',
  'yahoo.co.uk',
  'yahoo.fr',
  'yahoo.de',
  'yahoo.it',
  'yahoo.es',
  'yahoo.ca',
  'yahoo.com.au',
  'yahoo.co.in',
  'yahoo.co.jp',
  'ymail.com',
  'rocketmail.com',

  // Apple
  'icloud.com',
  'me.com',
  'mac.com',

  // AOL
  'aol.com',
  'aim.com',

  // Proton
  'protonmail.com',
  'protonmail.ch',
  'proton.me',
  'pm.me',

  // Zoho
  'zoho.com',
  'zohomail.com',

  // Mail.com
  'mail.com',
  'email.com',

  // GMX
  'gmx.com',
  'gmx.net',
  'gmx.de',
  'gmx.at',
  'gmx.ch',

  // Web.de
  'web.de',

  // Yandex
  'yandex.com',
  'yandex.ru',
  'ya.ru',

  // Mail.ru
  'mail.ru',
  'inbox.ru',
  'list.ru',
  'bk.ru',

  // Tutanota
  'tutanota.com',
  'tutanota.de',
  'tutamail.com',
  'tuta.io',

  // Fastmail (has free tier)
  'fastmail.com',
  'fastmail.fm',

  // Other popular free providers
  'rediffmail.com',
  'sina.com',
  'qq.com',
  '163.com',
  '126.com',
  'yeah.net',
  'naver.com',
  'daum.net',
  'hanmail.net',
  'libero.it',
  'virgilio.it',
  'laposte.net',
  'orange.fr',
  'sfr.fr',
  'free.fr',
  'wanadoo.fr',
  't-online.de',
  'arcor.de',
  'freenet.de',
  'comcast.net',
  'verizon.net',
  'att.net',
  'sbcglobal.net',
  'bellsouth.net',
  'cox.net',
  'charter.net',
  'earthlink.net',
  'juno.com',
  'netzero.net',

  // Regional providers
  'seznam.cz',
  'wp.pl',
  'o2.pl',
  'interia.pl',
  'onet.pl',
  'ukr.net',
  'rambler.ru',
  'bigmir.net',
  'abv.bg',
  'centrum.cz',
  'atlas.cz',
  'azet.sk',
  'zoznam.sk',
  'pobox.sk',
  'post.cz',
  'volny.cz',
  'tiscali.it',
  'alice.it',
  'tin.it',
  'blu.it',
  'supereva.it',
  'inwind.it',
  'iol.it',
  'kataweb.it',
  'jumpy.it',
]);

/**
 * Checks if a domain is a known free email provider
 *
 * @param domain - The email domain to check
 * @returns true if the domain is a free email provider
 *
 * @example
 * ```ts
 * isFreeEmailDomain('gmail.com'); // true
 * isFreeEmailDomain('company.com'); // false
 * ```
 */
export function isFreeEmailDomain(domain: string): boolean {
  if (!domain) return false;
  return FREE_EMAIL_DOMAINS.has(domain.toLowerCase());
}

/**
 * Checks if an email address is from a free email provider
 *
 * @param email - The email address to check
 * @returns true if the email is from a free provider
 *
 * @example
 * ```ts
 * isFreeEmail('john@gmail.com'); // true
 * isFreeEmail('john@company.com'); // false
 * ```
 */
export function isFreeEmail(email: string): boolean {
  if (!email) return false;

  const atIndex = email.lastIndexOf('@');
  if (atIndex === -1) return false;

  const domain = email.substring(atIndex + 1).toLowerCase();
  return isFreeEmailDomain(domain);
}


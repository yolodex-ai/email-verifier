/**
 * Disposable/temporary email domain detection
 *
 * Detects known disposable email services that are commonly used
 * to avoid spam filters or for temporary signups.
 */

/**
 * List of known disposable email domains
 * This is a curated list of the most common ones
 */
const DISPOSABLE_DOMAINS = new Set([
  // Popular disposable services
  '10minutemail.com',
  '10minutemail.net',
  'tempmail.com',
  'temp-mail.org',
  'guerrillamail.com',
  'guerrillamail.org',
  'guerrillamail.net',
  'sharklasers.com',
  'mailinator.com',
  'mailinator2.com',
  'mailinater.com',
  'throwaway.email',
  'throwawaymail.com',
  'fakeinbox.com',
  'trashmail.com',
  'trashmail.net',
  'mailnesia.com',
  'mytrashmail.com',
  'getairmail.com',
  'getnada.com',
  'tempail.com',
  'dispostable.com',
  'yopmail.com',
  'yopmail.fr',
  'yopmail.net',
  'cool.fr.nf',
  'jetable.fr.nf',
  'nospam.ze.tc',
  'nomail.xl.cx',
  'mega.zik.dj',
  'speed.1s.fr',
  'courriel.fr.nf',
  'moncourrier.fr.nf',
  'monemail.fr.nf',
  'monmail.fr.nf',
  'mailcatch.com',
  'mailexpire.com',
  'mailmoat.com',
  'spamgourmet.com',
  'spambox.us',
  'spamfree24.org',
  'spamherelots.com',
  'spamobox.com',
  'tempomail.fr',
  'temporaryemail.net',
  'temporaryforwarding.com',
  'tempr.email',
  'tempsky.com',
  'thankyou2010.com',
  'thisisnotmyrealemail.com',
  'throam.com',
  'tmpmail.net',
  'tmpmail.org',
  'tradermail.info',
  'wegwerfmail.de',
  'wegwerfmail.net',
  'wegwerfmail.org',
  'wh4f.org',
  'whyspam.me',
  'willselfdestruct.com',
  'xemaps.com',
  'xents.com',
  'xmaily.com',
  'xoxy.net',
  'zapmail.com',
  'zoemail.org',
  'mintemail.com',
  'mohmal.com',
  'emailondeck.com',
  'tempmailaddress.com',
  'burnermail.io',
  'maildrop.cc',
  'inboxkitten.com',
  'tempinbox.com',
  'fakemailgenerator.com',
  'emailfake.com',
  'generator.email',
  'crazymailing.com',
  'discard.email',
  'discardmail.com',
  'disposableaddress.com',
  'disposableinbox.com',
  'dropmail.me',
  'dumpmail.de',
  'emailtemporario.com.br',
  'eelmail.com',
  'fakemail.net',
  'filzmail.com',
  'fixmail.tk',
  'fleckens.hu',
  'freemail.ms',
  'getonemail.com',
  'gishpuppy.com',
  'grr.la',
  'guerillamail.biz',
  'guerillamail.com',
  'guerillamail.de',
  'guerillamail.info',
  'guerillamail.net',
  'guerillamail.org',
  'haltospam.com',
  'harakirimail.com',
  'imgof.com',
  'imstations.com',
  'incognitomail.com',
  'incognitomail.net',
  'incognitomail.org',
  'infocom.zp.ua',
  'instant-mail.de',
  'ipoo.org',
  'irish2me.com',
  'jetable.com',
  'kasmail.com',
  'kaspop.com',
  'keepmymail.com',
  'killmail.com',
  'killmail.net',
  'klzlv.com',
  'kulturbetrieb.info',
  'kurzepost.de',
  'lifebyfood.com',
  'link2mail.net',
  'litedrop.com',
  'lol.ovpn.to',
  'lookugly.com',
  'lopl.co.cc',
  'lortemail.dk',
  'lovemeleaveme.com',
  'lr78.com',
  'maboard.com',
  'mail-hierarchie.net',
  'mail-temporaire.fr',
  'mail.by',
  'mail.mezimages.net',
  'mail.zp.ua',
  'mail2rss.org',
  'mail333.com',
  'mailbidon.com',
  'mailblocks.com',
  'mailcatch.com',
  'mailde.de',
  'mailde.info',
  'maildx.com',
  'mailed.ro',
  'mailforspam.com',
  'mailfree.ga',
  'mailfreeonline.com',
  'mailguard.me',
  'mailimate.com',
  'mailin8r.com',
  'mailinater.com',
  'mailincubator.com',
  'mailismagic.com',
  'mailme.ir',
  'mailme.lv',
  'mailme24.com',
  'mailmetrash.com',
  'mailnull.com',
  'mailorg.org',
  'mailsac.com',
  'mailseal.de',
  'mailshell.com',
  'mailsiphon.com',
  'mailtemp.info',
  'mailtothis.com',
  'mailzilla.com',
  'mailzilla.org',
  'makemetheking.com',
]);

/**
 * Checks if an email domain is a known disposable email service
 *
 * @param domain - The email domain to check
 * @returns true if the domain is a disposable email service
 *
 * @example
 * ```ts
 * isDisposableDomain('mailinator.com'); // true
 * isDisposableDomain('gmail.com'); // false
 * ```
 */
export function isDisposableDomain(domain: string): boolean {
  if (!domain) return false;
  return DISPOSABLE_DOMAINS.has(domain.toLowerCase());
}

/**
 * Checks if an email address is from a disposable email service
 *
 * @param email - The email address to check
 * @returns true if the email is from a disposable service
 */
export function isDisposableEmail(email: string): boolean {
  if (!email) return false;

  const atIndex = email.lastIndexOf('@');
  if (atIndex === -1) return false;

  const domain = email.substring(atIndex + 1).toLowerCase();
  return isDisposableDomain(domain);
}


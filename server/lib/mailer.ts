import { config } from '../env.ts';
import { HttpError } from './http.ts';
import { log } from './log.ts';

export interface MailResult {
  delivered: boolean;
  /** Development only: the action link, returned when no email provider is configured. */
  devLink?: string;
}

/**
 * Sends transactional email through Resend's HTTP API when RESEND_API_KEY is set.
 * Without a provider (development), the link is logged to the server console and returned to the
 * client so flows remain testable; in production a provider is mandatory.
 */
export async function sendMail(to: string, subject: string, text: string, link: string): Promise<MailResult> {
  if (config.resendApiKey) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${config.resendApiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: config.mailFrom, to, subject, text: `${text}\n\n${link}\n` }),
    });
    if (!res.ok) {
      log.error('mail', `Resend failed (${res.status}): ${await res.text()}`);
      throw new HttpError(502, 'Could not send the email. Please try again in a moment.', 'mail_failed');
    }
    return { delivered: true };
  }
  if (config.isProd) {
    log.error('mail', 'RESEND_API_KEY is not set — set it, or set REQUIRE_EMAIL_VERIFICATION=false to run without email.');
    throw new HttpError(503, 'Email is not configured on this server, so this step cannot be completed.', 'mail_unconfigured');
  }
  log.warn('mail', `[DEV — no email provider] ${subject} for ${to}: ${link}`);
  return { delivered: false, devLink: link };
}

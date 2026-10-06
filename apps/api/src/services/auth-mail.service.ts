import { config, isProduction, logger } from '../config';
import { enqueueNotification } from './notifications.service';

/**
 * Delivery of the two transactional authentication emails (address verification
 * and password recovery).
 *
 * The one-time link is passed straight to the transport and is never written to
 * the database: the transactional outbox only stores a secret-free copy for the
 * in-app inbox, because a stored reset link would be replayable straight out of a
 * backup. The message itself is available in-process through `recentAuthMails`,
 * which is what local development and the test suite read.
 */

export type AuthMailKind = 'email_verification' | 'password_reset';

/** Account fields a message needs. Never includes password material. */
export interface AuthMailRecipient {
  id: string;
  email: string;
  displayName: string;
}

export interface AuthMail {
  kind: AuthMailKind;
  recipient: string;
  subject: string;
  body: string;
  link: string;
  issuedAt: Date;
}

/** Minimal transport contract: anything that can deliver one message. */
export type AuthMailTransport = (mail: AuthMail) => Promise<void>;

const RECENT_LIMIT = 20;
const recentMails: AuthMail[] = [];

const transports = new Map<AuthMailKind, AuthMailTransport>();

/** Registers the transport used for one kind of authentication email. */
export function registerAuthMailTransport(kind: AuthMailKind, transport: AuthMailTransport): void {
  transports.set(kind, transport);
}

export function resetAuthMailTransports(): void {
  transports.clear();
}

/** In-process copies of recently issued authentication emails (newest last). */
export function recentAuthMails(kind?: AuthMailKind): AuthMail[] {
  const mails = kind ? recentMails.filter(mail => mail.kind === kind) : recentMails;
  return [...mails];
}

export function clearRecentAuthMails(): void {
  recentMails.length = 0;
}

function authLink(path: string, token: string): string {
  const base = config.frontendUrl.replace(/\/+$/, '');
  return `${base}${path}?token=${encodeURIComponent(token)}`;
}

function remember(mail: AuthMail): void {
  recentMails.push(mail);
  while (recentMails.length > RECENT_LIMIT) recentMails.shift();
}

async function deliver(mail: AuthMail): Promise<void> {
  remember(mail);

  const transport = transports.get(mail.kind);
  if (transport) {
    await transport(mail);
    return;
  }

  // No provider configured (this repository ships without one): record that a
  // message exists without leaking the link into production logs.
  if (isProduction) {
    logger.warn({ kind: mail.kind, recipient: mail.recipient }, 'No mail transport configured');
  } else {
    logger.info(
      { kind: mail.kind, recipient: mail.recipient, link: mail.link },
      '[development-auth-mail] verification/recovery link'
    );
  }
}

async function sendVerificationMail(user: AuthMailRecipient, token: string): Promise<void> {
  const link = authLink('/verify-email', token);
  const kind: AuthMailKind = 'email_verification';

  await deliver({
    kind,
    recipient: user.email,
    subject: 'Verify your email address',
    body: [
      `Hi ${user.displayName},`,
      '',
      'Confirm this address to activate your account:',
      link,
      '',
      'If you did not create an account you can ignore this message.',
    ].join('\n'),
    link,
    issuedAt: new Date(),
  });

  await enqueueNotification({
    userId: user.id,
    type: 'email_verification',
    channel: 'email',
    subject: 'Verify your email address',
    body: 'Confirm your email address to activate your account. Open the link we emailed you.',
    deduplicationKey: `auth:${kind}:${user.id}`,
  });
}

async function sendPasswordResetMail(user: AuthMailRecipient, token: string): Promise<void> {
  const link = authLink('/reset-password', token);
  const kind: AuthMailKind = 'password_reset';

  await deliver({
    kind,
    recipient: user.email,
    subject: 'Reset your password',
    body: [
      `Hi ${user.displayName},`,
      '',
      `Use this link within ${config.auth.passwordResetTtlMinutes} minutes to choose a new password:`,
      link,
      '',
      'If you did not request a password reset, no action is needed.',
    ].join('\n'),
    link,
    issuedAt: new Date(),
  });

  await enqueueNotification({
    userId: user.id,
    type: 'password_reset',
    channel: 'email',
    subject: 'Reset your password',
    body: 'A password reset was requested for your account. Open the link we emailed you.',
    deduplicationKey: `auth:${kind}:${user.id}`,
  });
}

export { sendPasswordResetMail, sendVerificationMail };

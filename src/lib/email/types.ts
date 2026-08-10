/**
 * Provider-agnostic email contract. Application code must only ever talk to
 * `EmailService` — never call Resend (or any provider) directly.
 */
export type EmailAttachment = {
  filename: string;
  /** Base64-encoded file contents. */
  content: string;
  contentType?: string;
};

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  attachments?: EmailAttachment[];
};

export type EmailSendResult =
  | { ok: true; providerMessageId: string | null }
  /**
   * `retryable` separates transient provider trouble (rate limits, 5xx, network
   * timeouts) from permanent rejection (bad recipient, suppressed address). Only
   * the former should be re-queued; retrying the latter burns sending reputation.
   */
  | { ok: false; error: string; retryable: boolean };

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<EmailSendResult>;
}

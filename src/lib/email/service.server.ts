import type { EmailMessage, EmailProvider, EmailSendResult } from "./types";
import { ResendProvider, UnconfiguredProvider } from "./resend.server";

/**
 * The only entry point the rest of the app uses to send email.
 * Swap providers here — callers never change.
 */
export class EmailService {
  constructor(private readonly provider: EmailProvider) {}

  get providerName(): string {
    return this.provider.name;
  }

  async send(message: EmailMessage): Promise<EmailSendResult> {
    if (!message.to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(message.to)) {
      // A malformed address will never become valid by retrying.
      return {
        ok: false,
        error: "Recipient email address is missing or invalid",
        retryable: false,
      };
    }
    return this.provider.send(message);
  }
}

export function createEmailService(): EmailService {
  const apiKey = process.env["RESEND_API_KEY"];
  const from = process.env["EMAIL_FROM"];
  if (!apiKey || !from) return new EmailService(new UnconfiguredProvider());
  return new EmailService(new ResendProvider(apiKey, from));
}

export const emailService = {
  send: (message: EmailMessage) => createEmailService().send(message),
};

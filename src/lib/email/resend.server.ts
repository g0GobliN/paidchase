import type { EmailMessage, EmailProvider, EmailSendResult } from "./types";

/** Resend implementation of the EmailProvider interface. Server-only. */
export class ResendProvider implements EmailProvider {
  readonly name = "resend";

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(message: EmailMessage): Promise<EmailSendResult> {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          from: this.from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
          ...(message.html ? { html: message.html } : {}),
          ...(message.replyTo ? { reply_to: message.replyTo } : {}),
        }),
      });

      const raw = await response.text();
      if (!response.ok) {
        console.error(`[email:resend] send failed [${response.status}]: ${raw}`);
        return { ok: false, error: `Resend rejected the message (${response.status})` };
      }

      let providerMessageId: string | null = null;
      try {
        providerMessageId = (JSON.parse(raw) as { id?: string }).id ?? null;
      } catch {
        providerMessageId = null;
      }
      return { ok: true, providerMessageId };
    } catch (error) {
      console.error("[email:resend] transport error", error);
      return { ok: false, error: "Could not reach the email provider" };
    }
  }
}

/**
 * Used when no provider is configured. It never pretends a send succeeded —
 * it fails loudly so reminders are marked failed and can be retried.
 */
export class UnconfiguredProvider implements EmailProvider {
  readonly name = "unconfigured";
  async send(): Promise<EmailSendResult> {
    return {
      ok: false,
      error: "Email sending is not configured yet (missing RESEND_API_KEY or EMAIL_FROM).",
    };
  }
}

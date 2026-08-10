import { formatMoney } from "./currency";

/**
 * The single source of truth for template variable rendering.
 * Never duplicate `{{var}}` replacement logic anywhere else.
 */
export type TemplateVariables = {
  client_name: string;
  client_company: string;
  invoice_number: string;
  amount: string;
  currency: string;
  due_date: string;
  business_name: string;
  sender_name: string;
  payment_instructions: string;
};

export const TEMPLATE_VARIABLE_NAMES: (keyof TemplateVariables)[] = [
  "client_name",
  "client_company",
  "invoice_number",
  "amount",
  "currency",
  "due_date",
  "business_name",
  "sender_name",
  "payment_instructions",
];

export function renderTemplate(template: string, vars: TemplateVariables): string {
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (match, key: string) => {
    const value = (vars as Record<string, string | undefined>)[key];
    return value === undefined ? match : value;
  });
}

/**
 * Renders an email body and tidies the result.
 *
 * A variable that resolves to an empty string (an unset `payment_instructions`, say)
 * otherwise leaves a hole where its paragraph was, so runs of blank lines collapse to
 * a single blank line and leading/trailing whitespace is trimmed.
 */
export function renderBody(template: string, vars: TemplateVariables): string {
  return renderTemplate(template, vars)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Subjects are a single line — a multi-line variable must not break the header. */
const MAX_SUBJECT_LENGTH = 200;

export function renderSubject(template: string, vars: TemplateVariables): string {
  const rendered = renderTemplate(template, vars).replace(/\s+/g, " ").trim();
  return rendered.length > MAX_SUBJECT_LENGTH
    ? `${rendered.slice(0, MAX_SUBJECT_LENGTH - 1).trimEnd()}…`
    : rendered;
}

export function formatDueDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function buildTemplateVariables(input: {
  clientName: string | null;
  clientCompany: string | null;
  invoiceNumber: string;
  amount: number | string;
  currency: string;
  dueDate: string;
  businessName: string | null;
  senderName: string | null;
  paymentInstructions?: string | null;
}): TemplateVariables {
  return {
    client_name: input.clientName ?? "there",
    client_company: input.clientCompany ?? "",
    invoice_number: input.invoiceNumber,
    amount: formatMoney(input.amount, input.currency),
    currency: input.currency,
    due_date: formatDueDate(input.dueDate),
    business_name: input.businessName ?? "",
    sender_name: input.senderName ?? "",
    // Empty rather than a placeholder: the system templates carry this tag on its own
    // paragraph, and renderBody collapses the gap when there is nothing to say.
    payment_instructions: input.paymentInstructions?.trim() ?? "",
  };
}

/** Very small plain-text -> HTML conversion for reminder emails. */
export function textToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#111827;white-space:pre-wrap">${escaped}</div>`;
}

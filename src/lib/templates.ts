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
];

export function renderTemplate(template: string, vars: TemplateVariables): string {
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (match, key: string) => {
    const value = (vars as Record<string, string | undefined>)[key];
    return value === undefined ? match : value;
  });
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

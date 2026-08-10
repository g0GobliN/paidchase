import { formatMoney } from "@/lib/currency";
import { formatDueDate } from "@/lib/templates";

export type InvoicePdfData = {
  businessName: string;
  senderEmail: string;
  clientName: string;
  clientEmail: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  description: string;
  amount: number;
  currency: string;
  paymentInstructions: string;
};

/** Minimal, dependency-free single-page PDF writer (Helvetica, ASCII text). */
function escapePdfText(text: string): string {
  return text
    .normalize("NFKD")
    // eslint-disable-next-line no-control-regex
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

type Line = { text: string; size: number; bold?: boolean; y: number; x?: number };

function buildContent(lines: Line[]): string {
  return lines
    .map(
      (line) =>
        `BT /${line.bold ? "F2" : "F1"} ${line.size} Tf 1 0 0 1 ${line.x ?? 56} ${line.y} Tm (${escapePdfText(line.text)}) Tj ET`,
    )
    .join("\n");
}

export function generateInvoicePdf(data: InvoicePdfData): Blob {
  const lines: Line[] = [];
  let y = 780;
  const push = (text: string, size = 10, bold = false, gap = 16, x?: number) => {
    lines.push({ text, size, bold, y, ...(x === undefined ? {} : { x }) });
    y -= gap;
  };

  push("INVOICE", 22, true, 12);
  push(data.businessName || "Your business", 11, true, 14);
  if (data.senderEmail) push(data.senderEmail, 10, false, 26);
  else y -= 12;

  push("Bill to", 9, true, 14);
  push(data.clientName, 11, false, 14);
  if (data.clientEmail) push(data.clientEmail, 10, false, 26);
  else y -= 12;

  push(`Invoice number:  ${data.invoiceNumber}`, 10, false, 14);
  push(`Invoice date:    ${formatDueDate(data.issueDate)}`, 10, false, 14);
  push(`Due date:        ${formatDueDate(data.dueDate)}`, 10, false, 28);

  push("Description", 9, true, 16);
  const description = data.description || "Services rendered";
  for (const chunk of description.match(/.{1,80}(\s|$)/g) ?? [description]) {
    push(chunk.trim(), 10, false, 14);
  }
  y -= 12;
  push(`Amount due:  ${formatMoney(data.amount, data.currency)} ${data.currency}`, 14, true, 30);

  push("Payment instructions", 9, true, 16);
  const instructions = data.paymentInstructions || "Please use the payment details agreed with us.";
  for (const chunk of instructions.match(/.{1,80}(\s|$)/g) ?? [instructions]) {
    push(chunk.trim(), 10, false, 14);
  }

  const content = buildContent(lines);
  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i += 1) bytes[i] = pdf.charCodeAt(i) & 0xff;
  return new Blob([bytes], { type: "application/pdf" });
}

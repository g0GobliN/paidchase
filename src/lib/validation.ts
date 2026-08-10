import { z } from "zod";
import { SUPPORTED_CURRENCIES } from "./currency";

export const emailSchema = z.string().trim().email("Enter a valid email address");

export const clientInputSchema = z.object({
  name: z.string().trim().min(1, "Client name is required").max(120),
  company: z.string().trim().max(120).optional().nullable(),
  email: z.union([emailSchema, z.literal("")]).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});
export type ClientInput = z.infer<typeof clientInputSchema>;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date")
  .refine((v) => !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime()), "Enter a valid date");

export const invoiceInputSchema = z.object({
  client_id: z.string().uuid("Select a client"),
  invoice_number: z.string().trim().min(1, "Invoice number is required").max(40),
  amount: z
    .number({ invalid_type_error: "Please enter a valid amount" })
    .positive("Amount must be greater than zero")
    .max(99999999),
  currency: z.enum(SUPPORTED_CURRENCIES),
  description: z.string().trim().max(2000).optional().nullable(),
  issue_date: isoDate,
  due_date: isoDate,
  sequence_id: z.string().uuid().nullable().optional(),
  pdf_path: z.string().trim().max(400).nullable().optional(),
});
export type InvoiceInput = z.infer<typeof invoiceInputSchema>;

export const profileInputSchema = z.object({
  business_name: z.string().trim().max(120).optional().nullable(),
  sender_name: z.string().trim().max(120).optional().nullable(),
  email: z.union([emailSchema, z.literal("")]).optional().nullable(),
  currency: z.enum(SUPPORTED_CURRENCIES).optional(),
  default_sequence_id: z.string().uuid().nullable().optional(),
  onboarding_completed: z.boolean().optional(),
});
export type ProfileInput = z.infer<typeof profileInputSchema>;

export function firstErrorMessage(error: unknown, fallback = "Something went wrong"): string {
  if (error instanceof z.ZodError) return error.issues[0]?.message ?? fallback;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

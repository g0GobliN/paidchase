import { supabase } from "@/integrations/supabase/client";

/** Upload a PDF into the private invoice-pdfs bucket under the current user. */
export async function uploadInvoicePdf(file: Blob, filename: string): Promise<string> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) throw new Error("Sign in to upload invoice files.");

  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${user.id}/${Date.now()}-${safeName}`;

  const { error } = await supabase.storage.from("invoice-pdfs").upload(path, file, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (error) throw new Error(error.message || "Could not upload the PDF.");
  return path;
}

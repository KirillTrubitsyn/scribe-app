import { createAdminClient } from "./server";

const BUCKET = "audio-files";

/**
 * Create a signed URL for uploading a file to Supabase Storage.
 */
export async function getSignedUploadUrl(
  path: string,
  expiresIn = 3600
): Promise<string> {
  const supabase = createAdminClient();

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUploadUrl(path);

  if (error) {
    console.error("[Storage] Failed to create signed upload URL:", error);
    throw new Error(`Failed to create upload URL: ${error.message}`);
  }

  return data.signedUrl;
}

/**
 * Create a signed URL for downloading a file from Supabase Storage.
 */
export async function getSignedDownloadUrl(
  path: string,
  expiresIn = 3600
): Promise<string> {
  const supabase = createAdminClient();

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresIn);

  if (error) {
    console.error("[Storage] Failed to create signed download URL:", error);
    throw new Error(`Failed to create download URL: ${error.message}`);
  }

  return data.signedUrl;
}

/**
 * Delete a file from Supabase Storage.
 */
export async function deleteFile(path: string): Promise<void> {
  const supabase = createAdminClient();

  const { error } = await supabase.storage.from(BUCKET).remove([path]);

  if (error) {
    console.error("[Storage] Failed to delete file:", error);
    throw new Error(`Failed to delete file: ${error.message}`);
  }
}

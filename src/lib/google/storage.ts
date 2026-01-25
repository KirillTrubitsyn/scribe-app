import { Storage } from "@google-cloud/storage";
import { getGoogleCredentials, getBucketName } from "./credentials";

let storageClient: Storage | null = null;

export function getStorageClient(): Storage {
  if (!storageClient) {
    storageClient = new Storage({
      credentials: getGoogleCredentials(),
    });
  }
  return storageClient;
}

export async function uploadFile(
  buffer: Buffer,
  filename: string,
  contentType: string
): Promise<string> {
  const storage = getStorageClient();
  const bucket = storage.bucket(getBucketName());
  const file = bucket.file(filename);

  await file.save(buffer, {
    contentType,
    metadata: {
      cacheControl: "public, max-age=31536000",
    },
  });

  return `gs://${getBucketName()}/${filename}`;
}

export async function getSignedUrl(
  filename: string,
  expirationMinutes: number = 60
): Promise<string> {
  const storage = getStorageClient();
  const bucket = storage.bucket(getBucketName());
  const file = bucket.file(filename);

  const [url] = await file.getSignedUrl({
    action: "read",
    expires: Date.now() + expirationMinutes * 60 * 1000,
  });

  return url;
}

export async function deleteFile(filename: string): Promise<void> {
  const storage = getStorageClient();
  const bucket = storage.bucket(getBucketName());
  const file = bucket.file(filename);

  await file.delete();
}

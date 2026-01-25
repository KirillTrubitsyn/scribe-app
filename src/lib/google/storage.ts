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

export function parseGcsUri(uri: string): { bucket: string; path: string } {
  const match = uri.match(/^gs:\/\/([^/]+)\/(.+)$/);
  if (!match) {
    throw new Error(`Invalid GCS URI: ${uri}`);
  }
  return { bucket: match[1], path: match[2] };
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

export async function generateUploadSignedUrl(
  fileName: string,
  contentType: string,
  organizationId: string,
  recordingId: string
): Promise<{ url: string; gcsUri: string }> {
  const storage = getStorageClient();
  const bucketName = getBucketName();
  const bucket = storage.bucket(bucketName);
  const filePath = `${organizationId}/${recordingId}/${fileName}`;
  const file = bucket.file(filePath);

  const [url] = await file.getSignedUrl({
    version: "v4",
    action: "resumable",
    expires: Date.now() + 60 * 60 * 1000, // 1 hour
    contentType,
  });

  return {
    url,
    gcsUri: `gs://${bucketName}/${filePath}`,
  };
}

export async function generateDownloadSignedUrl(gcsUri: string): Promise<string> {
  const { bucket: bucketName, path } = parseGcsUri(gcsUri);
  const storage = getStorageClient();
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(path);

  const [url] = await file.getSignedUrl({
    version: "v4",
    action: "read",
    expires: Date.now() + 60 * 60 * 1000, // 1 hour
  });

  return url;
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

export async function deleteFile(gcsUri: string): Promise<void> {
  const { bucket: bucketName, path } = parseGcsUri(gcsUri);
  const storage = getStorageClient();
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(path);

  await file.delete();
}

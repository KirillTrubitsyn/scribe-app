export function getGoogleCredentials() {
  const credentialsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;

  if (!credentialsJson) {
    throw new Error("GOOGLE_APPLICATION_CREDENTIALS_JSON is not set");
  }

  try {
    return JSON.parse(credentialsJson);
  } catch {
    throw new Error("Invalid GOOGLE_APPLICATION_CREDENTIALS_JSON format");
  }
}

export function getProjectId(): string {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;

  if (!projectId) {
    throw new Error("GOOGLE_CLOUD_PROJECT_ID is not set");
  }

  return projectId;
}

export function getBucketName(): string {
  const bucket = process.env.GOOGLE_CLOUD_BUCKET;

  if (!bucket) {
    throw new Error("GOOGLE_CLOUD_BUCKET is not set");
  }

  return bucket;
}

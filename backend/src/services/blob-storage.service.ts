import { env } from '../config/env';
import { AppError } from '../utils/errors';

export type BlobAuthenticationOptions = {
  token?: string;
  oidcToken?: string;
  storeId?: string;
};

export function getBlobAuthenticationOptions(): BlobAuthenticationOptions | null {
  if (env.BLOB_READ_WRITE_TOKEN) {
    return { token: env.BLOB_READ_WRITE_TOKEN };
  }

  if (env.RAILWAY_ENVIRONMENT) {
    throw new AppError(
      'Persistent image storage is not configured for Railway. Set BLOB_READ_WRITE_TOKEN to a valid Vercel Blob read/write token and redeploy.',
      503,
    );
  }

  if (env.VERCEL === '1' && env.VERCEL_OIDC_TOKEN && env.BLOB_STORE_ID) {
    return {
      oidcToken: env.VERCEL_OIDC_TOKEN,
      storeId: env.BLOB_STORE_ID,
    };
  }

  if (env.NODE_ENV === 'production') {
    throw new AppError(
      'Persistent image storage is not configured. Set BLOB_READ_WRITE_TOKEN, or configure Vercel OIDC with BLOB_STORE_ID.',
      503,
    );
  }

  return null;
}

export function logBlobUploadFailure(kind: 'profile' | 'cover', error: unknown): string {
  const details = typeof error === 'object' && error !== null
    ? error as { name?: unknown; message?: unknown; statusCode?: unknown; code?: unknown }
    : {};
  const name = typeof details.name === 'string' ? details.name : 'UnknownError';
  const message = typeof details.message === 'string' ? details.message : String(error);
  const statusCode = typeof details.statusCode === 'number' ? details.statusCode : undefined;
  const code = typeof details.code === 'string' ? details.code : undefined;
  const configuredTokens = [env.BLOB_READ_WRITE_TOKEN, env.VERCEL_OIDC_TOKEN]
    .filter((token): token is string => Boolean(token));
  const sanitizedMessage = configuredTokens.reduce(
    (sanitized, token) => sanitized.split(token).join('[redacted]'),
    message,
  );

  console.error(`Vercel Blob ${kind} image upload failed:`, {
    name,
    statusCode,
    code,
    message: sanitizedMessage,
  });

  if (statusCode === 401 || statusCode === 403 || name === 'BlobAccessError' || name === 'BlobClientTokenExpiredError') {
    return `Vercel Blob rejected the ${kind} image upload credentials. Check that BLOB_READ_WRITE_TOKEN is a valid, unquoted read/write token for the intended Blob store, then redeploy.`;
  }
  if (statusCode === 404 || name === 'BlobStoreNotFoundError') {
    return 'The configured Vercel Blob store was not found. Check the token and selected Blob store.';
  }
  if (statusCode === 413 || name === 'BlobFileTooLargeError') {
    return `The ${kind} image is too large for Vercel Blob. Use an image smaller than 5 MB.`;
  }
  if (statusCode === 429 || name === 'BlobServiceRateLimited') {
    return `Vercel Blob is temporarily rate limiting ${kind} image uploads. Please try again shortly.`;
  }
  if ((statusCode !== undefined && statusCode >= 500)
    || name === 'BlobServiceNotAvailable'
    || name === 'BlobStoreSuspendedError') {
    return `Vercel Blob is temporarily unavailable for ${kind} image uploads. Please try again later.`;
  }
  return `Could not store the ${kind} image in Vercel Blob. Check the backend Blob configuration and logs, then try again.`;
}

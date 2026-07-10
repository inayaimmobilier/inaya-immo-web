import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

const ACCOUNT_ID = process.env.CLOUDFLARE_R2_ACCOUNT_ID
const BUCKET = process.env.CLOUDFLARE_R2_BUCKET_NAME ?? "inaya-medias"
const PUBLIC_URL = process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? ""

let _s3: S3Client | null = null
function getS3(): S3Client {
  if (!_s3) {
    _s3 = new S3Client({
      region: "auto",
      endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!,
      },
    })
  }
  return _s3
}

export function r2Configured(): boolean {
  return !!(ACCOUNT_ID && process.env.CLOUDFLARE_R2_ACCESS_KEY_ID && process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY && PUBLIC_URL)
}

export async function uploadToR2(key: string, body: Buffer, contentType: string): Promise<string> {
  await getS3().send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: contentType }))
  return `${PUBLIC_URL}/${key}`
}

export async function deleteFromR2(key: string): Promise<void> {
  await getS3().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }))
}

/** URL publique de service d'une clé R2. */
export function publicUrlForKey(key: string): string {
  return `${PUBLIC_URL}/${key}`
}

/**
 * URL présignée pour un PUT DIRECT navigateur → R2. Permet d'envoyer des
 * fichiers lourds (vidéos) sans passer par la fonction serverless (limite de
 * corps ~4,5 Mo sur Vercel). Le bucket R2 doit autoriser le CORS PUT depuis
 * l'origine du site.
 */
export async function presignPutUrl(key: string, contentType: string, expiresIn = 600): Promise<string> {
  return getSignedUrl(getS3(), new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType }), { expiresIn })
}

/** Extrait la clé R2 depuis une URL publique (pour la suppression). */
export function urlToKey(url: string): string | null {
  try {
    const path = new URL(url).pathname
    return path.startsWith("/") ? path.slice(1) : path
  } catch {
    return null
  }
}

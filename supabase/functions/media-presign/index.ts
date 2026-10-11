// Only Media Crew members can request an R2 upload URL for one new object.
// Uploads remain in quarantine until verification and editorial review.

import { S3Client, PutObjectCommand } from 'npm:@aws-sdk/client-s3@3';
import { getSignedUrl } from 'npm:@aws-sdk/s3-request-presigner@3';
import { admin, authenticate, hasRole } from '../_shared/portal-auth.ts';

const portalOrigin = Deno.env.get('PORTAL_ORIGIN')!;
const allowedTypes = new Set(['image/png','image/jpeg','image/webp','video/mp4']);
const maxBytes = 100 * 1024 * 1024;

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${Deno.env.get('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: Deno.env.get('R2_ACCESS_KEY_ID')!,
    secretAccessKey: Deno.env.get('R2_SECRET_ACCESS_KEY')!,
  },
});

function answer(body: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: {
      'Content-Type':'application/json','Cache-Control':'no-store',
      'Access-Control-Allow-Origin':portalOrigin,
      'Access-Control-Allow-Headers':'authorization,apikey,content-type',
      'Access-Control-Allow-Methods':'POST, OPTIONS',
      'Vary':'Origin',
    },
  });
}

Deno.serve(async (req) => {
  if (req.headers.get('Origin') !== portalOrigin) return answer({error:'Forbidden'},403);
  if (req.method === 'OPTIONS') return answer({},204);
  if (req.method !== 'POST') return answer({error:'Method not allowed'},405);
  try {
    const actor = await authenticate(req);
    if (!hasRole(actor,'media_crew','media') &&
        !hasRole(actor,'director','media')) return answer({error:'Not allowed'},403);
    const { mime_type, byte_size } = await req.json();
    if (typeof mime_type !== 'string' || !allowedTypes.has(mime_type) ||
        !Number.isSafeInteger(byte_size) || byte_size < 1 || byte_size > maxBytes) {
      return answer({error:'Unsupported file'},400);
    }
    const extension: Record<string,string> = {
      'image/png':'.png','image/jpeg':'.jpg',
      'image/webp':'.webp','video/mp4':'.mp4',
    };
    const namespace = (Deno.env.get('R2_PORTAL_NAMESPACE') || '').replace(/^\/+|\/+$/g, '');
    if (namespace && !/^[a-z0-9_-]+(?:\/[a-z0-9_-]+)*$/.test(namespace)) {
      return answer({error:'Storage namespace misconfigured'},503);
    }
    const key = `${namespace ? namespace + '/' : ''}quarantine/${actor.id}/${crypto.randomUUID()}${extension[mime_type]}`;
    const { error } = await admin.from('media_assets').insert({
      uploader_id:actor.id, r2_key:key, mime_type,byte_size,
      department:'media',status:'quarantine',
    });
    if (error) return answer({error:'Upload could not be reserved'},503);

    // A presigned URL is bearer-like until it expires; keep TTL very short.
    const putUrl = await getSignedUrl(r2,
      new PutObjectCommand({
        Bucket:Deno.env.get('R2_BUCKET')!,Key:key,ContentType:mime_type,
      }), {expiresIn:60});
    return answer({put_url:putUrl,object_key:key,expires_in:60});
  } catch (_error) {
    return answer({error:'Access denied or temporarily unavailable'},401);
  }
});

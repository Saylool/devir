import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { HttpError } from './errors';

export { HttpError } from './errors';

// A random bearer cookie identifies one anonymous workspace. It is never
// returned in API JSON or used as a public task identifier.
export async function ownerId() {
  const jar = await cookies();
  const current = jar.get('devir_session')?.value;
  const session = current && /^[a-f0-9]{64}$/.test(current)
    ? current
    : randomBytes(32).toString('hex');
  if (session !== current) {
    jar.set('devir_session', session, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
  }
  return createHash('sha256').update(session).digest('hex');
}

export async function readJson(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) {
    throw new HttpError(403, 'İstek kaynağı doğrulanamadı.');
  }
  const raw = await request.text();
  if (raw.length > 8192) throw new HttpError(413, 'İstek çok büyük.');
  try { return JSON.parse(raw); }
  catch { throw new HttpError(400, 'Geçerli JSON gerekli.'); }
}

export function apiError(error: unknown) {
  const status = error instanceof HttpError ? error.status : error instanceof z.ZodError ? 400 : 502;
  const message = error instanceof HttpError ? error.message
    : error instanceof z.ZodError ? 'İstek alanlarını kontrol edin.'
    : 'İşlem tamamlanamadı. Lütfen tekrar deneyin.';
  if (status === 502) console.error('DEVIR request failed:', error instanceof Error ? error.name : 'UnknownError');
  return Response.json({ error: message }, { status, headers: { 'Cache-Control': 'private, no-store' } });
}

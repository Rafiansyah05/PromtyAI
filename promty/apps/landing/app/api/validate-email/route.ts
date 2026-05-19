import { promises as dns } from 'dns';
import { isDisposableEmail } from '../../../lib/disposable-domains';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { email } = await req.json();

    if (!email || typeof email !== 'string') {
      return Response.json({ valid: false, reason: 'invalid_format' }, { status: 400 });
    }

    if (isDisposableEmail(email)) {
      return Response.json({ valid: false, reason: 'disposable' }, { status: 400 });
    }

    const domain = email.split('@')[1];
    
    try {
      const records = await dns.resolveMx(domain);
      const valid = records.length > 0;
      if (valid) {
        return Response.json({ valid: true });
      } else {
        return Response.json({ valid: false, reason: 'no_mx_record' });
      }
    } catch (err: unknown) {
      const error = err as { code?: string };
      // If explicit DNS failure that domain doesn't exist, block it.
      if (error.code === 'ENOTFOUND' || error.code === 'ENODATA') {
        return Response.json({ valid: false, reason: 'no_mx_record' });
      }
      // Fallback: If network error (ECONNREFUSED), assume email is valid so we don't block users.
      return Response.json({ valid: true });
    }
  } catch (error: unknown) {
    console.error('Validation error:', error);
    return Response.json({ valid: false, reason: 'server_error' }, { status: 500 });
  }
}

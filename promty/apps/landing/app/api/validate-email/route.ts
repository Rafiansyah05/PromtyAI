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

    const domain = email.split('@')[1]?.toLowerCase();
    if (!domain) {
      return Response.json({ valid: false, reason: 'invalid_format' }, { status: 400 });
    }

    // Fast-path: Skip DNS MX check for extremely popular trusted domains
    const trustedDomains = new Set([
      'gmail.com',
      'yahoo.com',
      'outlook.com',
      'hotmail.com',
      'icloud.com',
      'proton.me',
      'protonmail.com',
      'zoho.com',
      'aol.com',
      'gmx.com',
      'yandex.com'
    ]);

    if (trustedDomains.has(domain)) {
      return Response.json({ valid: true });
    }
    
    try {
      const dnsPromise = dns.resolveMx(domain);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 1000)
      );

      const records = await Promise.race([dnsPromise, timeoutPromise]);
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
      // Fallback: If timeout or network error, assume email is valid so we don't block users.
      return Response.json({ valid: true });
    }
  } catch (error: unknown) {
    console.error('Validation error:', error);
    return Response.json({ valid: false, reason: 'server_error' }, { status: 500 });
  }
}

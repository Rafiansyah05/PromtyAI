import { promises as dns } from 'dns';
import net from 'net';
import { isDisposableEmail, isSpamOrGibberish } from '../../../lib/disposable-domains';

export const dynamic = 'force-dynamic';

function checkSmtp(email: string, exchange: string): Promise<boolean> {
  return new Promise((resolve) => {
    let resolved = false;
    let stage = 0; // 0: connect, 1: HELO, 2: MAIL FROM, 3: RCPT TO

    const socket = net.createConnection(25, exchange);
    socket.setTimeout(1500); // 1.5 seconds SMTP handshake timeout

    const safeResolve = (result: boolean) => {
      if (!resolved) {
        resolved = true;
        try {
          socket.write('QUIT\r\n');
        } catch {}
        socket.destroy();
        resolve(result);
      }
    };

    socket.on('connect', () => {
      // Connection succeeded, waiting for 220 banner from target server
    });

    socket.on('data', (chunk) => {
      const response = chunk.toString();
      const lines = response.split('\r\n');

      for (const line of lines) {
        if (!line) continue;
        const code = line.substring(0, 3);

        if (stage === 0) {
          if (code === '220') {
            stage = 1;
            socket.write('HELO promty.id\r\n');
          } else {
            safeResolve(true); // Fallback on unknown response
          }
        } else if (stage === 1) {
          if (code === '250') {
            stage = 2;
            socket.write('MAIL FROM:<verify@promty.id>\r\n');
          } else {
            safeResolve(true);
          }
        } else if (stage === 2) {
          if (code === '250') {
            stage = 3;
            socket.write(`RCPT TO:<${email}>\r\n`);
          } else {
            safeResolve(true);
          }
        } else if (stage === 3) {
          if (code === '250') {
            safeResolve(true); // Mailbox exists!
          } else if (code.startsWith('5')) {
            safeResolve(false); // Mailbox rejected (definitely invalid / inactive)
          } else {
            safeResolve(true); // Other response codes (e.g., 450 greylisting), fallback to valid
          }
        }
      }
    });

    socket.on('error', (err) => {
      console.log('[SMTP] Socket error, falling back to true:', err.message);
      safeResolve(true); // Fallback on network error (like port 25 block by cloud host)
    });

    socket.on('timeout', () => {
      console.log('[SMTP] Socket timeout, falling back to true');
      safeResolve(true); // Fallback on timeout
    });
  });
}

export async function POST(req: Request) {
  try {
    const { email } = await req.json();

    if (!email || typeof email !== 'string') {
      return Response.json({ valid: false, reason: 'invalid_format' }, { status: 400 });
    }

    if (isDisposableEmail(email)) {
      return Response.json({ valid: false, reason: 'disposable' }, { status: 400 });
    }

    if (isSpamOrGibberish(email)) {
      return Response.json({ valid: false, reason: 'spam_gibberish' }, { status: 400 });
    }

    const domain = email.split('@')[1]?.toLowerCase();
    if (!domain) {
      return Response.json({ valid: false, reason: 'invalid_format' }, { status: 400 });
    }

    try {
      const dnsPromise = dns.resolveMx(domain);
      const timeoutPromise = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 1000));

      const records = await Promise.race([dnsPromise, timeoutPromise]);

      if (!records || records.length === 0) {
        return Response.json({ valid: false, reason: 'no_mx_record' });
      }

      // Sort MX records by priority (lower number = higher priority)
      const sortedRecords = [...records].sort((a, b) => a.priority - b.priority);
      const bestExchange = sortedRecords[0].exchange;

      // Active SMTP handshake validation
      const smtpValid = await checkSmtp(email, bestExchange);
      if (smtpValid) {
        return Response.json({ valid: true });
      } else {
        return Response.json({ valid: false, reason: 'smtp_rejected' });
      }
    } catch (err: unknown) {
      const error = err as { code?: string };
      // If explicit DNS failure that domain doesn't exist, block it.
      if (error.code === 'ENOTFOUND' || error.code === 'ENODATA') {
        return Response.json({ valid: false, reason: 'no_mx_record' });
      }
      // Fallback: If DNS timeout or network error, assume valid.
      return Response.json({ valid: true });
    }
  } catch (error: unknown) {
    console.error('Validation error:', error);
    return Response.json({ valid: false, reason: 'server_error' }, { status: 500 });
  }
}

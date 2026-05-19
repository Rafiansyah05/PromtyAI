import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://xyzcompany.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy_key';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { email } = await req.json();
    
    if (!email || typeof email !== 'string') {
      return Response.json({ ok: false, error: 'invalid_email' }, { status: 400 });
    }

    // Jika belum ada Env Supabase, kita simulasikan sukses
    if (process.env.NEXT_PUBLIC_SUPABASE_URL === undefined || process.env.NEXT_PUBLIC_SUPABASE_URL === '') {
      console.log('[API] Dummy mode: Pretending to register user', email);
      return Response.json({ ok: true });
    }

    // Upsert — tidak duplikat
    const { error: upsertError } = await supabase
      .from('users')
      .upsert({ email, installed_at: new Date().toISOString() }, { onConflict: 'email', ignoreDuplicates: false });
    
    if (upsertError) {
      console.error('[API] Failed to upsert user:', upsertError);
      return Response.json({ ok: false }, { status: 500 });
    }

    // Log download event
    const { error: logError } = await supabase
      .from('download_events')
      .insert({ email });

    if (logError) {
      console.error('[API] Failed to log download event:', logError);
      // We still return true if upsert worked
    }

    return Response.json({ ok: true });
  } catch (error) {
    console.error('[API] Server error:', error);
    return Response.json({ ok: false }, { status: 500 });
  }
}

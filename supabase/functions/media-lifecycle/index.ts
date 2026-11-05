import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const noStore = {
  'Cache-Control': 'private, no-store, no-cache, must-revalidate, max-age=0',
  'Pragma': 'no-cache',
  'Expires': '0',
  'X-Content-Type-Options': 'nosniff',
  ...cors,
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...noStore, 'Content-Type': 'application/json' },
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const body = await req.json().catch(() => ({}));

  // Scheduled cleanup uses a separate secret and deletes actual Storage objects
  // through the Storage API (never by deleting storage.objects rows directly).
  if (body.action === 'cleanup') {
    const secret = req.headers.get('x-cron-secret');
    if (!secret || secret !== Deno.env.get('CRON_SECRET')) return json({ error: 'not_allowed' }, 401);
    const { data: rows, error } = await admin.from('messages')
      .select('id,media_path,media_mode,expires_at,opened_at')
      .not('media_path', 'is', null).limit(500);
    if (error) return json({ error: error.message }, 500);
    const now = Date.now();
    const doomed = (rows || []).filter((m) =>
      (m.expires_at && new Date(m.expires_at).getTime() <= now) ||
      (m.media_mode === 'view_once' && m.opened_at && new Date(m.opened_at).getTime() <= now - 120000)
    );
    let removed = 0;
    for (const m of doomed) {
      const { error: rmError } = await admin.storage.from('chat-media').remove([m.media_path]);
      if (!rmError) {
        await admin.from('messages').update({ media_path: null, media_mime: null, body: 'Expired media' }).eq('id', m.id);
        removed++;
      }
    }
    // Remove identity documents 30 days after a successful approval.
    const { data: dueIds, error: idQueryError } = await admin.from('profiles')
      .select('id,id_card_path').not('id_card_path','is',null).lte('id_delete_after',new Date().toISOString()).limit(200);
    if (idQueryError) return json({ error: idQueryError.message }, 500);
    let idsRemoved = 0;
    for (const profile of (dueIds || [])) {
      const { error: rmIdError } = await admin.storage.from('verification').remove([profile.id_card_path]);
      if (!rmIdError) {
        await admin.from('profiles').update({ id_card_path: null, id_deleted_at: new Date().toISOString() }).eq('id',profile.id);
        idsRemoved++;
      }
    }
    return json({ removed, idsRemoved });
  }

  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'unauthorized' }, 401);
  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data: auth, error: authError } = await userClient.auth.getUser(token);
  if (authError || !auth.user) return json({ error: 'unauthorized' }, 401);
  const userId = auth.user.id;

  if (body.action === 'open') {
    const messageId = Number(body.message_id);
    if (!Number.isSafeInteger(messageId)) return json({ error: 'bad_message' }, 400);
    // This RPC locks the row, verifies active match/no block and atomically consumes it.
    const { data: path, error } = await userClient.rpc('open_once_media', { p_message: messageId });
    if (error || !path) return json({ error: 'media_unavailable' }, 404);
    const { data: message } = await admin.from('messages').select('media_mime,message_type')
      .eq('id', messageId).maybeSingle();
    const { data: file, error: fileError } = await admin.storage.from('chat-media').download(path);
    if (fileError || !file) return json({ error: 'media_unavailable' }, 404);
    return new Response(file.stream(), {
      status: 200,
      headers: { ...noStore, 'Content-Type': message?.media_mime || file.type || 'application/octet-stream',
        'Content-Disposition': 'inline', 'Content-Length': String(file.size) },
    });
  }

  if (body.action === 'close') {
    const messageId = Number(body.message_id);
    if (!Number.isSafeInteger(messageId)) return json({ error: 'bad_message' }, 400);
    const { data: msg, error } = await admin.from('messages').select('id,match_id,media_path,media_mode,opened_by,opened_at')
      .eq('id', messageId).maybeSingle();
    if (error || !msg || msg.media_mode !== 'view_once' || msg.opened_by !== userId || !msg.opened_at || !msg.media_path)
      return json({ error: 'not_allowed' }, 403);
    const { data: match } = await admin.from('matches').select('id,woman_id,man_id,status')
      .eq('id', msg.match_id).maybeSingle();
    if (!match || match.status !== 'active' || ![match.woman_id, match.man_id].includes(userId))
      return json({ error: 'not_allowed' }, 403);
    const other = match.woman_id === userId ? match.man_id : match.woman_id;
    const { data: block } = await admin.from('blocks').select('blocker').or(
      `and(blocker.eq.${userId},blocked.eq.${other}),and(blocker.eq.${other},blocked.eq.${userId})`
    ).limit(1);
    if (block?.length) return json({ error: 'not_allowed' }, 403);
    const { error: removeError } = await admin.storage.from('chat-media').remove([msg.media_path]);
    if (removeError) return json({ error: 'delete_failed' }, 500);
    await admin.from('messages').update({ media_path: null, media_mime: null, body: 'Expired media' }).eq('id', messageId);
    return json({ deleted: true });
  }

  if (body.action === 'chat-download') {
    const messageId = Number(body.message_id);
    if (!Number.isSafeInteger(messageId)) return json({ error: 'bad_message' }, 400);
    const { data: msg } = await admin.from('messages').select('id,match_id,media_path,media_mime,media_mode,expires_at')
      .eq('id', messageId).maybeSingle();
    if (!msg || !msg.media_path || !['normal','timed'].includes(msg.media_mode) ||
        (msg.expires_at && new Date(msg.expires_at).getTime() <= Date.now())) return json({ error: 'media_unavailable' }, 404);
    const { data: match } = await admin.from('matches').select('id,woman_id,man_id,status')
      .eq('id', msg.match_id).maybeSingle();
    if (!match || match.status !== 'active' || ![match.woman_id, match.man_id].includes(userId)) return json({ error: 'not_allowed' }, 403);
    const other = match.woman_id === userId ? match.man_id : match.woman_id;
    const { data: block } = await admin.from('blocks').select('blocker').or(
      `and(blocker.eq.${userId},blocked.eq.${other}),and(blocker.eq.${other},blocked.eq.${userId})`
    ).limit(1);
    if (block?.length) return json({ error: 'not_allowed' }, 403);
    const { data: file, error: fileError } = await admin.storage.from('chat-media').download(msg.media_path);
    if (fileError || !file) return json({ error: 'media_unavailable' }, 404);
    return new Response(file.stream(), { status: 200, headers: { ...noStore,
      'Content-Type': msg.media_mime || file.type || 'application/octet-stream',
      'Content-Disposition': 'inline', 'Content-Length': String(file.size) } });
  }

  if (body.action === 'vault-download') {
    const path = String(body.path || '');
    if (!path || path.length > 500) return json({ error: 'bad_path' }, 400);
    // Download through the caller's JWT so Storage RLS enforces owner/grant/match/expiry.
    const { data: file, error } = await userClient.storage.from('vault-media').download(path);
    if (error || !file) return json({ error: 'not_found' }, 404);
    return new Response(file.stream(), {
      status: 200,
      headers: { ...noStore, 'Content-Type': file.type || 'application/octet-stream',
        'Content-Disposition': 'inline', 'Content-Length': String(file.size) },
    });
  }

  if (body.action === 'delete-account') {
    // Delete account-owned media first. If storage cleanup fails, keep the account
    // intact so the member can retry instead of leaving a half-deleted account.
    const removePaths = async (bucket: string, paths: string[]) => {
      const unique = [...new Set(paths.filter(Boolean))];
      for (let i = 0; i < unique.length; i += 100) {
        const { error } = await admin.storage.from(bucket).remove(unique.slice(i, i + 100));
        if (error) throw new Error(`${bucket}_remove_failed: ${error.message}`);
      }
    };
    const removeFolder = async (bucket: string) => {
      // Storage list returns only immediate children. Remove files in pages;
      // stop safely if a page contains folders rather than looping forever.
      const { data: items, error } = await admin.storage.from(bucket).list(userId, { limit: 1000 });
      if (error) throw new Error(`${bucket}_list_failed: ${error.message}`);
      const paths = (items || []).filter((i) => i.name && i.id).map((i) => `${userId}/${i.name}`);
      await removePaths(bucket, paths);
      const nested = (items || []).filter((i) => i.name && !i.id);
      for (const folder of nested) {
        const { data: children, error: childError } = await admin.storage.from(bucket).list(`${userId}/${folder.name}`, { limit: 1000 });
        if (childError) throw new Error(`${bucket}_list_failed: ${childError.message}`);
        await removePaths(bucket, (children || []).filter((i) => i.name && i.id).map((i) => `${userId}/${folder.name}/${i.name}`));
      }
    };
    try {
      // Include media in conversations where the deleting member is either sender
      // or recipient; deleting the profile cascades through matches/messages.
      const { data: matches, error: matchError } = await admin.from('matches').select('id').or(`woman_id.eq.${userId},man_id.eq.${userId}`);
      if (matchError) throw new Error(`matches_lookup_failed: ${matchError.message}`);
      const matchIds = (matches || []).map((m) => m.id);
      let mediaPaths: string[] = [];
      if (matchIds.length) {
        const { data: mediaRows, error: mediaError } = await admin.from('messages').select('media_path').in('match_id', matchIds).not('media_path', 'is', null);
        if (mediaError) throw new Error(`chat_media_lookup_failed: ${mediaError.message}`);
        mediaPaths = (mediaRows || []).map((r) => r.media_path as string);
      }
      await removePaths('chat-media', mediaPaths);
      for (const bucket of ['photos', 'verification', 'vault-media']) await removeFolder(bucket);

      // Use the database's SECURITY DEFINER account-deletion routine so all
      // profile-linked rows are removed by their declared ON DELETE CASCADE rules.
      const { error: deleteError } = await userClient.rpc('delete_my_account');
      if (deleteError) throw new Error(`account_delete_failed: ${deleteError.message}`);
      return json({ deleted: true });
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      console.error('MEET GH DELETE ACCOUNT ERROR:', detail);
      return json({ error: 'delete_failed', detail }, 500);
    }
  }

  return json({ error: 'unknown_action' }, 400);
});

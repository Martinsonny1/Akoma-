import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { AccessToken } from 'npm:livekit-server-sdk@2.13.3';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  try {
    const auth = req.headers.get('Authorization') || '';
    const jwt = auth.replace(/^Bearer\s+/i, '');
    if (!jwt) return json({ error: 'not_authenticated' }, 401);
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const userClient = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false } });
    const { data: { user }, error: userErr } = await userClient.auth.getUser(jwt);
    if (userErr || !user) return json({ error: 'not_authenticated' }, 401);
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { action, match_id, call_id, call_type, reason } = await req.json();
    const me = user.id;

    async function authorizeMatch(matchId: string, otherId?: string) {
      if (typeof matchId !== 'string' || !matchId.trim()) throw new Error('A valid match ID is required.');
      const { data: match, error } = await admin.from('matches').select('id,woman_id,man_id,status').eq('id', matchId).eq('status', 'active').maybeSingle();
      if (error) {
        console.error('AKOMA MATCH LOOKUP ERROR:', { matchId, code: error.code, message: error.message, details: error.details, hint: error.hint });
        throw new Error('Match database lookup failed. Check Edge Function logs.');
      }
      if (!match) {
        console.error('AKOMA MATCH NOT FOUND:', { matchId, expectedStatus: 'active' });
        throw new Error('No active match found for this ID.');
      }
      const other = match.woman_id === me ? match.man_id : match.man_id === me ? match.woman_id : null;
      if (!other || (otherId && other !== otherId)) throw new Error('You are not a member of this match.');
      const { data: blocked, error: blockError } = await admin.from('blocks').select('blocker').or(`and(blocker.eq.${me},blocked.eq.${other}),and(blocker.eq.${other},blocked.eq.${me})`).limit(1);
      if (blockError) {
        console.error('AKOMA BLOCK LOOKUP ERROR:', { code: blockError.code, message: blockError.message, details: blockError.details, hint: blockError.hint });
        throw new Error('Unable to verify blocking status.');
      }
      if (blocked?.length) throw new Error('Calling is unavailable because this connection is blocked.');
      const { data: profiles, error: profileError } = await admin.from('profiles').select('id,status').in('id', [me, other]);
      if (profileError) {
        console.error('AKOMA PROFILE LOOKUP ERROR:', { code: profileError.code, message: profileError.message, details: profileError.details, hint: profileError.hint });
        throw new Error('Unable to verify account approval.');
      }
      if (!profiles || profiles.length !== 2 || profiles.some(p => p.status !== 'approved')) throw new Error('Both accounts must be approved to call.');
      return { match, other };
    }

    if (action === 'start') {
      if (!['audio', 'video'].includes(call_type)) return json({ error: 'invalid_call_type' }, 400);
      const { other } = await authorizeMatch(match_id);
      const { data: pref, error: prefError } = await admin.from('call_settings').select('incoming_enabled').eq('user_id', other).maybeSingle();
      if (prefError) {
        console.error('AKOMA CALL SETTINGS ERROR:', { code: prefError.code, message: prefError.message, details: prefError.details, hint: prefError.hint });
        throw new Error('Unable to check incoming call settings.');
      }
      if (pref?.incoming_enabled === false) return json({ error: 'This person is not accepting calls right now.' }, 403);
      const room = `akoma_${crypto.randomUUID().replaceAll('-', '')}`;
      const { data: call, error } = await admin.from('calls').insert({ match_id, caller_id: me, recipient_id: other, call_type, room_name: room }).select('*').single();
      if (error) throw error;
      return json({ call });
    }

    if (action === 'respond') {
      const { data: call, error } = await admin.from('calls').select('*').eq('id', call_id).maybeSingle();
      if (error || !call || call.recipient_id !== me || call.status !== 'ringing') throw new Error('This call is no longer available.');
      await authorizeMatch(call.match_id, call.caller_id);
      const accepted = reason === 'accept';
      const { data: updated, error: updateErr } = await admin.from('calls').update({ status: accepted ? 'accepted' : 'declined', accepted_at: accepted ? new Date().toISOString() : null, ended_at: accepted ? null : new Date().toISOString(), end_reason: accepted ? null : 'declined' }).eq('id', call_id).eq('status', 'ringing').select('*').single();
      if (updateErr) throw updateErr;
      if (!accepted) return json({ call: updated });
      return await issueToken(updated, me);
    }

    if (action === 'token') {
      const { data: call, error } = await admin.from('calls').select('*').eq('id', call_id).maybeSingle();
      if (error || !call || ![call.caller_id, call.recipient_id].includes(me) || call.status !== 'accepted') throw new Error('This call is no longer active.');
      await authorizeMatch(call.match_id, me === call.caller_id ? call.recipient_id : call.caller_id);
      return await issueToken(call, me);
    }

    if (action === 'end') {
      const { data: call, error } = await admin.from('calls').select('*').eq('id', call_id).maybeSingle();
      if (error || !call || ![call.caller_id, call.recipient_id].includes(me)) throw new Error('Call not found.');
      const { data: updated, error: updateErr } = await admin.from('calls').update({ status: 'ended', ended_at: new Date().toISOString(), ended_by: me, end_reason: reason || 'ended' }).eq('id', call_id).in('status', ['ringing','accepted']).select('*').maybeSingle();
      if (updateErr) throw updateErr;
      return json({ call: updated || call });
    }

    if (action === 'miss') {
      const { data: call, error } = await admin.from('calls').select('*').eq('id', call_id).maybeSingle();
      if (error || !call || ![call.caller_id, call.recipient_id].includes(me)) throw new Error('Call not found.');
      const { data: updated, error: updateErr } = await admin.from('calls').update({ status: 'missed', ended_at: new Date().toISOString(), end_reason: 'no_answer' }).eq('id', call_id).eq('status', 'ringing').select('*').maybeSingle();
      if (updateErr) throw updateErr;
      return json({ call: updated || call });
    }

    return json({ error: 'unknown_action' }, 400);

    async function issueToken(call: any, identity: string) {
      const liveUrl = Deno.env.get('LIVEKIT_URL');
      const apiKey = Deno.env.get('LIVEKIT_API_KEY');
      const apiSecret = Deno.env.get('LIVEKIT_API_SECRET');
      if (!liveUrl || !apiKey || !apiSecret) throw new Error('LiveKit is not configured on the server yet.');
      const token = new AccessToken(apiKey, apiSecret, { identity, ttl: '24h', name: identity });
      token.addGrant({ roomJoin: true, room: call.room_name, canPublish: true, canSubscribe: true, canPublishData: true });
      return json({ token: await token.toJwt(), server_url: liveUrl, call });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'request_failed';
    console.error('AKOMA LIVEKIT CALL ERROR:', message);
    return json({ error: message }, 400);
  }
});

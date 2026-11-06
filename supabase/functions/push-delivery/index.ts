import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

// Receives a ready-made notification from the database (see push_notifications_migration.sql)
// and delivers it to every browser/phone the recipient has subscribed.
// Body: { recipient, title, body, url, tag, ring, kind }
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-webhook-secret', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply({ error: 'method_not_allowed' }, 405);
  const secret = Deno.env.get('PUSH_WEBHOOK_SECRET');
  if (!secret || req.headers.get('x-webhook-secret') !== secret) return reply({ error: 'not_allowed' }, 401);
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY'), privateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  const subject = Deno.env.get('VAPID_SUBJECT') || 'mailto:privacy@example.com';
  if (!publicKey || !privateKey) return reply({ error: 'push_not_configured' }, 503);
  webpush.setVapidDetails(subject, publicKey, privateKey);

  const p = await req.json().catch(() => ({}));
  const recipient = String(p.recipient || '');
  if (!recipient) return reply({ sent: 0 });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data: subs, error } = await admin.from('push_subscriptions').select('id,subscription').eq('user_id', recipient);
  if (error) return reply({ error: error.message }, 500);

  const ring = !!p.ring;
  const payload = JSON.stringify({
    title: String(p.title || 'Meet GH').slice(0, 80),
    body: String(p.body || 'You have a new update.').slice(0, 200),
    url: String(p.url || '/'),
    tag: String(p.tag || 'meetgh'),
    ring,
  });
  let sent = 0; const expired: number[] = [];
  for (const sub of subs || []) {
    try {
      await webpush.sendNotification(sub.subscription, payload, { TTL: ring ? 30 : 86400, urgency: ring ? 'high' : 'normal' });
      sent++;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) expired.push(sub.id);
    }
  }
  if (expired.length) await admin.from('push_subscriptions').delete().in('id', expired);
  return reply({ sent, expired: expired.length });
});

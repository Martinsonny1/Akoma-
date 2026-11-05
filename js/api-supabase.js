// Live data layer: Supabase (database, login, storage) and Paystack (MoMo).
// Same functions as api-demo.js. Rules are enforced by supabase/schema.sql,
// so this file only calls it and shapes the results for the screens.
(function () {
  'use strict';
  const U = window.AkomaUtil;
  const C = window.AKOMA_CONFIG || {};
  const SDK = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let sb = null, _session = null, _me = null;
  const urlCache = new Map();

  function loadScript(src) {
    return new Promise((res, rej) => {
      if (document.querySelector('script[src="' + src + '"]')) return res();
      const s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = () => rej(new Error('script_load_failed'));
      document.head.appendChild(s);
    });
  }
  async function ok(p) { const r = await p; if (r.error) throw new Error(r.error.message || 'error'); return r.data; }
  const uid = () => _session && _session.user.id;
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'x' + Date.now() + Math.random().toString(36).slice(2));
  const byNew = (a, b) => new Date(b.created_at) - new Date(a.created_at);

  // Signed links for private files (valid for an hour).
  async function urls(paths, bucket) {
    bucket = bucket || 'photos';
    const need = [...new Set(paths.filter((p) => p && !(urlCache.get(bucket + '/' + p) && urlCache.get(bucket + '/' + p).exp > Date.now() + 60000)))];
    if (need.length) {
      const { data } = await sb.storage.from(bucket).createSignedUrls(need, 3600);
      (data || []).forEach((d) => { if (d.signedUrl) urlCache.set(bucket + '/' + d.path, { url: d.signedUrl, exp: Date.now() + 3600000 }); });
    }
    return paths.map((p) => { const c = p && urlCache.get(bucket + '/' + p); return c ? c.url : null; });
  }
  // supabase-js functions.invoke() only returns a Blob for application/octet-stream and returns
  // text for image/*, video/* and audio/*, which corrupts media. Use fetch() and read the real Blob.
  async function mediaFn(body) {
    const { data } = await sb.auth.getSession();
    const token = data && data.session && data.session.access_token;
    if (!token) throw new Error('not_authenticated');
    const res = await fetch(C.SUPABASE_URL.replace(/\/$/, '') + '/functions/v1/media-lifecycle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token, 'apikey': C.SUPABASE_ANON_KEY },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      let msg = 'Media unavailable';
      try { const j = await res.json(); if (j && j.error) msg = j.error; } catch (_) {}
      throw new Error(msg);
    }
    return res;
  }
  async function chatMediaUrl(messageId, path) {
    let edgeErr;
    try { const res = await mediaFn({ action: 'chat-download', message_id: Number(messageId) }); return URL.createObjectURL(await res.blob()); }
    catch (e) { edgeErr = e; }
    // Fallback: members of an active match may read normal/timed media straight from Storage (RLS enforces it).
    if (path) {
      const { data, error } = await sb.storage.from('chat-media').download(path);
      if (!error && data && data.size) return URL.createObjectURL(data);
      throw new Error((edgeErr && edgeErr.message) + ' | Storage: ' + ((error && error.message) || 'empty file'));
    }
    throw edgeErr;
  }
  async function withMedia(row) {
    if (!(row && row.media_path && ['normal', 'timed'].includes(row.media_mode) && (!row.expires_at || new Date(row.expires_at) > new Date()))) return row;
    try { return Object.assign({}, row, { media_url: await chatMediaUrl(row.id, row.media_path) }); }
    catch (e) { console.warn('Akoma media load failed:', e); return Object.assign({}, row, { media_err: String((e && e.message) || e).slice(0, 160) }); }
  }
  async function withUrls(cards, all) {
    const pick = (c) => (all ? c.photos : c.photos.slice(0, 1));
    const paths = []; cards.forEach((c) => pick(c).forEach((p) => paths.push(p)));
    const got = await urls(paths);
    const map = new Map(paths.map((p, i) => [p, got[i]]));
    return cards.map((c) => Object.assign({}, c, { photos: pick(c).map((p) => map.get(p)).filter(Boolean) }));
  }
  async function cardMap() {
    const rows = await withUrls(await ok(sb.rpc('list_profiles', { p_min: 18, p_max: 99 })), false);
    return new Map(rows.map((c) => [c.id, c]));
  }
  const unavailable = (id) => ({ id, name: 'Unavailable', age: '', city: '', photos: [], photo_hidden: false, interests: [] });
  async function ensureMe() { if (!_me) await API.me(); return _me; }
  const startOfDay = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString(); };

  const API = {
    mode: 'supabase',
    config: C,

    async init() {
      await loadScript(SDK);
      sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
      const { data } = await sb.auth.getSession();
      _session = data.session;
      sb.auth.onAuthStateChange((_e, s) => { _session = s; if (!s) _me = null; window.dispatchEvent(new Event('akoma:auth')); });
    },

    // ---- auth -----------------------------------------------------------
    session() { return _session ? { userId: _session.user.id, email: _session.user.email || '' } : null; },
    async authenticate(email, password, mode) {
      const address = String(email || '').trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) throw new Error('Enter a valid email address.');
      if (String(password || '').length < 8) throw new Error('Your password must be at least 8 characters.');
      if (mode === 'signup') {
        const d = await ok(sb.auth.signUp({
          email: address,
          password,
          options: { emailRedirectTo: window.location.origin + window.location.pathname }
        }));
        _session = d.session;
        return { userId: d.user && d.user.id, confirmationRequired: !d.session };
      }
      const d = await ok(sb.auth.signInWithPassword({ email: address, password }));
      _session = d.session;
      return { userId: d.user.id, confirmationRequired: false };
    },
    async requestPasswordReset(email) {
      const address = String(email || '').trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) throw new Error('Enter a valid email address first.');
      const redirectTo = window.location.origin + '/admin/reset-password.html';
      const { error } = await sb.auth.resetPasswordForEmail(address, { redirectTo });
      if (error) throw error;
      return true;
    },
    async updatePassword(password) {
      if (String(password || '').length < 8) throw new Error('Use at least 8 characters for your new password.');
      const { data, error } = await sb.auth.updateUser({ password });
      if (error) throw error;
      return data;
    },
    async signOut() { await sb.auth.signOut(); _session = null; _me = null; },

    // ---- LiveKit call signalling (media itself is never sent through Supabase) ----
    async callRequest(payload) {
      const { data, error } = await sb.functions.invoke('livekit-call', { body: payload });
      if (error) { let message = error.message || 'Calling service unavailable'; try { const body = await error.context.json(); message = body.error || message; } catch (_) {} throw new Error(message); }
      if (data && data.error) throw new Error(data.error);
      return data;
    },
    callSubscribe(userId, onChange) {
      const channel = sb.channel('akoma-calls-' + userId + '-' + uuid())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'calls', filter: 'recipient_id=eq.' + userId }, onChange)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'calls', filter: 'caller_id=eq.' + userId }, onChange)
        .subscribe();
      return () => sb.removeChannel(channel);
    },
    async callSettings() {
      const row = await ok(sb.from('call_settings').select('incoming_enabled').eq('user_id',uid()).maybeSingle());
      return row ? row.incoming_enabled !== false : true;
    },
    async setIncomingCalls(enabled) {
      await ok(sb.from('call_settings').upsert({user_id:uid(),incoming_enabled:!!enabled,updated_at:new Date().toISOString()},{onConflict:'user_id'}));
      return !!enabled;
    },
    async callHistory() {
      const rows = await ok(sb.from('calls').select('*').order('created_at',{ascending:false}).limit(100));
      const ids = [...new Set(rows.map(r => r.caller_id === uid() ? r.recipient_id : r.caller_id))];
      const people = ids.length ? await ok(sb.from('profiles').select('id,name').in('id',ids)) : [];
      const names = new Map(people.map(p=>[p.id,p.name]));
      return rows.map(r=>({id:r.id,name:names.get(r.caller_id===uid()?r.recipient_id:r.caller_id)||'Akoma member',type:r.call_type,status:r.status,created_at:r.created_at,seconds:r.accepted_at&&r.ended_at?Math.max(0,Math.round((new Date(r.ended_at)-new Date(r.accepted_at))/1000)):0,missed:r.status==='missed'||r.status==='declined'}));
    },

    // ---- my profile -----------------------------------------------------
    async me() {
      if (!uid()) return null;
      const row = await ok(sb.from('profiles').select('*').eq('id', uid()).maybeSingle());
      if (!row) { _me = null; return null; }
      try { const beacon = await ok(sb.from('looking_tonight').select('mode,expires_at').eq('user_id',uid()).maybeSingle()); row.looking_tonight_mode=beacon && beacon.mode; row.looking_tonight_until=beacon && beacon.expires_at; } catch (_) {}
      const photoUrls = await urls(row.photos);
      _me = Object.assign({}, row, { photoPaths: row.photos.slice(), photos: photoUrls.filter(Boolean), isAdmin: row.role === 'admin' && row.status === 'approved' });
      return _me;
    },
    async createProfile(f) {
      await ok(sb.from('profiles').insert({
        id: uid(), role: f.role, name: f.name, age: +f.age, city: f.city || 'Accra', bio: f.bio || '',
        interests: f.interests || [], looking_for: f.looking_for || 'Dating'
      }));
    },
    async updateProfile(patch) {
      const allowed = {};
      ['city', 'bio', 'interests', 'looking_for', 'hide_photo', 'hide_from_contacts', 'notifications', 'online_visible'].forEach((k) => { if (patch[k] !== undefined) allowed[k] = patch[k]; });
      await ok(sb.from('profiles').update(allowed).eq('id', uid()));
    },
    async setLocation(lat, lng, enabled) { await ok(sb.rpc('set_my_location', { p_lat: lat, p_lng: lng, p_enabled: enabled !== false })); _me = null; },
    async setLookingTonight(enabled, mode, hours) { return ok(sb.rpc('set_looking_tonight', { p_enabled: !!enabled, p_mode: mode || 'either', p_hours: hours || 4 })); },
    async lookingTonightIds() { const rows = await ok(sb.rpc('list_looking_tonight')); return new Set((rows || []).map(x => x.user_id)); },
    async vaultAssets() { return ok(sb.rpc('list_vault_assets')); },
    async uploadVault(file) {
      if (!file || !['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('Vault accepts JPEG, PNG or WebP images.');
      if (file.size > 8*1024*1024) throw new Error('Vault images must be 8 MB or smaller.');
      const path = uid() + '/' + uuid() + '.' + ({'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[file.type]);
      await ok(sb.storage.from('vault-media').upload(path,file,{contentType:file.type,upsert:false,cacheControl:'0'}));
      try { return await ok(sb.rpc('register_vault_asset',{p_path:path,p_mime:file.type})); }
      catch(e) { await sb.storage.from('vault-media').remove([path]); throw e; }
    },
    async grantVault(assetId, matchId, minutes) { return ok(sb.rpc('grant_vault_access',{p_asset:assetId,p_match:matchId,p_minutes:minutes})); },
    async revokeVault(grantId) { return ok(sb.rpc('revoke_vault_access',{p_grant:grantId})); },
    async vaultImage(path) { const res = await mediaFn({ action: 'vault-download', path }); return URL.createObjectURL(await res.blob()); },
    async deleteVault(assetId) { const path=await ok(sb.rpc('delete_vault_asset',{p_asset:assetId})); if(path) await ok(sb.storage.from('vault-media').remove([path])); return true; },
    async setOnlineVisibility(visible) { await ok(sb.rpc('set_online_visibility', { p_visible: !!visible })); _me = null; },
    async heartbeat() { if (uid()) await ok(sb.rpc('heartbeat')); },
    async addPhoto(blob) {
      const me = await ensureMe();
      if (me.photoPaths.length >= 6) throw new Error('too_many_photos');
      const path = uid() + '/' + uuid() + '.jpg';
      await ok(sb.storage.from('photos').upload(path, blob, { contentType: 'image/jpeg' }));
      try { await ok(sb.from('profiles').update({ photos: me.photoPaths.concat(path) }).eq('id', uid())); }
      catch (e) { await sb.storage.from('photos').remove([path]); throw e; }
    },
    async removePhoto(index) {
      const me = await ensureMe();
      const path = me.photoPaths[index]; if (!path) return;
      await ok(sb.from('profiles').update({ photos: me.photoPaths.filter((_, i) => i !== index) }).eq('id', uid()));
      await sb.storage.from('photos').remove([path]);
    },
    async uploadVerification(kind, blob) {
      const path = uid() + '/' + (kind === 'selfie' ? 'selfie' : 'id-card') + '.jpg';
      await ok(sb.storage.from('verification').upload(path, blob, { contentType: 'image/jpeg', upsert: true }));
      await ok(sb.from('profiles').update(kind === 'selfie' ? { selfie_path: path } : { id_card_path: path }).eq('id', uid()));
    },
    // The Edge Function removes every stored file (ID, photos, vault, chat media) and then the account.
    async deleteAccount() {
      await mediaFn({ action: 'delete-account' });
      try { await sb.auth.signOut({ scope: 'local' }); } catch (_) {}
      _session = null; _me = null; urlCache.clear();
    },

    // ---- browsing ---------------------------------------------------------
    async profiles(f) {
      f = f || {};
      const rows = await ok(sb.rpc('list_profiles', { p_min: f.min || 18, p_max: f.max || 99 }));
      let cards = await withUrls(rows, false);
      try { const beaconIds = await API.lookingTonightIds(); cards = cards.map(c => Object.assign({},c,{looking_tonight:beaconIds.has(c.id)})); } catch (_) {}
      if (f.radius) cards = cards.filter(c => c.distance_band && (f.radius===1 ? c.distance_band==='Under 1 km' : f.radius===5 ? ['Under 1 km','1–5 km'].includes(c.distance_band) : ['Under 1 km','1–5 km','5–10 km'].includes(c.distance_band)));
      if (cards.some(c=>c.distance_band)) cards.sort((a,b)=>({ 'Under 1 km':0,'1–5 km':1,'5–10 km':2,'10+ km':3 }[a.distance_band]??9)-({ 'Under 1 km':0,'1–5 km':1,'5–10 km':2,'10+ km':3 }[b.distance_band]??9));
      return cards;
    },
    async profile(id) {
      const rows = await ok(sb.rpc('get_profile', { target: id }));
      if (!rows.length) throw new Error('not_found');
      return (await withUrls(rows, true))[0];
    },
    async passProfile(id) { await ok(sb.rpc('pass_profile', { target: id })); },

    // ---- matching ------------------------------------------------------------
    async likeProfile(id) { return ok(sb.rpc('like_profile', { target: id })); },
    async sendRequest(id, text) { return ok(sb.rpc('send_request', { target: id, msg: text })); },
    async requests() {
      const me = await ensureMe();
      const cards = await cardMap();
      if (me.role === 'woman') {
        const rows = await ok(sb.from('message_requests').select('*').eq('to_woman', uid()).eq('status', 'pending').order('created_at', { ascending: false }));
        return { incoming: rows.map((r) => ({ id: r.id, from: cards.get(r.from_man) || unavailable(r.from_man), body: r.body, created_at: r.created_at })), outgoing: [] };
      }
      const rows = await ok(sb.from('message_requests').select('*').eq('from_man', uid()).order('created_at', { ascending: false }));
      return { incoming: [], outgoing: rows.map((r) => ({ id: r.id, to: cards.get(r.to_woman) || unavailable(r.to_woman), body: r.body, status: r.status, created_at: r.created_at })) };
    },
    async requestsToday() {
      const { count } = await sb.from('message_requests').select('id', { count: 'exact', head: true }).eq('from_man', uid()).gte('created_at', startOfDay());
      return count || 0;
    },
    async respondRequest(reqId, accept) { return ok(sb.rpc('respond_request', { req: reqId, accept })); },
    async matches() {
      const [rows, cards] = await Promise.all([ok(sb.rpc('list_matches')), cardMap()]);
      return rows.map((r) => ({ id: r.match_id, other: cards.get(r.other_id) || unavailable(r.other_id), last_body: r.last_body || '', last_at: r.last_at || r.created_at, flagged: !!r.last_flagged }));
    },
    async messages(matchId) {
      const rows = await ok(sb.from('messages').select('*').eq('match_id', matchId).order('created_at', { ascending: true }).limit(300));
      return Promise.all(rows.map(withMedia));
    },
    async sendMessage(matchId, text) { return ok(sb.rpc('send_message', { m: matchId, msg: text })); },
    async sendMedia(matchId, blob, kind, mode, duration, recordingSeconds) {
      if (!blob || !blob.size) throw new Error('Choose a file first.');
      const limits = { image: 8 * 1024 * 1024, video: 20 * 1024 * 1024, audio: 8 * 1024 * 1024 };
      if (blob.size > (limits[kind] || limits.image)) throw new Error('This file is too large. Photos: 8 MB, videos: 20 MB, voice notes: 8 MB.');
      const mime = (blob.type || (kind === 'audio' ? 'audio/webm' : kind === 'video' ? 'video/mp4' : 'image/jpeg')).split(';')[0];
      const allowed = kind === 'image' ? ['image/jpeg','image/png','image/webp'] : kind === 'video' ? ['video/mp4','video/webm','video/quicktime'] : ['audio/webm','audio/ogg','audio/mp4','audio/mpeg','audio/wav'];
      if (!allowed.includes(mime)) throw new Error('This file format is not supported.');
      const ext = ({'image/jpeg':'jpg','image/png':'png','image/webp':'webp','video/mp4':'mp4','video/webm':'webm','video/quicktime':'mov','audio/webm':'webm','audio/ogg':'ogg','audio/mp4':'m4a','audio/mpeg':'mp3','audio/wav':'wav'})[mime] || 'bin';
      const path = matchId + '/' + uid() + '/' + uuid() + '.' + ext;
      await ok(sb.storage.from('chat-media').upload(path, blob, { contentType: mime, upsert: false, cacheControl: '0' }));
      try {
        const row = await ok(sb.rpc('send_media_message', { p_match: matchId, p_path: path, p_kind: kind, p_mime: mime, p_mode: mode || 'normal', p_duration: duration || null, p_recording_seconds: recordingSeconds || null }));
        return await withMedia(row);
      } catch (e) { await sb.storage.from('chat-media').remove([path]); throw e; }
    },
    async openMedia(messageId) {
      const res = await mediaFn({ action: 'open', message_id: Number(messageId) });
      return URL.createObjectURL(await res.blob());
    },
    async closeMedia(messageId) { const res = await mediaFn({ action: 'close', message_id: Number(messageId) }); return res.json(); },
    // Live updates, with a slow poll as a safety net if the realtime socket drops.
    watchMessages(matchId, cb) {
      let last = 0, stopped = false;
      const ch = sb.channel('m-' + matchId + '-' + uuid())
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: 'match_id=eq.' + matchId }, async (p) => { last = Math.max(last, p.new.id); cb(await withMedia(p.new)); })
        .subscribe();
      const timer = setInterval(async () => {
        if (stopped || document.hidden) return;
        const { data } = await sb.from('messages').select('*').eq('match_id', matchId).gt('id', last).order('id');
        for (const m of (data || [])) { last = Math.max(last, m.id); cb(await withMedia(m)); }
      }, 8000);
      return () => { stopped = true; clearInterval(timer); sb.removeChannel(ch); };
    },
    async unmatch(matchId) { await ok(sb.rpc('unmatch', { m: matchId })); },

    // ---- safety ---------------------------------------------------------------
    async report(r) { await ok(sb.rpc('report_user', { target: r.target, why: r.reason, more: r.details || '', also_block: !!r.block })); },

    // ---- timeline ---------------------------------------------------------------
    async feed() {
      const rows = await ok(sb.rpc('feed'));
      const photoUrls = await urls(rows.flatMap((r) => [r.author_photo, r.image_path]));
      const map = new Map(); rows.flatMap((r) => [r.author_photo, r.image_path]).forEach((p, i) => { if (p) map.set(p, photoUrls[i]); });
      return rows.map((r) => ({
        id: r.id, author: { id: r.author_id, name: r.author_name, age: r.author_age, photos: r.author_photo && map.get(r.author_photo) ? [map.get(r.author_photo)] : [], photo_hidden: false },
        body: r.body, image: r.image_path ? map.get(r.image_path) || null : null, likes: Number(r.like_count), liked: r.liked, status: r.status, created_at: r.created_at, mine: r.mine
      }));
    },
    async createPost(f) {
      let path = null;
      if (f.blob) { path = uid() + '/post-' + uuid() + '.jpg'; await ok(sb.storage.from('photos').upload(path, f.blob, { contentType: 'image/jpeg' })); }
      try { await ok(sb.rpc('create_post', { msg: f.body || '', img: path })); }
      catch (e) { if (path) await sb.storage.from('photos').remove([path]); throw e; }
    },
    async togglePostLike(id) { return ok(sb.rpc('toggle_post_like', { post: id })); },

    // ---- subscription -----------------------------------------------------------
    async plans() { return ok(sb.from('plans').select('*').order('price_ghs')); },
    async subscription() {
      const s = await ok(sb.from('subscriptions').select('*').eq('user_id', uid()).maybeSingle());
      const active = !!s && s.status === 'active' && new Date(s.current_period_end) > new Date();
      return { active, plan: s ? s.plan : null, ends: s ? s.current_period_end : null };
    },
    async pay(o) {
      if (C.PAYMENTS_MODE === 'paystack') return payWithPaystack(o);
      await ok(sb.rpc('simulate_payment', { plan_code: o.plan, net: o.network }));
      return { reference: 'SIM' };
    },
    async payments() {
      const rows = await ok(sb.from('payments').select('*').eq('user_id', uid()).order('created_at', { ascending: false }));
      return rows.map((p) => ({ reference: p.reference, plan: p.plan, amount_ghs: p.amount_ghs, network: p.network, created_at: p.created_at }));
    },

    // ---- waitlist ---------------------------------------------------------------
    async joinWaitlist(f) {
      const phone = U.normalizePhone(f.phone); if (!phone) throw new Error('bad_phone');
      const { error } = await sb.from('waitlist').insert({ name: String(f.name || '').trim().slice(0, 60), phone, city: f.city || 'Accra', role: f.role === 'man' ? 'man' : 'woman' });
      if (error) { if (error.code === '23505') return { duplicate: true }; throw new Error(error.message); }
      return { duplicate: false };
    },

    // ---- admin ---------------------------------------------------------------------
    admin: {
      async stats() {
        const n = async (q) => { const { count } = await q; return count || 0; };
        const head = (t) => sb.from(t).select('id', { count: 'exact', head: true });
        const prof = () => sb.from('profiles').select('id', { count: 'exact', head: true }).neq('role', 'admin');
        const [pending, openReports, pendingPosts, women, men, activeSubs, wlW, wlM, pays] = await Promise.all([
          n(prof().eq('status', 'pending')), n(head('reports').eq('status', 'open')), n(head('posts').eq('status', 'pending')),
          n(prof().eq('role', 'woman').eq('status', 'approved')), n(prof().eq('role', 'man').eq('status', 'approved')),
          n(sb.from('subscriptions').select('user_id', { count: 'exact', head: true }).eq('status', 'active').gt('current_period_end', new Date().toISOString())),
          n(head('waitlist').eq('role', 'woman')), n(head('waitlist').eq('role', 'man')),
          ok(sb.from('payments').select('amount_ghs'))
        ]);
        return { pending, openReports, pendingPosts, women, men, activeSubs, waitlistWomen: wlW, waitlistMen: wlM, revenue: pays.reduce((a, p) => a + Number(p.amount_ghs), 0) };
      },
      async queue() {
        const rows = await ok(sb.from('profiles').select('*').eq('status', 'pending').neq('role', 'admin').order('created_at'));
        return Promise.all(rows.map(async (u) => {
          const [selfie, card] = await Promise.all([
            u.selfie_path ? urls([u.selfie_path], 'verification') : [null],
            u.id_card_path ? urls([u.id_card_path], 'verification') : [null]
          ]);
          return { profile: u, selfie: selfie[0], idCard: card[0], hasSelfie: !!u.selfie_path, hasCard: !!u.id_card_path, photos: (await urls(u.photos)).filter(Boolean) };
        }));
      },
      async setStatus(id, status, note) { await ok(sb.rpc('admin_set_status', { target: id, new_status: status, note: note || null })); },
      async reports(status) {
        let q = sb.from('reports').select('*').order('created_at', { ascending: false }).limit(100);
        if (status) q = q.eq('status', status);
        const rows = await ok(q);
        const ids = [...new Set(rows.flatMap((r) => [r.reporter_id, r.reported_id]))];
        const people = ids.length ? await ok(sb.from('profiles').select('id,name,role,status').in('id', ids)) : [];
        const by = new Map(people.map((p) => [p.id, p]));
        const brief = (id) => by.get(id) || { id, name: 'Deleted user', role: '', status: '' };
        return Promise.all(rows.map(async (r) => {
          let recent = [];
          const pair = await ok(sb.from('matches').select('id').or('and(woman_id.eq.' + r.reporter_id + ',man_id.eq.' + r.reported_id + '),and(woman_id.eq.' + r.reported_id + ',man_id.eq.' + r.reporter_id + ')'));
          if (pair.length) {
            const ms = await ok(sb.from('messages').select('sender_id,body,flagged').eq('match_id', pair[0].id).order('created_at', { ascending: false }).limit(4));
            recent = ms.reverse().map((m) => ({ from: m.sender_id === r.reported_id ? 'reported' : 'reporter', body: m.body, flagged: m.flagged }));
          }
          return { id: r.id, reason: r.reason, details: r.details, status: r.status, created_at: r.created_at, reporter: brief(r.reporter_id), reported: brief(r.reported_id), recent };
        }));
      },
      async resolveReport(id, status) { await ok(sb.from('reports').update({ status }).eq('id', id)); },
      async posts() {
        const rows = await ok(sb.from('posts').select('*').eq('status', 'pending').order('created_at', { ascending: false }));
        const ids = [...new Set(rows.map((r) => r.author_id))];
        const people = ids.length ? await ok(sb.from('profiles').select('id,name,role,status').in('id', ids)) : [];
        const by = new Map(people.map((p) => [p.id, p]));
        const imgs = await urls(rows.map((r) => r.image_path));
        return rows.map((r, i) => ({ id: r.id, author: by.get(r.author_id) || { id: r.author_id, name: 'Deleted user' }, body: r.body, image: imgs[i], created_at: r.created_at }));
      },
      async moderatePost(id, okay) { await ok(sb.from('posts').update({ status: okay ? 'visible' : 'removed' }).eq('id', id)); },
      async users(q) {
        let query = sb.from('profiles').select('id,name,age,role,city,status,featured_until,created_at').neq('role', 'admin').order('created_at', { ascending: false }).limit(200);
        if (q) query = query.ilike('name', '%' + q.replace(/[%_]/g, '') + '%');
        const [rows, subs] = await Promise.all([ok(query), ok(sb.from('subscriptions').select('user_id,status,current_period_end'))]);
        const active = new Set(subs.filter((s) => s.status === 'active' && new Date(s.current_period_end) > new Date()).map((s) => s.user_id));
        return rows.map((u) => ({ id: u.id, name: u.name, age: u.age, role: u.role, city: u.city, status: u.status, featured: !!(u.featured_until && new Date(u.featured_until) > new Date()), subscribed: active.has(u.id), created_at: u.created_at }));
      },
      async feature(id, days) { await ok(sb.from('profiles').update({ featured_until: days ? new Date(Date.now() + days * 864e5).toISOString() : null }).eq('id', id)); },
      async payments() {
        const rows = await ok(sb.from('payments').select('*').order('created_at', { ascending: false }).limit(200));
        const ids = [...new Set(rows.map((r) => r.user_id))];
        const people = ids.length ? await ok(sb.from('profiles').select('id,name,role,status').in('id', ids)) : [];
        const by = new Map(people.map((p) => [p.id, p]));
        return rows.map((p) => ({ reference: p.reference, user: by.get(p.user_id) || { id: p.user_id, name: 'Deleted user' }, plan: p.plan, amount_ghs: p.amount_ghs, network: p.network, created_at: p.created_at }));
      },
      async waitlist() { return ok(sb.from('waitlist').select('*').order('created_at', { ascending: false }).limit(1000)); },
      async invite(id, v) { await ok(sb.from('waitlist').update({ invited: v !== false }).eq('id', id)); }
    }
  };

  // Real MoMo through the Paystack popup. The webhook (supabase/functions/paystack-webhook)
  // confirms the payment and switches the subscription on; we wait for that here.
  async function payWithPaystack(o) {
    if (!C.PAYSTACK_PUBLIC_KEY) throw new Error('not_allowed');
    await loadScript('https://js.paystack.co/v1/inline.js');
    const pl = (await API.plans()).find((p) => p.code === o.plan); if (!pl) throw new Error('not_found');
    const before = (await API.subscription()).ends;
    const ref = 'AK-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    await new Promise((resolve, reject) => {
      const h = window.PaystackPop.setup({
        key: C.PAYSTACK_PUBLIC_KEY, email: uid() + '@users.akoma.app',
        amount: Math.round(pl.price_ghs * 100), currency: 'GHS', ref, channels: ['mobile_money'],
        metadata: { user_id: uid(), plan: o.plan },
        callback: function () { resolve(); },
        onClose: function () { reject(new Error('payment_cancelled')); }
      });
      h.openIframe();
    });
    for (let i = 0; i < 30; i++) {
      await sleep(3000);
      const s = await API.subscription();
      if (s.active && s.ends !== before) return { reference: ref };
    }
    throw new Error('payment_timeout');
  }

  window.API_SB = API;
})();

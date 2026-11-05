// Demo data layer. Everything lives in this browser (localStorage), so the
// whole app can be tried without any setup. It follows the same rules as
// supabase/schema.sql and exposes the same functions as api-supabase.js.
(function () {
  'use strict';
  const U = window.AkomaUtil;
  const KEY = 'akoma_demo_v2';
  const DAY = 864e5, HOUR = 36e5;
  const ago = (ms) => new Date(Date.now() - ms).toISOString();
  const ahead = (ms) => new Date(Date.now() + ms).toISOString();
  const rid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-3);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms == null ? 60 : ms));
  const PLANS = [
    { code: 'week', label: 'Weekly', price_ghs: 30, days: 7 },
    { code: 'month', label: 'Monthly', price_ghs: 100, days: 30 }
  ];
  let db = null;

  function P(id, role, name, age, city, bio, interests, looking, x) {
    return Object.assign({
      id, role, name, age, city, bio, interests, looking_for: looking, photos: [],
      hide_photo: false, hide_from_contacts: true, notifications: true,
      status: 'approved', review_note: '', selfie_path: null, id_card_path: null,
      featured_until: null, location_enabled: false, latitude: null, longitude: null, online_visible: false, last_seen_at: null, created_at: ago(DAY * 15)
    }, x || {});
  }

  function seed() {
    const feat = ahead(DAY * 5);
    const list = [
      P('dw', 'woman', 'Efua', 41, 'Airport Residential', 'Boutique owner. Sunday mornings are for aerobics, evenings for good conversation.', ['Fitness', 'Fashion', 'Travel'], 'Serious relationship', { featured_until: feat }),
      P('w2', 'woman', 'Abena', 46, 'Cantonments', 'Lawyer. Divorced, happy, and ready to laugh again. I like people who show up on time.', ['Reading', 'Travel', 'Dancing'], 'Dating', { hide_photo: true, featured_until: feat }),
      P('w3', 'woman', 'Akosua', 38, 'Adenta', 'School proprietor. Church choir, cooking for friends, long drives to Aburi.', ['Music', 'Cooking', 'Hiking'], 'Friendship first'),
      P('w4', 'woman', 'Maame', 44, 'Dzorwulu', 'Accountant by day, salsa dancer by night. I laugh loudly and plan well.', ['Dancing', 'Travel', 'Food'], 'Dating'),
      P('w5', 'woman', 'Adwoa', 39, 'Labone', 'Interior designer. Weekend markets, good coffee and a lot of plants.', ['Fashion', 'Reading', 'Cooking'], 'Serious relationship', { hide_photo: true }),
      P('w6', 'woman', 'Esi', 48, 'East Legon', 'Hotel manager. I walk every morning and I am ready for good company.', ['Fitness', 'Hiking', 'Music'], 'Friendship first', { featured_until: feat }),
      P('w7', 'woman', 'Ama', 43, 'Tema', 'Nurse and part-time baker. Honest, warm, and always up for a road trip.', ['Cooking', 'Travel', 'Church'], 'Dating', { hide_photo: true }),
      P('w8', 'woman', 'Serwaa', 36, 'Haatso', 'Event planner. I love live music and people who keep their word.', ['Music', 'Dancing', 'Fashion'], 'Serious relationship'),
      P('dm', 'man', 'Kofi', 31, 'East Legon', 'Marketing lead who cooks on Sundays. Looking for someone who can out-talk me.', ['Cooking', 'Music', 'Football'], 'Dating'),
      P('m1', 'man', 'Kwame', 29, 'East Legon', 'Physiotherapist. Football on Saturdays, jollof debates all week.', ['Fitness', 'Travel', 'Cooking'], 'Serious relationship', { featured_until: feat }),
      P('m2', 'man', 'Yaw', 31, 'Osu', 'Runs a small events company. Early riser, loves live highlife nights.', ['Music', 'Running', 'Food'], 'Dating'),
      P('m3', 'man', 'Nii', 27, 'Tema', 'Civil engineer. Weekend hikes at Aburi and a very good playlist.', ['Hiking', 'Reading', 'Football'], 'Dating', { featured_until: feat }),
      P('m4', 'man', 'Kojo', 33, 'Spintex', 'Chef at a restaurant in Labone. Will cook for you, and means it.', ['Cooking', 'Dancing', 'Travel'], 'Serious relationship'),
      P('m5', 'man', 'Selasi', 30, 'Madina', 'Software developer. Weekend cyclist, terrible at karaoke, good at listening.', ['Cycling', 'Music', 'Food'], 'Dating'),
      P('m6', 'man', 'Ebo', 35, 'Kokomlemle', 'Photographer who loves markets, sunrise and a long walk with no plan.', ['Travel', 'Reading', 'Food'], 'Serious relationship'),
      P('m7', 'man', 'Daniel', 28, 'Dzorwulu', 'Physical education teacher. Plays volleyball at the beach on Sundays.', ['Fitness', 'Football', 'Dancing'], 'Dating'),
      P('m8', 'man', 'Fiifi', 32, 'Labadi', 'Sound engineer. Highlife, jazz and a very well organised record shelf.', ['Music', 'Hiking', 'Cooking'], 'Friendship first'),
      P('p1', 'woman', 'Esther', 40, 'Tema', 'Teacher and choir member. I enjoy quiet evenings and live music.', ['Music', 'Church', 'Cooking'], 'Dating', { status: 'pending', selfie_path: 'demo', created_at: ago(2 * HOUR) }),
      P('p2', 'man', 'Mensah', 28, 'Madina', 'Electrician and amateur footballer. Straightforward and reliable.', ['Football', 'Fitness', 'Music'], 'Dating', { status: 'pending', selfie_path: 'demo', id_card_path: 'demo', created_at: ago(5 * HOUR) }),
      P('p3', 'woman', 'Gifty', 45, 'Spintex', 'Pharmacist. Weekend walks and good food with good company.', ['Fitness', 'Food', 'Reading'], 'Serious relationship', { status: 'pending', selfie_path: 'demo', created_at: ago(DAY) }),
      P('admin1', 'admin', 'Admin', 35, 'Accra', '', [], 'Dating')
    ];
    const users = {}; list.forEach((p) => { users[p.id] = p; });
    const mt = (id, w, m, origin, t) => ({ id, woman_id: w, man_id: m, origin, status: 'active', created_at: ago(t) });
    const msg = (id, match_id, sender_id, body, flagged, t) => ({ id, match_id, sender_id, body, flagged: !!flagged, created_at: ago(t) });
    const sub = (plan, days) => ({ plan, status: 'active', current_period_end: ahead(DAY * days) });
    const pay = (u, plan, amt, net, t) => ({ id: rid(), user_id: u, reference: 'AK-' + rid().toUpperCase(), plan, amount_ghs: amt, network: net, status: 'success', created_at: ago(t) });
    const wl = (name, role, city, t, invited) => ({ id: rid(), name, phone: '+23324' + Math.floor(1000000 + Math.random() * 8999999), city, role, invited: !!invited, created_at: ago(t) });
    return {
      users,
      matches: [mt('mt1', 'dw', 'm1', 'like', 2 * DAY), mt('mt2', 'dw', 'm2', 'request', DAY), mt('mt3', 'w2', 'dm', 'like', DAY)],
      messages: [
        msg(1, 'mt1', 'm1', 'Good evening. Your bio made me laugh, I had to say hello.', false, 2 * DAY - HOUR),
        msg(2, 'mt1', 'dw', 'Thank you! What do you do on Saturdays besides football?', false, 2 * DAY - 2 * HOUR),
        msg(3, 'mt2', 'm2', 'Hello dear, I need airtime urgently, it is an emergency. Can you send me 50 cedis on MoMo?', true, DAY - HOUR),
        msg(4, 'mt3', 'w2', 'Hi Kofi. I liked that you listed cooking. What is your signature dish?', false, 5 * HOUR)
      ],
      seq: 10,
      requests: [
        { id: 'rq1', from_man: 'm3', to_woman: 'dw', body: 'Good evening Efua. I saw you love Aburi on weekends. May I take you for a walk there some time?', status: 'pending', created_at: ago(3 * HOUR) },
        { id: 'rq2', from_man: 'm4', to_woman: 'dw', body: 'Hello. Your profile made me smile. I cook for people I like, and I would love to know your favourite dish.', status: 'pending', created_at: ago(8 * HOUR) },
        { id: 'rq3', from_man: 'dm', to_woman: 'w3', body: 'Hello Akosua. I noticed we both love live music. Which band should I see next?', status: 'pending', created_at: ago(DAY) }
      ],
      blocks: [], passes: [],
      posts: [
        { id: 'po1', author_id: 'dw', body: 'Sunday aerobics done. Who else is up at 6am on weekends?', image: null, status: 'visible', created_at: ago(2 * HOUR) },
        { id: 'po2', author_id: 'm4', body: 'Tested a new groundnut soup today. Tell me your favourite soup and I will cook it.', image: { h: 30, label: 'Groundnut soup' }, status: 'visible', created_at: ago(4 * HOUR) },
        { id: 'po3', author_id: 'm3', body: '', image: { h: 150, label: 'Aburi Gardens, Saturday' }, status: 'visible', created_at: ago(DAY) },
        { id: 'po4', author_id: 'w3', body: 'Looking for good live music in Accra this weekend. Suggestions welcome.', image: null, status: 'visible', created_at: ago(DAY + 3 * HOUR) },
        { id: 'po5', author_id: 'w8', body: '', image: { h: 280, label: 'Sunset at Labadi' }, status: 'pending', created_at: ago(HOUR) }
      ],
      postLikes: { po1: ['m1', 'm3'], po2: ['dw', 'w3', 'w6'], po3: ['dw'], po4: ['m5'] },
      reports: [{ id: 'rp1', reporter_id: 'dw', reported_id: 'm2', reason: 'Asked for money', details: 'Asked for airtime in chat.', status: 'open', created_at: ago(HOUR * 20) }],
      subs: { m1: sub('month', 21), m2: sub('week', 3), m3: sub('month', 12), m4: sub('week', 5) },
      payments: [pay('m1', 'month', 100, 'MTN MoMo', 9 * DAY), pay('m2', 'week', 30, 'Telecel Cash', 4 * DAY), pay('m3', 'month', 100, 'MTN MoMo', 18 * DAY), pay('m4', 'week', 30, 'AT Money', 2 * DAY)],
      waitlist: [
        wl('Comfort A.', 'woman', 'Accra', 6 * DAY, true), wl('Beatrice O.', 'woman', 'Accra', 6 * DAY), wl('Mavis T.', 'woman', 'Tema', 5 * DAY), wl('Josephine K.', 'woman', 'Kumasi', 5 * DAY),
        wl('Patience N.', 'woman', 'Accra', 4 * DAY), wl('Rita M.', 'woman', 'Accra', 3 * DAY), wl('Gloria D.', 'woman', 'Cape Coast', 3 * DAY), wl('Selina B.', 'woman', 'Accra', 2 * DAY),
        wl('Daniel O.', 'man', 'Accra', 5 * DAY), wl('Emmanuel S.', 'man', 'Tema', 4 * DAY), wl('Isaac A.', 'man', 'Accra', 3 * DAY), wl('Richmond Q.', 'man', 'Kumasi', 2 * DAY), wl('Prince E.', 'man', 'Accra', DAY)
      ],
      phones: {}, emails: {}, session: null
    };
  }

  function load() {
    try { db = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { db = null; }
    if (!db || !db.users) db = seed();
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* storage full or blocked: keep memory only */ } }

  // ---- rules (same as the database) --------------------------------------
  const sid = () => db.session && db.session.userId;
  const meRow = () => db.users[sid()] || null;
  function need(role) {
    const m = meRow();
    if (!m || m.status !== 'approved') throw new Error('not_allowed');
    if (role && m.role !== role) throw new Error('not_allowed');
    return m;
  }
  const isAdminRow = (m) => !!m && m.role === 'admin' && m.status === 'approved';
  function needAdmin() { if (!isAdminRow(meRow())) throw new Error('not_allowed'); }
  const blockedBetween = (a, b) => db.blocks.some((x) => (x.blocker === a && x.blocked === b) || (x.blocker === b && x.blocked === a));
  const activeMatch = (a, b) => db.matches.find((m) => m.status === 'active' && ((m.woman_id === a && m.man_id === b) || (m.woman_id === b && m.man_id === a)));
  const subActive = (id) => { const s = db.subs[id]; return !!s && s.status === 'active' && new Date(s.current_period_end) > new Date(); };
  const canSee = (viewer, p) => viewer === p.id || !p.hide_photo || !!activeMatch(viewer, p.id) || isAdminRow(db.users[viewer]);
  const featuredNow = (p) => !!(p.featured_until && new Date(p.featured_until) > new Date());

  function distanceBand(a,b) {
    const rad=x=>x*Math.PI/180, dlat=rad(b.latitude-a.latitude), dlng=rad(b.longitude-a.longitude);
    const h=Math.sin(dlat/2)**2+Math.cos(rad(a.latitude))*Math.cos(rad(b.latitude))*Math.sin(dlng/2)**2;
    const km=6371*2*Math.asin(Math.sqrt(h));
    return km<1?'Under 1 km':km<5?'1–5 km':km<10?'5–10 km':'10+ km';
  }
  function activityLabel(ts) {
    const age=Date.now()-new Date(ts).getTime();
    return age<5*60000?'Online now':age<86400000?'Active today':age<7*86400000?'Active this week':null;
  }
  function card(p) {
    const me = sid(); const vis = canSee(me, p);
    return {
      id: p.id, role: p.role, name: p.name, age: p.age, city: p.city, bio: p.bio,
      interests: p.interests.slice(), looking_for: p.looking_for,
      photos: vis ? p.photos.slice() : [], photo_hidden: !vis, featured: featuredNow(p),
      is_match: !!activeMatch(me, p.id),
      request_sent: db.requests.some((r) => r.from_man === me && r.to_woman === p.id),
      passed: db.passes.some((x) => x.user_id === me && x.target_id === p.id),
      distance_band: (me && db.users[me] && db.users[me].location_enabled && p.location_enabled && Number.isFinite(db.users[me].latitude) && Number.isFinite(db.users[me].longitude) && Number.isFinite(p.latitude) && Number.isFinite(p.longitude))
        ? distanceBand(db.users[me], p) : null,
      activity_label: (me && db.users[me] && db.users[me].online_visible && p.online_visible && p.last_seen_at)
        ? activityLabel(p.last_seen_at) : null,
      looking_tonight: !!(p.looking_tonight_until && new Date(p.looking_tonight_until)>new Date() && db.users[me] && p.city===db.users[me].city)
    };
  }
  function cardById(id) { const p = db.users[id]; return p ? card(p) : { id, name: 'Unavailable', age: '', city: '', photos: [], photo_hidden: false, interests: [] }; }
  const startOfDay = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const REPLIES = ['That sounds lovely. When are you free this week?', 'Ha, I like that. Tell me more.', 'Good evening! How was your day?', 'I would enjoy that. Saturday could work.'];

  const API = {
    mode: 'demo',
    config: window.AKOMA_CONFIG || {},

    async init() { load(); },

    // ---- auth -----------------------------------------------------------
    session() { return db.session ? { userId: db.session.userId, email: db.session.email || '' } : null; },
    async authenticate(email, password, mode) {
      await wait(250);
      const address = String(email || '').trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) throw new Error('Enter a valid email address.');
      if (String(password || '').length < 8) throw new Error('Your password must be at least 8 characters.');
      if (mode === 'signup' && db.emails[address]) throw new Error('An account with this email already exists.');
      if (mode === 'login' && !db.emails[address]) throw new Error('No demo account exists for this email. Choose Create account.');
      if (!db.emails[address]) db.emails[address] = 'u' + rid();
      db.session = { userId: db.emails[address], email: address };
      save();
      return { userId: db.session.userId, confirmationRequired: false };
    },
    async demoLogin(kind) {
      db.session = { userId: { woman: 'dw', man: 'dm', admin: 'admin1' }[kind], email: kind + '@demo.akoma.app' };
      save();
    },
    async demoApproveMe() { const m = meRow(); if (m) { m.status = 'approved'; save(); } },
    async demoReset() { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } db = seed(); save(); },
    async signOut() { db.session = null; save(); },

    // ---- my profile -----------------------------------------------------
    async me() {
      await wait();
      const m = meRow();
      return m ? Object.assign({}, m, { photoPaths: m.photos.slice(), isAdmin: isAdminRow(m) }) : null;
    },
    async createProfile(f) {
      await wait();
      if (!(f.age >= 18)) throw new Error('not_allowed');
      if (U.hasMoney(f.bio) || U.hasContact(f.bio)) throw new Error('bio_not_allowed');
      db.users[sid()] = P(sid(), f.role === 'man' ? 'man' : 'woman', f.name, +f.age, f.city || 'Accra', f.bio || '', f.interests || [], f.looking_for || 'Dating', { status: 'guest', created_at: now() });
      save();
    },
    async updateProfile(patch) {
      await wait();
      const m = meRow(); if (!m) throw new Error('not_allowed');
      if (patch.bio != null && (U.hasMoney(patch.bio) || U.hasContact(patch.bio))) throw new Error('bio_not_allowed');
      ['name', 'age', 'city', 'bio', 'interests', 'looking_for', 'hide_photo', 'hide_from_contacts', 'notifications', 'online_visible'].forEach((k) => { if (patch[k] !== undefined) m[k] = patch[k]; });
      save();
    },
    async setLocation(lat, lng, enabled) {
      const m=meRow(); if(!m) throw new Error('not_allowed');
      if(enabled===false){m.location_enabled=false;m.latitude=null;m.longitude=null;}
      else {
        if(!Number.isFinite(lat)||!Number.isFinite(lng)) throw new Error('invalid_location');
        m.location_enabled=true;
        // Snap to ~500 m grid cells; exact browser coordinates are never retained.
        m.latitude=Math.round(lat/0.005)*0.005; m.longitude=Math.round(lng/0.005)*0.005;
      }
      save();
    },
    async setOnlineVisibility(visible) { const m=meRow(); if(!m) throw new Error('not_allowed'); m.online_visible=!!visible; save(); },
    async setLookingTonight(enabled, mode, hours) { const m=meRow(); if(!m) throw new Error('not_allowed'); m.looking_tonight_until=enabled?new Date(Date.now()+(hours||4)*3600000).toISOString():null; m.looking_tonight_mode=mode||'either'; save(); return m.looking_tonight_until; },
    async lookingTonightIds() { const m=meRow(); return new Set(Object.values(db.users).filter(p=>p.role!==m.role&&p.city===m.city&&p.looking_tonight_until&&new Date(p.looking_tonight_until)>new Date()&&!blockedBetween(m.id,p.id)).map(p=>p.id)); },
    async vaultAssets() { const me=meRow(), out=[]; Object.values(db.users).forEach(owner=>(owner.vault_assets||[]).forEach(a=>{if(owner.id===me.id)out.push({...a,owned:true});else if(a.viewer_id===me.id&&!a.revoked_at&&new Date(a.expires_at)>new Date())out.push({...a,owned:false});})); return out; },
    async uploadVault(file) { const m=meRow(); if(!m) throw new Error('not_allowed'); const data=await U.blobToDataURL(file); const a={id:rid(),owner_id:m.id,storage_path:data,mime_type:file.type,created_at:now(),owned:true}; m.vault_assets=m.vault_assets||[];m.vault_assets.unshift(a);save();return a; },
    async grantVault(assetId,matchId,minutes) { const m=meRow(); const a=(m.vault_assets||[]).find(x=>x.id===assetId); if(!a) throw new Error('not_found'); const mt=db.matches.find(x=>x.id===matchId&&x.status==='active'); if(!mt) throw new Error('not_matched'); const other=mt.woman_id===m.id?mt.man_id:mt.woman_id; a.grant_id=rid();a.viewer_id=other;a.expires_at=new Date(Date.now()+minutes*60000).toISOString();save();return a; },
    async revokeVault(grantId) { const m=meRow(); (m.vault_assets||[]).forEach(a=>{if(a.grant_id===grantId)a.revoked_at=now();});save();return true; },
    async vaultImage(path) { return path; },
    async deleteVault(assetId) { const m=meRow();m.vault_assets=(m.vault_assets||[]).filter(a=>a.id!==assetId);save();return true; },
    async heartbeat() { const m=meRow(); if(m){m.last_seen_at=now();save();} },
    async addPhoto(blob) {
      const m = meRow(); if (m.photos.length >= 6) throw new Error('too_many_photos');
      m.photos.push(await U.blobToDataURL(blob)); save();
    },
    async removePhoto(index) { const m = meRow(); m.photos.splice(index, 1); save(); },
    async uploadVerification(kind, blob) {
      const m = meRow(); const url = await U.blobToDataURL(blob);
      if (kind !== 'selfie') throw new Error('ID verification is not used on Akoma.');
      m.selfie_path = url; save();
    },
    async submitSelfieVerification() { const m=meRow(); if(!m || m.status==='approved' || m.status==='banned' || !m.selfie_path) throw new Error('selfie_required'); m.status='pending'; save(); },
    async deleteAccount() {
      const id = sid(); delete db.users[id];
      db.matches = db.matches.filter((x) => x.woman_id !== id && x.man_id !== id);
      db.requests = db.requests.filter((x) => x.from_man !== id && x.to_woman !== id);
      db.posts = db.posts.filter((x) => x.author_id !== id);
      Object.keys(db.phones).forEach((k) => { if (db.phones[k] === id) delete db.phones[k]; });
      db.session = null; save();
    },

    // ---- browsing ---------------------------------------------------------
    async profiles(f) {
      await wait();
      const m = meRow();
      if (!m || !['approved','guest','pending'].includes(m.status) || m.role === 'admin') return [];
      f = f || {};
      const other = m.role === 'woman' ? 'man' : 'woman';
      let cards = Object.values(db.users)
        .filter((p) => p.role === other && p.status === 'approved' && p.age >= (f.min || 18) && p.age <= (f.max || 99) && !blockedBetween(m.id, p.id))
        .map(card);
      if (f.radius) cards = cards.filter(c => c.distance_band && (f.radius===1 ? c.distance_band==='Under 1 km' : f.radius===5 ? ['Under 1 km','1–5 km'].includes(c.distance_band) : ['Under 1 km','1–5 km','5–10 km'].includes(c.distance_band)));
      return cards.sort((a, b) => (b.featured - a.featured) || (({'Under 1 km':0,'1–5 km':1,'5–10 km':2,'10+ km':3}[a.distance_band]??9)-({'Under 1 km':0,'1–5 km':1,'5–10 km':2,'10+ km':3}[b.distance_band]??9)));
    },
    async profile(id) { await wait(); const p = db.users[id]; if (!p || p.status !== 'approved' || blockedBetween(sid(), id)) throw new Error('not_found'); return card(p); },
    async passProfile(id) { need(); if (!db.passes.some((x) => x.user_id === sid() && x.target_id === id)) db.passes.push({ user_id: sid(), target_id: id }); save(); },

    // ---- matching ------------------------------------------------------------
    async likeProfile(id) {
      await wait();
      const me = need('woman'); const t = db.users[id];
      if (!t || t.role !== 'man' || t.status !== 'approved') throw new Error('not_found');
      if (blockedBetween(me.id, id)) throw new Error('blocked');
      let mt = db.matches.find((x) => x.woman_id === me.id && x.man_id === id);
      if (mt) mt.status = 'active'; else { mt = { id: 'mt' + rid(), woman_id: me.id, man_id: id, origin: 'like', status: 'active', created_at: now() }; db.matches.push(mt); }
      db.requests.forEach((r) => { if (r.from_man === id && r.to_woman === me.id && r.status === 'pending') r.status = 'accepted'; });
      save(); return mt.id;
    },
    async sendRequest(id, text) {
      await wait();
      const me = need('man'); const body = String(text || '').trim();
      const t = db.users[id];
      if (!t || t.role !== 'woman' || t.status !== 'approved') throw new Error('not_found');
      if (blockedBetween(me.id, id)) throw new Error('blocked');
      if (activeMatch(me.id, id)) throw new Error('already_matched');
      if (db.requests.some((r) => r.from_man === me.id && r.to_woman === id)) throw new Error('already_requested');
      if (body.length < 1 || body.length > 200) throw new Error('bad_length');
      if (U.hasContact(body)) throw new Error('contact_not_allowed');
      if (U.hasMoney(body)) throw new Error('money_not_allowed');
      const r = { id: 'rq' + rid(), from_man: me.id, to_woman: id, body, status: 'pending', created_at: now() };
      db.requests.push(r); save(); return r.id;
    },
    async requests() {
      await wait();
      const m = need();
      if (m.role === 'woman') {
        return { incoming: db.requests.filter((r) => r.to_woman === m.id && r.status === 'pending').sort(byNew).map((r) => ({ id: r.id, from: cardById(r.from_man), body: r.body, created_at: r.created_at })), outgoing: [] };
      }
      return { incoming: [], outgoing: db.requests.filter((r) => r.from_man === m.id).sort(byNew).map((r) => ({ id: r.id, to: cardById(r.to_woman), body: r.body, status: r.status, created_at: r.created_at })) };
    },
    async requestsToday() { const m = need('man'); return db.requests.filter((r) => r.from_man === m.id && new Date(r.created_at).getTime() >= startOfDay()).length; },
    async respondRequest(reqId, accept) {
      await wait();
      const me = need('woman'); const r = db.requests.find((x) => x.id === reqId && x.to_woman === me.id && x.status === 'pending');
      if (!r) throw new Error('not_found');
      if (!accept) { r.status = 'declined'; save(); return null; }
      let mt = db.matches.find((x) => x.woman_id === me.id && x.man_id === r.from_man);
      if (mt) mt.status = 'active'; else { mt = { id: 'mt' + rid(), woman_id: me.id, man_id: r.from_man, origin: 'request', status: 'active', created_at: now() }; db.matches.push(mt); }
      db.messages.push({ id: ++db.seq, match_id: mt.id, sender_id: r.from_man, body: r.body, flagged: false, created_at: now() });
      r.status = 'accepted'; save(); return mt.id;
    },
    async matches() {
      await wait();
      const m = need();
      return db.matches.filter((x) => x.status === 'active' && (x.woman_id === m.id || x.man_id === m.id)).map((x) => {
        const other = x.woman_id === m.id ? x.man_id : x.woman_id;
        const ms = db.messages.filter((y) => y.match_id === x.id);
        const last = ms[ms.length - 1];
        return { id: x.id, other: cardById(other), last_body: last ? last.body : '', last_at: last ? last.created_at : x.created_at, flagged: ms.some((y) => y.flagged) };
      }).sort((a, b) => new Date(b.last_at) - new Date(a.last_at));
    },
    async messages(matchId) {
      await wait();
      const m = need(); const x = db.matches.find((y) => y.id === matchId && y.status === 'active' && (y.woman_id === m.id || y.man_id === m.id));
      if (!x) throw new Error('not_found');
      return db.messages.filter((y) => y.match_id === matchId).map((y) => Object.assign({}, y));
    },
    async sendMedia(matchId, blob, kind, mode, duration, recordingSeconds) {
      await wait(100); const me = need();
      const x = db.matches.find(y => y.id === matchId && y.status === 'active' && (y.woman_id === me.id || y.man_id === me.id));
      if (!x || blockedBetween(me.id, x.woman_id === me.id ? x.man_id : x.woman_id)) throw new Error('blocked');
      const url = URL.createObjectURL(blob); const row = { id: ++db.seq, match_id: matchId, sender_id: me.id, body: '', flagged: false, message_type: kind, media_mode: mode || 'normal', media_url: url, media_path: 'demo:' + Date.now() + Math.random().toString(36).slice(2), media_mime: blob.type, media_name: blob.name || '', duration_seconds: recordingSeconds || null, expires_at: mode === 'timed' ? new Date(Date.now() + (duration || 3600) * 1000).toISOString() : null, opened_at: null, created_at: now() };
      db.messages.push(row); save(); return Object.assign({}, row);
    },
    async closeMedia(messageId) { const msg=db.messages.find(x=>String(x.id)===String(messageId)); if(msg){msg.body='Expired media';msg.media_path=null;msg.media_url=null;msg.opened_at=now();} save(); return true; },
    async openMedia(messageId) {
      const row = db.messages.find(x => String(x.id) === String(messageId));
      if (!row || !row.media_url || (row.media_mode === 'view_once' && row.opened_at)) throw new Error('This media has already been opened or has expired.');
      if (row.expires_at && new Date(row.expires_at) < new Date()) throw new Error('This media has expired.');
      if (row.media_mode === 'view_once') row.opened_at = now(); save(); return row.media_url;
    },
    async sendMessage(matchId, text) {
      await wait(30);
      const me = need(); const body = String(text || '').trim();
      const x = db.matches.find((y) => y.id === matchId && y.status === 'active' && (y.woman_id === me.id || y.man_id === me.id));
      if (!x) throw new Error('not_found');
      const other = x.woman_id === me.id ? x.man_id : x.woman_id;
      if (blockedBetween(me.id, other)) throw new Error('blocked');
      if (body.length < 1 || body.length > 1000) throw new Error('bad_length');
      const row = { id: ++db.seq, match_id: matchId, sender_id: me.id, body, flagged: U.hasMoney(body), created_at: now() };
      db.messages.push(row); save();
      if (other !== 'dw' && other !== 'dm' && !row.flagged) {
        setTimeout(() => {
          if (!db.session) return;
          db.messages.push({ id: ++db.seq, match_id: matchId, sender_id: other, body: REPLIES[Math.floor(Math.random() * REPLIES.length)], flagged: false, created_at: now() });
          save();
        }, 1600);
      }
      return Object.assign({}, row);
    },
    watchMessages(matchId, cb) {
      let last = db.messages.filter((y) => y.match_id === matchId).reduce((a, y) => Math.max(a, y.id), 0);
      const t = setInterval(() => {
        db.messages.filter((y) => y.match_id === matchId && y.id > last).forEach((y) => { last = Math.max(last, y.id); cb(Object.assign({}, y)); });
      }, 700);
      return () => clearInterval(t);
    },
    async unmatch(matchId) { const x = db.matches.find((y) => y.id === matchId); if (x) x.status = 'ended'; save(); },

    // ---- safety ---------------------------------------------------------------
    async reportContent(r) {
      await wait(); const me=need();
      db.reports.push({id:'rp'+rid(),reporter_id:me.id,reported_id:r.target,reason:r.reason,details:(`Reported ${r.type} ${r.contentId}. `+(r.details||'')).slice(0,500),status:'open',created_at:now()}); save();
    },
    async report(r) {
      await wait();
      const me = need();
      db.reports.push({ id: 'rp' + rid(), reporter_id: me.id, reported_id: r.target, reason: r.reason, details: (r.details || '').slice(0, 500), status: 'open', created_at: now() });
      if (r.block) {
        if (!db.blocks.some((b) => b.blocker === me.id && b.blocked === r.target)) db.blocks.push({ blocker: me.id, blocked: r.target });
        db.matches.forEach((x) => { if (x.status === 'active' && ((x.woman_id === me.id && x.man_id === r.target) || (x.woman_id === r.target && x.man_id === me.id))) x.status = 'ended'; });
        db.requests.forEach((x) => { if (x.status === 'pending' && ((x.from_man === me.id && x.to_woman === r.target) || (x.from_man === r.target && x.to_woman === me.id))) x.status = 'declined'; });
      }
      save();
    },

    // ---- timeline ---------------------------------------------------------------
    async feed() {
      await wait();
      const me = meRow(); if (!me || !['approved','guest','pending'].includes(me.status)) throw new Error('not_allowed');
      return db.posts.filter((p) => p.status === 'visible' && db.users[p.author_id] && db.users[p.author_id].status === 'approved' && !blockedBetween(me.id, p.author_id))
        .sort(byNew).slice(0, 60).map((p) => {
          const a = db.users[p.author_id];
          const likes = db.postLikes[p.id] || [];
          return { id: p.id, author: { id: a.id, name: a.name, age: a.age, photos: canSee(me.id, a) ? a.photos.slice(0, 1) : [], photo_hidden: !canSee(me.id, a) && a.photos.length > 0 }, body: p.body, image: p.image, likes: likes.length, liked: likes.includes(me.id), status: p.status, created_at: p.created_at, mine: p.author_id === me.id };
        });
    },
    async createPost(f) {
      await wait();
      const me = need(); const body = String(f.body || '').trim();
      if (!body && !f.blob) throw new Error('bad_length');
      if (body.length > 500) throw new Error('bad_length');
      if (U.hasContact(body)) throw new Error('contact_not_allowed');
      if (U.hasMoney(body)) throw new Error('money_not_allowed');
      const image = f.blob ? await U.blobToDataURL(f.blob) : null;
      db.posts.push({ id: 'po' + rid(), author_id: me.id, body, image, status: image ? 'pending' : 'visible', created_at: now() });
      save();
    },
    async togglePostLike(id) {
      const me = need(); const l = db.postLikes[id] = db.postLikes[id] || [];
      const i = l.indexOf(me.id); if (i >= 0) l.splice(i, 1); else l.push(me.id);
      save(); return i < 0;
    },

    // ---- subscription -----------------------------------------------------------
    async plans() { return PLANS.map((p) => Object.assign({}, p)); },
    async subscription() {
      const s = db.subs[sid()];
      return s ? { active: subActive(sid()), plan: s.plan, ends: s.current_period_end } : { active: false, plan: null, ends: null };
    },
    async pay(o) {
      need('man');
      const digits = String(o.phone || '').replace(/\D/g, '');
      if (digits.length < 10) throw new Error('bad_phone');
      const pl = PLANS.find((p) => p.code === o.plan); if (!pl) throw new Error('not_found');
      await wait(1800);
      const ref = 'SIM-' + rid().toUpperCase();
      db.payments.unshift({ id: rid(), user_id: sid(), reference: ref, plan: pl.code, amount_ghs: pl.price_ghs, network: o.network, status: 'success', created_at: now() });
      const cur = db.subs[sid()]; const base = cur && new Date(cur.current_period_end) > new Date() ? new Date(cur.current_period_end).getTime() : Date.now();
      db.subs[sid()] = { plan: pl.code, status: 'active', current_period_end: new Date(base + pl.days * DAY).toISOString() };
      save(); return { reference: ref };
    },
    async payments() {
      return db.payments.filter((p) => p.user_id === sid()).sort(byNew).map((p) => ({ reference: p.reference, plan: p.plan, amount_ghs: p.amount_ghs, network: p.network, created_at: p.created_at }));
    },

    // ---- waitlist ---------------------------------------------------------------
    async joinWaitlist(f) {
      await wait(300);
      const phone = U.normalizePhone(f.phone); if (!phone) throw new Error('bad_phone');
      if (db.waitlist.some((w) => w.phone === phone)) return { duplicate: true };
      db.waitlist.push({ id: rid(), name: String(f.name || '').trim().slice(0, 60), phone, city: f.city || 'Accra', role: f.role === 'man' ? 'man' : 'woman', invited: false, created_at: now() });
      save(); return { duplicate: false };
    },

    // ---- admin ---------------------------------------------------------------------
    admin: {
      async stats() {
        needAdmin();
        const us = Object.values(db.users).filter((u) => u.role !== 'admin');
        return {
          pending: us.filter((u) => u.status === 'pending').length,
          openReports: db.reports.filter((r) => r.status === 'open').length,
          pendingPosts: db.posts.filter((p) => p.status === 'pending').length,
          women: us.filter((u) => u.role === 'woman' && u.status === 'approved').length,
          men: us.filter((u) => u.role === 'man' && u.status === 'approved').length,
          activeSubs: Object.keys(db.subs).filter(subActive).length,
          waitlistWomen: db.waitlist.filter((w) => w.role === 'woman').length,
          waitlistMen: db.waitlist.filter((w) => w.role === 'man').length,
          revenue: db.payments.reduce((a, p) => a + Number(p.amount_ghs), 0)
        };
      },
      async queue() {
        needAdmin();
        return Object.values(db.users).filter((u) => u.status === 'pending' && u.role !== 'admin').sort((a, b) => new Date(a.created_at) - new Date(b.created_at)).map((u) => ({
          profile: Object.assign({}, u, { photos: u.photos.slice() }),
          selfie: u.selfie_path && u.selfie_path.startsWith('data:') ? u.selfie_path : null,
          idCard: null,
          hasSelfie: !!u.selfie_path, hasCard: false, photos: u.photos.slice()
        }));
      },
      async setStatus(id, status, note) {
        needAdmin();
        const u = db.users[id]; if (!u || u.role === 'admin') throw new Error('not_found');
        u.status = status; u.review_note = note || '';
        if (status === 'banned') db.matches.forEach((m) => { if (m.status === 'active' && (m.woman_id === id || m.man_id === id)) m.status = 'ended'; });
        save();
      },
      async reports(status) {
        needAdmin();
        return db.reports.filter((r) => !status || r.status === status).sort(byNew).map((r) => ({
          id: r.id, reason: r.reason, details: r.details, status: r.status, created_at: r.created_at,
          reporter: briefUser(r.reporter_id), reported: briefUser(r.reported_id),
          recent: db.messages.filter((m) => { const x = db.matches.find((y) => y.id === m.match_id); return x && (x.woman_id === r.reported_id || x.man_id === r.reported_id) && (x.woman_id === r.reporter_id || x.man_id === r.reporter_id); }).slice(-4).map((m) => ({ from: m.sender_id === r.reported_id ? 'reported' : 'reporter', body: m.body, flagged: m.flagged }))
        }));
      },
      async resolveReport(id, status) { needAdmin(); const r = db.reports.find((x) => x.id === id); if (r) r.status = status; save(); },
      async posts() {
        needAdmin();
        return db.posts.filter((p) => p.status === 'pending').sort(byNew).map((p) => ({ id: p.id, author: briefUser(p.author_id), body: p.body, image: p.image, created_at: p.created_at }));
      },
      async moderatePost(id, ok) { needAdmin(); const p = db.posts.find((x) => x.id === id); if (p) p.status = ok ? 'visible' : 'removed'; save(); },
      async users(q) {
        needAdmin(); q = (q || '').toLowerCase();
        return Object.values(db.users).filter((u) => u.role !== 'admin' && (!q || u.name.toLowerCase().includes(q) || u.city.toLowerCase().includes(q)))
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
          .map((u) => ({ id: u.id, name: u.name, age: u.age, role: u.role, city: u.city, status: u.status, featured: featuredNow(u), subscribed: subActive(u.id), created_at: u.created_at }));
      },
      async feature(id, days) { needAdmin(); const u = db.users[id]; if (u) u.featured_until = days ? ahead(DAY * days) : null; save(); },
      async payments() {
        needAdmin();
        return db.payments.slice().sort(byNew).map((p) => ({ reference: p.reference, user: briefUser(p.user_id), plan: p.plan, amount_ghs: p.amount_ghs, network: p.network, created_at: p.created_at }));
      },
      async waitlist() { needAdmin(); return db.waitlist.slice().sort(byNew).map((w) => Object.assign({}, w)); },
      async invite(id, v) { needAdmin(); const w = db.waitlist.find((x) => x.id === id); if (w) w.invited = v !== false; save(); }
    }
  };

  function briefUser(id) { const u = db.users[id]; return u ? { id, name: u.name, role: u.role, status: u.status } : { id, name: 'Deleted user', role: '', status: '' }; }
  const byNew = (a, b) => new Date(b.created_at) - new Date(a.created_at);
  const now = () => new Date().toISOString();

  window.API_DEMO = API;
})();

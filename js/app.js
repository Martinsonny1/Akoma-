// Akoma member app. Talks only to window.API (demo or Supabase).
(function () {
  'use strict';
  const U = window.AkomaUtil, API = window.API, C = window.AKOMA_CONFIG || {};
  const esc = U.esc, av = U.avatar;
  const $ = (s) => document.querySelector(s);
  const DEMO = API.mode === 'demo';
  const SIMULATED = DEMO || C.PAYMENTS_MODE !== 'paystack';

  const svg = (d, w) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w || 2}" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const ic = {
    heart: svg('<path d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2z"/>'),
    back: svg('<path d="M15 5l-7 7 7 7"/>'),
    x: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
    check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 3),
    shield: svg('<path d="M12 3l7 3v5c0 4.500-3 8-7 10-4-2-7-5.500-7-10V6z"/><path d="M9 12l2 2 4-4"/>', 2.4),
    lock: U.LOCK,
    send: svg('<path d="M4 12l16-8-6 16-2.500-6.500z"/>'),
    flag: svg('<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>'),
    warn: svg('<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17.500v.01"/>'),
    cam: svg('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.500"/>'),
    filter: svg('<path d="M4 7h16M7 12h10M10 17h4"/>'),
    t_disc: svg('<rect x="4" y="4" width="16" height="16" rx="4"/><circle cx="12" cy="10" r="2.500"/><path d="M7.500 17c1-2 2.500-3 4.500-3s3.500 1 4.500 3"/>'),
    t_time: svg('<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 9h8M8 13h8M8 17h5"/>'),
    t_likes: svg('<path d="M12 20.500s-7.500-4.600-7.500-10.200A4.300 4.300 0 0 1 12 7.600a4.300 4.300 0 0 1 7.500 2.700c0 5.600-7.500 10.200-7.500 10.200z"/>'),
    t_match: svg('<circle cx="9" cy="12" r="5"/><circle cx="15" cy="12" r="5"/>'),
    t_chat: svg('<path d="M5 5h14v10H10l-5 4z"/>')
  };
  const INTERESTS = ['Fitness', 'Travel', 'Cooking', 'Music', 'Dancing', 'Reading', 'Football', 'Hiking', 'Fashion', 'Food', 'Running', 'Church'];
  const CITIES = ['Accra', 'Tema', 'Kumasi', 'Cape Coast', 'Takoradi', 'Tamale'];
  const LOOKING = ['Friendship first', 'Dating', 'Serious relationship'];
  const NETWORKS = ['MTN MoMo', 'Telecel Cash', 'AT Money'];
  const REASONS = ['Asked for money', 'Fake profile', 'Harassment', 'Under 18', 'Something else'];
  const MAIN = ['discover', 'timeline', 'likes', 'matches', 'inbox'];
  const isW = () => S.me && S.me.role === 'woman';
  const isM = () => S.me && S.me.role === 'man';

  const freshOnb = () => ({ role: null, name: '', age: '', city: 'Accra', bio: '', interests: [], looking: 'Dating', photos: [], selfie: null, card: null, agreed: false, done: { profile: false, photos: 0, selfie: false, card: false } });
  const S = {
    screen: 'boot', hist: [], me: null, sub: null, plans: [], profiles: [], feed: [], reqs: { incoming: [], outgoing: [] },
    matches: [], msgs: [], chat: null, allowIncomingCalls: true, vault: [], ephemeral: null, recording: false, recorder: null, recordChunks: [], card: null, gal: 0, dview: 'grid', f: { min: 18, max: 99, radius: 0 },
    email: '', password: '', authMode: 'signup', step: 'email', busy: false, loading: false, onb: freshOnb(),
    draft: { text: '', blob: null, preview: null, err: '' },
    cmp: { to: null, text: '', err: '', today: 0 }, rep: { target: null, reason: REASONS[0], block: true, details: '' },
    plan: 'month', net: NETWORKS[0], momo: '', paying: false, payments: [], toast: '', confirmDel: false, unwatch: null, last: ''
  };

  // ---------------------------------------------------------------- helpers
  const bar = (title, o) => {
    o = o || {};
    return `<div class="bar">${o.noback ? '' : `<button class="icon-btn" data-act="back" aria-label="Back">${ic.back}</button>`}<h2>${title}</h2>${o.right || ''}</div>`;
  };
  const meBtn = () => `<button class="me-btn" data-go="me" aria-label="My profile">${av({ id: S.me.id, name: S.me.name, photos: S.me.photos, photo_hidden: false }, 32)}</button>`;
  const vb = () => `<span class="badge">${ic.shield.replace('<svg', '<svg style="width:12px;height:12px"')}Verified</span>`;
  const tags = (a) => `<div class="tags">${(a || []).map((t) => `<span>${esc(t)}</span>`).join('')}</div>`;
  const hiddenNote = (p) => (p.photo_hidden ? `<div class="banner">${ic.lock.replace('<svg', '<svg style="width:18px;height:18px"')}<span>${esc(p.name)} has hidden her photo. You can see it once you match.</span></div>` : '');
  const loadingBox = () => '<div class="loading">Loading…</div>';
  function toast(t) { S.toast = t; }
  const openAny = (id) => S.profiles.find((p) => p.id === id) || S.matches.map((m) => m.other).find((p) => p.id === id);
  function fileLabel(id, text, extra) {
    return `<label class="btn sm ghost" style="cursor:pointer;display:inline-flex;gap:6px;align-items:center">${ic.cam.replace('<svg', '<svg style="width:16px;height:16px"')}${text}<input id="${id}" type="file" accept="image/*" ${extra || ''}></label>`;
  }
  const shrink = (file, kind) => U.compressImage(file, DEMO ? (kind === 'verify' ? 480 : 640) : (kind === 'verify' ? 900 : 1080), DEMO ? 0.7 : 0.82);

  // ---------------------------------------------------------------- screens
  const SCREENS = {
    boot: () => loadingBox(),

    welcome: () => `<div class="splash"><div class="mark">${ic.heart}</div><div><h1>Akoma</h1></div>
      <p>Meet someone with energy. Private, verified, on your terms.</p>
      <div class="stack"><button class="btn primary" data-go="phone">Get started</button>
      ${DEMO ? `<button class="btn ghost" data-act="demo" data-id="woman">Try the demo as Efua (a woman)</button><button class="btn ghost" data-act="demo" data-id="man">Try the demo as Kofi (a man)</button>` : ''}</div>
      <small>For adults aged 18 and over.</small>
      ${DEMO ? '<small>Demo links: <a style="color:inherit" href="admin/index.html" target="_blank" rel="noopener">Admin dashboard</a> · <a style="color:inherit" href="landing.html" target="_blank" rel="noopener">Waitlist page</a></small>' : ''}</div>`,

    phone: () => `${bar('Join Akoma')}<div class="pad">
        <p class="muted">Create a free account with your email address, or sign in if you already have one. No phone number or SMS provider is required.</p>
        <div class="tags" style="gap:8px">
          <button class="chip" aria-pressed="${S.authMode === 'signup'}" data-act="authmode" data-id="signup">Create account</button>
          <button class="chip" aria-pressed="${S.authMode === 'login'}" data-act="authmode" data-id="login">Sign in</button>
        </div>
        <label class="f">Email address<input id="auth-email" type="email" autocomplete="email" placeholder="you@example.com" value="${esc(S.email)}"></label>
        <label class="f">Password<input id="auth-password" type="password" autocomplete="${S.authMode === 'signup' ? 'new-password' : 'current-password'}" minlength="8" placeholder="At least 8 characters" value="${esc(S.password)}"></label>
        <p class="muted small">${S.authMode === 'signup' ? 'Use at least 8 characters. If email confirmation is enabled, check your inbox before signing in.' : 'Enter the email and password you used when creating your account.'}</p>
        <button class="btn primary" data-act="authsubmit" ${S.busy ? 'disabled' : ''}>${S.busy ? 'Please wait…' : (S.authMode === 'signup' ? 'Create free account' : 'Sign in')}</button>
      </div>`,

    role: () => `${bar('Who are you?')}<div class="pad"><p class="muted">Choose one. This cannot be changed later.</p>
      <button class="opt" data-act="role" data-id="woman"><div class="av" style="--h:330;--s:52px"><span>W</span></div><div><b>I'm a woman</b><span class="muted small">Messages from men arrive as requests. You choose who to chat with.</span></div></button>
      <button class="opt" data-act="role" data-id="man"><div class="av" style="--h:190;--s:52px"><span>M</span></div><div><b>I'm a man</b><span class="muted small">Verified entry. Send message requests for free.</span></div></button></div>`,

    details: () => `${bar('About you')}<div class="pad">
      <label class="f">First name<input id="nm" type="text" maxlength="40" autocomplete="given-name" value="${esc(S.onb.name)}"></label>
      <label class="f">Age<input id="ag" type="number" min="1" max="99" placeholder="18 or older" value="${esc(S.onb.age)}"></label>
      <label class="f">City<select class="full" id="ct">${CITIES.map((c) => `<option${c === S.onb.city ? ' selected' : ''}>${c}</option>`).join('')}</select></label>
      <p class="err" id="derr" hidden></p><button class="btn primary" data-act="details">Continue</button></div>`,

    selfie: () => {
      const o = S.onb;
      return `${bar('Verify your identity')}<div class="pad"><p class="muted">Upload a clear photo of your government-issued ID (Ghana Card is accepted). Our team checks it privately to confirm your identity and age. It is never shown to other members.</p>
      <div class="card stack"><b>Government-issued ID</b>
        ${o.card ? `<img src="${o.card.preview}" alt="Government-issued ID preview" style="border-radius:12px;max-height:180px;object-fit:contain">` : `<div class="camera"><div>${ic.shield}Make sure your name, photo and date of birth are readable</div></div>`}
        <div class="row" style="justify-content:center">${fileLabel('idcard', o.card ? 'Replace ID photo' : 'Take or upload ID photo', 'capture="environment"')}</div>
      </div>
      <p class="muted small">Use your own valid ID. Do not upload someone else's document. Your document is stored in private storage and only authorized moderators can review it.</p>
      <button class="btn primary" data-go="terms" ${o.card ? '' : 'disabled'}>Continue</button></div>`;
    },

    terms: () => `${bar('Community rules')}<div class="pad"><div class="card stack">
      <div class="row"><span class="badge good">${ic.check}</span><span>You are 18 or older.</span></div>
      <div class="row"><span class="badge good">${ic.check}</span><span>Never ask for or send money, airtime or gifts.</span></div>
      <div class="row"><span class="badge good">${ic.check}</span><span>No paid or transactional arrangements.</span></div>
      <div class="row"><span class="badge good">${ic.check}</span><span>Be respectful. People review every report, and bans are fast.</span></div></div>
      <button class="toggle" role="checkbox" aria-checked="${S.onb.agreed}" data-act="agree"><span>I agree to the rules and the Privacy Policy</span><span class="sw"></span></button>
      <button class="btn primary" data-go="photos" ${S.onb.agreed ? '' : 'disabled'}>Agree and continue</button></div>`,

    photos: () => {
      const ph = S.onb.photos;
      return `${bar('Add photos')}<div class="pad"><p class="muted">Add at least one clear photo of your face. ${S.onb.role === 'woman' ? 'You can hide your photos from people you have not matched with in Settings.' : ''}</p>
      <div class="slots">${Array.from({ length: 6 }, (_, i) => ph[i]
        ? `<button class="slot on" style="background:url(${ph[i].preview}) center/cover" data-act="rmslot" data-id="${i}" aria-label="Remove photo ${i + 1}">${ic.x.replace('<svg', '<svg style="width:20px;height:20px;background:rgba(0,0,0,.5);border-radius:50%;padding:3px"')}</button>`
        : `<label class="slot" aria-label="Add photo">+<input id="slotfile" type="file" accept="image/*" multiple></label>`).join('')}</div>
      <button class="btn primary" data-go="bio" ${ph.length ? '' : 'disabled'}>Continue</button></div>`;
    },

    bio: () => `${bar('Bio and interests')}<div class="pad">
      <label class="f">A few lines about you<textarea id="bio" maxlength="240" placeholder="What do you enjoy? What is a good weekend?">${esc(S.onb.bio)}</textarea></label>
      <p class="err" id="bioerr" hidden></p>
      <div class="stack"><b class="small">Interests</b><div class="tags" style="gap:8px">${INTERESTS.map((i) => `<button class="chip" aria-pressed="${S.onb.interests.includes(i)}" data-act="chip" data-id="${i}">${i}</button>`).join('')}</div></div>
      <button class="btn primary" data-act="biosave">Continue</button></div>`,

    prefs: () => `${bar('What you are looking for')}<div class="pad">
      <div class="stack"><b class="small">Looking for</b><div class="tags" style="gap:8px">${LOOKING.map((w) => `<button class="chip" aria-pressed="${S.onb.looking === w}" data-act="want" data-id="${w}">${w}</button>`).join('')}</div></div>
      <div class="stack"><b class="small">${S.onb.role === 'woman' ? 'Men aged' : 'Women aged'}</b><div class="row"><input id="pmin" type="number" min="18" max="80" value="${S.f.min === 18 && S.f.max === 99 ? (S.onb.role === 'woman' ? 22 : 30) : S.f.min}"><span class="muted">to</span><input id="pmax" type="number" min="18" max="80" value="${S.f.min === 18 && S.f.max === 99 ? (S.onb.role === 'woman' ? 40 : 55) : S.f.max}"></div></div>
      <button class="btn primary" data-act="finish" ${S.busy ? 'disabled' : ''}>${S.busy ? 'Saving your profile…' : 'Finish setup'}</button></div>`,

    status: () => {
      const m = S.me, st = m.status;
      if (st === 'banned') return `${bar('Account suspended', { noback: true })}<div class="pad"><div class="banner">${ic.warn}<span>This account was removed for breaking the community rules. Contact support if you think this is a mistake.</span></div><button class="btn ghost" data-act="signout">Sign out</button></div>`;
      const idReceived = !!m.id_card_path;
      const rejected = st === 'rejected';
      return `${bar('Your Akoma welcome', { noback: true })}<div class="pad">
        <div class="card stack" style="text-align:center;align-items:center;padding:24px 18px">
          <div class="mark" style="width:54px;height:54px">${ic.heart}</div>
          <h2 style="margin:0">You're almost there${m.name ? ', ' + esc(m.name) : ''} ❤️</h2>
          <p class="muted">Your Akoma account is ready. While we review your ID, you can get familiar with how the community works.</p>
          <span class="badge ${rejected ? 'bad' : 'warn'}">${rejected ? 'Changes needed' : 'Verification pending'}</span>
        </div>
        <div class="card stack"><b>Your verification progress</b>
          <div class="step done"><i>${ic.check}</i><div><b>Account created</b><p class="muted small">${esc((API.session() || {}).email || '')}</p></div></div>
          <div class="step ${idReceived ? 'done' : 'wait'}"><i>${idReceived ? ic.check : '2'}</i><div><b>Government-issued ID</b><p class="muted small">${idReceived ? 'Received securely. Only authorized moderators can review it.' : 'Upload a clear photo of your Ghana Card or another accepted government ID.'}</p></div></div>
          <div class="step wait"><i>3</i><div><b>Manual review</b><p class="muted small">Our team checks your ID and profile. We aim to review submissions within 24 hours, although some reviews may take longer.</p></div></div>
        </div>
        ${!idReceived || rejected ? `<div class="card stack"><b>${rejected ? 'Resubmit your ID' : 'Complete your verification'}</b>${m.review_note ? `<p class="small muted">Reviewer note: ${esc(m.review_note)}</p>` : ''}<p class="muted small">Take a clear, readable photo with all four corners visible.</p>${fileLabel('pending-id', 'Upload or replace ID photo', 'capture="environment"')}</div>` : ''}
        <div class="card stack"><b>Explore Akoma while you wait</b><p class="muted small">You can preview what becomes available after approval. Real member profiles and interactions remain protected until verification is complete.</p>
          <div class="row"><span class="badge">${ic.heart} Discover</span><span class="muted small">Meet verified members</span></div>
          <div class="row"><span class="badge">${ic.t_chat} Chats</span><span class="muted small">Start meaningful conversations</span></div>
          <div class="row"><span class="badge">${ic.cam} Calls</span><span class="muted small">Voice and video with matches</span></div>
          <div class="row"><span class="badge">${ic.lock} The Vault</span><span class="muted small">Share private photos with control</span></div>
        </div>
        <button class="btn primary" data-act="refresh">${S.busy ? 'Checking…' : 'Check verification status'}</button>
        <p class="muted small" style="text-align:center">We'll check for approval automatically while this screen is open. Please don't create another account while you wait.</p>
        <button class="btn ghost" data-act="signout">Sign out</button></div>`;
    },

    adminhint: () => `${bar('Admin account', { noback: true })}<div class="pad"><div class="banner">${ic.shield}<span>You are signed in as an admin. Moderation lives in the admin dashboard.</span></div>
      <a class="btn primary" href="admin/index.html" style="display:block;text-decoration:none">Open the admin dashboard</a><button class="btn ghost" data-act="signout">Sign out</button></div>`,

    discover: () => {
      const grid = true;
      const head = bar('Discover', { noback: true, right: `<button class="icon-btn" data-go="filters" aria-label="Filters">${ic.filter}</button>${meBtn()}` });
      if (S.loading && !S.profiles.length) return head + loadingBox();
      const list = S.profiles.filter((p) => grid || !(p.passed || p.is_match || p.request_sent));
      if (!list.length) return `${head}<div class="pad"><div class="card stack"><b>No one new right now</b><p class="muted">Widen your filters or check back later. New verified people are added daily.</p><button class="btn sm" data-go="filters">Change filters</button></div></div>`;
      if (grid) {
        return `${head}<div class="discover-grid-wrap"><div class="pgrid">${list.map((p) => {
          const isNew = p.created_at && (Date.now() - new Date(p.created_at).getTime()) < 7 * 86400000;
          const photo = av(p, 260, true);
          return `<button class="pcell ak-profile-tile" data-act="open" data-id="${p.id}" aria-label="View ${esc(p.name)}, age ${p.age}">
            <div class="ak-tile-photo">${photo}
              <div class="ak-tile-shade"></div>
              <div class="ak-tile-top">${p.subscribed ? '<span class="ak-tile-pill premium">★ PREMIUM</span>' : ''}${isNew ? '<span class="ak-tile-pill fresh">✦ NEW</span>' : ''}${p.looking_tonight ? '<span class="ak-tile-pill tonight">LOOKING TONIGHT</span>' : ''}</div>
              ${p.featured ? '<span class="ak-tile-featured">✦ FEATURED</span>' : ''}
              <div class="ak-tile-caption">
                ${p.activity_label ? `<div class="ak-tile-presence ${p.activity_label === 'Online now' ? 'is-online' : 'is-away'}"><span class="ak-presence-dot"></span>${esc(p.activity_label)}</div>` : ''}
                <div class="ak-tile-name">${esc(p.name)}, ${p.age}${p.status === 'approved' ? '<span class="ak-verified" aria-label="Verified">✓</span>' : ''}</div>
                ${(p.interests || []).length ? `<div class="ak-tile-interests" aria-label="Interests">${p.interests.slice(0,3).map(i => `<span class="ak-interest-chip">${esc(i)}</span>`).join('')}${p.interests.length > 3 ? `<span class="ak-interest-more">+${p.interests.length - 3}</span>` : ''}</div>` : ''}
                ${p.looking_for ? `<div class="ak-tile-looking"><span class="ak-tile-meta-label">Looking for</span>${esc(p.looking_for)}</div>` : ''}
                <div class="ak-tile-location"><span aria-hidden="true">📍</span> ${esc(p.city || 'Ghana')}${p.distance_band ? ' · '+esc(p.distance_band) : ''}</div>
              </div>
            </div>
          </button>`;
        }).join('')}</div></div>`;
      }
      const p = list[0];
      return `${head}<div class="deck"><div class="pcard" data-act="open" data-id="${p.id}"><div class="hero">${av(p, 190, true)}</div>
        <div><div class="row wrap" style="gap:8px"><h3>${esc(p.name)}, ${p.age}</h3>${vb()}${p.featured ? '<span class="badge gold">Featured</span>' : ''}</div><p class="muted small">${esc(p.city)}${p.distance_band ? ' · '+esc(p.distance_band)+' away' : ''}${p.activity_label ? ' · '+esc(p.activity_label) : ''}</p></div>
        ${hiddenNote(p)}<p>${esc(p.bio)}</p>${tags(p.interests)}</div>
        <div class="acts"><button class="round" data-act="pass" data-id="${p.id}" aria-label="Pass">${ic.x}</button><button class="round like" data-act="like" data-id="${p.id}" aria-label="${isW() ? 'Like' : 'Send message request'}">${ic.heart}</button></div>
        <p class="muted small" style="text-align:center">${isW() ? 'When you like someone, a chat opens. Men can also send free message requests.' : 'Send a free message request. She decides whether to reply.'}</p></div>`;
    },

    timeline: () => {
      const d = S.draft;
      const feat = S.profiles.filter((p) => p.featured).slice(0, 8);
      const posts = S.feed.map((p) => {
        const a = p.author;
        const img = p.image ? (typeof p.image === 'string' ? `<div class="pimg"><img src="${esc(p.image)}" alt="Photo shared by ${esc(a.name)}"></div>` : `<div class="pimg g" style="--h:${p.image.h}"><span>${esc(p.image.label)}</span></div>`) : '';
        return `<div class="post"><div class="row">${p.mine ? av(a, 40) : `<button class="item" style="padding:0;width:auto" data-act="open" data-id="${a.id}" aria-label="View ${esc(a.name)}">${av(a, 40)}</button>`}
          <div class="grow"><b>${esc(a.name)}</b> ${vb()}<span class="muted small" style="display:block">${U.timeAgo(p.created_at)}${p.status === 'pending' ? ' · Waiting for review' : ''}</span></div>
          ${p.mine ? '' : `<button class="icon-btn" data-act="reportopen" data-id="${a.id}" aria-label="Report this post">${ic.flag}</button>`}</div>
          ${p.body ? `<p>${esc(p.body)}</p>` : ''}${img}
          <div class="row"><button class="chip" aria-pressed="${p.liked}" data-act="plike" data-id="${p.id}">${ic.heart.replace('<svg', '<svg style="width:14px;height:14px;vertical-align:-2px;margin-right:5px"')}${p.likes}</button></div></div>`;
      }).join('');
      return `${bar('Timeline', { noback: true, right: meBtn() })}<div class="pad" style="padding-top:8px">
        <div class="compose"><textarea id="ptxt" maxlength="500" placeholder="Share something with the community">${esc(d.text)}</textarea>
          ${d.preview ? `<div class="attach"><img src="${d.preview}" alt="Photo to post"><button class="icon-btn" data-act="rmimg" aria-label="Remove photo">${ic.x}</button></div>` : ''}
          ${d.err ? `<p class="err">${esc(d.err)}</p>` : ''}
          <div class="row" style="justify-content:space-between">${fileLabel('pimg', d.preview ? 'Change photo' : 'Add photo')}<button class="btn sm primary" data-act="post" ${S.busy ? 'disabled' : ''}>Post</button></div>
          <p class="muted small">Photos are checked by a moderator before they appear.</p></div>
        ${feat.length ? `<div class="stack"><div class="row" style="justify-content:space-between"><h3>Featured</h3><span class="muted small">Swipe to see more</span></div><div class="hscroll">${feat.map((p) => `<button class="fcard" data-act="open" data-id="${p.id}">${av(p, 68)}<b>${esc(p.name)}, ${p.age}</b><span class="badge gold">Featured</span></button>`).join('')}</div></div>` : ''}
        <div class="stack"><h3>Posts</h3>${S.loading && !S.feed.length ? loadingBox() : posts || '<div class="card"><b>No posts yet</b><p class="muted small">Be the first to share something.</p></div>'}</div></div>`;
    },

    profile: () => {
      const p = S.card; if (!p) return loadingBox();
      const photos = p.photos || [];
      const main = photos[S.gal] || photos[0];
      const act = p.is_match ? `<button class="btn primary" data-act="openchat" data-id="${p.id}">Open chat</button><button class="btn ghost" data-act="unmatch" data-id="${p.id}">Unmatch</button>`
        : isW() ? `<button class="btn gold" data-act="like" data-id="${p.id}">Like and open chat</button>`
          : p.request_sent ? '<button class="btn" disabled>Request sent. Waiting for her reply</button>'
            : `<button class="btn gold" data-act="like" data-id="${p.id}">Send message request</button>`;
      return `${bar(esc(p.name), { right: `<button class="icon-btn" data-act="reportopen" data-id="${p.id}" aria-label="Block or report">${ic.flag}</button>` })}<div class="pad">
        <div style="display:flex;justify-content:center">${main ? `<img src="${esc(main)}" alt="${esc(p.name)}" style="width:100%;max-height:340px;object-fit:cover;border-radius:22px">` : av(p, 190, true)}</div>
        ${photos.length > 1 ? `<div class="row" style="justify-content:center">${photos.map((u, i) => `<button class="icon-btn" style="width:46px;height:46px;border-radius:12px;overflow:hidden;padding:0;${i === S.gal ? 'outline:2px solid var(--brand)' : ''}" data-act="gal" data-id="${i}" aria-label="Photo ${i + 1}"><img src="${esc(u)}" alt="" style="width:100%;height:100%;object-fit:cover"></button>`).join('')}</div>` : ''}
        <div><div class="row wrap" style="gap:8px"><h3 style="font-size:22px">${esc(p.name)}, ${p.age}</h3>${vb()}</div><p class="muted small">${esc(p.city)}${p.distance_band ? ' · '+esc(p.distance_band)+' away' : ''}${p.activity_label ? ' · '+esc(p.activity_label) : ''}</p></div>
        ${hiddenNote(p)}
        <div class="stack"><b class="small muted">About</b><p>${esc(p.bio || 'No bio yet.')}</p></div>
        <div class="stack"><b class="small muted">Interests</b>${tags(p.interests)}</div>
        <div class="stack"><b class="small muted">Looking for</b><p>${esc(p.looking_for)}</p></div>
        ${act}<button class="btn danger" data-act="reportopen" data-id="${p.id}">Block or report</button></div>`;
    },

    compose: () => {
      const p = S.cmp.to; if (!p) return loadingBox();
      return `${bar('Message request')}<div class="pad"><div class="row" style="gap:14px">${av(p, 56)}<div class="grow"><b>${esc(p.name)}, ${p.age}</b><span class="muted small" style="display:block">${esc(p.city)}</span></div></div>
        <div class="banner">${ic.shield}<span>You can send one message. She decides whether to reply. You cannot send another until she does.</span></div>
        <label class="f">Your message<textarea id="rmsg" maxlength="200" placeholder="Say something specific about her profile">${esc(S.cmp.text)}</textarea></label>
        <p class="muted small" id="rc">${S.cmp.text.length}/200 · Free to send</p>
        <p class="err" id="rerr" ${S.cmp.err ? '' : 'hidden'}>${esc(S.cmp.err)}</p>
        <button class="btn gold" data-act="sendreq" ${!S.busy ? '' : 'disabled'}>${S.busy ? 'Sending…' : 'Send request'}</button>
        <p class="muted small">Phone numbers, links and requests for money or airtime are blocked in a first message.</p></div>`;
    },

    filters: () => `${bar('Filters')}<div class="pad"><div class="stack"><b class="small">${isW() ? 'Men aged' : 'Women aged'}</b><div class="row"><input id="fmin" type="number" min="18" max="99" value="${S.f.min}"><span class="muted">to</span><input id="fmax" type="number" min="18" max="99" value="${S.f.max}"></div></div>
      <div class="stack"><b class="small">Distance</b><select id="fradius" class="full"><option value="0"${!S.f.radius?' selected':''}>Any distance</option><option value="1"${S.f.radius===1?' selected':''}>Within 1 km</option><option value="5"${S.f.radius===5?' selected':''}>Within 5 km</option><option value="10"${S.f.radius===10?' selected':''}>Within 10 km</option></select><p class="muted small">Distance filters work only when both people enable nearby sharing.</p></div>
      <button class="btn primary" data-act="applyf">Apply</button><button class="btn ghost" data-act="resetf">Reset</button></div>`,

    likes: () => {
      if (isW()) {
        const r = S.reqs.incoming;
        return `${bar('Requests', { noback: true, right: meBtn() })}<div class="pad"><p class="muted small">Verified men can send free message requests. A chat opens only if you accept.</p>
          ${S.loading && !r.length ? loadingBox() : r.length ? r.map((q) => `<div class="card stack"><div class="row">${av(q.from, 48)}<div class="grow"><b>${esc(q.from.name)}, ${q.from.age}</b><span class="muted small" style="display:block">${esc(q.from.city)} · ${U.timeAgo(q.created_at)}</span></div><button class="icon-btn" data-act="reportopen" data-id="${q.from.id}" aria-label="Report">${ic.flag}</button></div>
            <p>&ldquo;${esc(q.body)}&rdquo;</p><div class="row"><button class="btn sm grow" data-act="decline" data-id="${q.id}">Pass</button><button class="btn sm gold grow" data-act="accept" data-id="${q.id}">Accept and chat</button></div></div>`).join('')
            : '<div class="card"><b>All caught up</b><p class="muted small">New requests show up here.</p></div>'}</div>`;
      }
      const r = S.reqs.outgoing;
      return `${bar('Requests sent', { noback: true, right: meBtn() })}<div class="pad"><p class="muted small">Akoma is free. You can send one initial request to each woman; if she accepts and replies, you can chat freely.</p>
        ${S.loading && !r.length ? loadingBox() : r.length ? r.map((q) => `<button class="card stack" style="border:0;text-align:left;cursor:pointer;width:100%" data-act="open" data-id="${q.to.id}"><div class="row">${av(q.to, 44)}<div class="grow"><b>${esc(q.to.name)}, ${q.to.age}</b><span class="muted small" style="display:block">${esc(q.to.city)}</span></div>
          <span class="badge ${q.status === 'accepted' ? 'good' : q.status === 'declined' ? '' : 'warn'}">${q.status === 'accepted' ? 'Accepted' : q.status === 'declined' ? 'Declined' : 'Waiting for her reply'}</span></div><p class="small">&ldquo;${esc(q.body)}&rdquo;</p></button>`).join('')
          : '<div class="card"><b>Nothing sent yet</b><p class="muted small">Find someone in Discover.</p></div>'}</div>`;
    },

    matches: () => `${bar('Matches', { noback: true, right: meBtn() })}<div class="pad">${S.loading && !S.matches.length ? loadingBox() : S.matches.length
      ? `<div class="slots" style="grid-template-columns:repeat(2,minmax(0,1fr))">${S.matches.map((m) => `<button class="card stack" style="align-items:center;border:0;cursor:pointer" data-act="openchat" data-id="${m.id}">${av(m.other, 84)}<b>${esc(m.other.name)}, ${m.other.age}</b><span class="muted small">${esc(m.other.city)}</span></button>`).join('')}</div>`
      : `<div class="card"><b>No matches yet</b><p class="muted small">${isW() ? 'Like someone in Discover or accept a request.' : 'When a woman replies, she appears here.'}</p></div>`}</div>`,

    inbox: () => `${bar('Chats', { noback: true, right: `<button class="icon-btn" data-act="callhistory" aria-label="Call history">◷</button>${meBtn()}` })}<div class="pad" style="padding-top:6px">${S.loading && !S.matches.length ? loadingBox() : S.matches.length
      ? `<div class="list">${S.matches.map((m) => `<button class="item" data-act="openchat" data-id="${m.id}">${av(m.other, 50)}<div class="grow"><b>${esc(m.other.name)}</b><span class="muted small" style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${m.last_body ? esc(m.last_body) : 'Say hello'}</span></div>${m.flagged ? '<span class="badge warn">Flagged</span>' : ''}</button>`).join('')}</div>`
      : '<div class="card"><b>No chats yet</b></div>'}</div>`,

    callhistory: () => `${bar('Call history', { right: meBtn() })}<div class="pad"><div class="list">${(S.callHistory || []).map(c => `<div class="item"><div class="grow"><b>${esc(c.name)}</b><span class="muted small" style="display:block">${c.type === 'video' ? 'Video call' : 'Voice call'} · ${esc(c.status)} · ${new Date(c.created_at).toLocaleString()}</span></div><span class="muted small">${c.seconds ? Math.floor(c.seconds/60)+':'+String(c.seconds%60).padStart(2,'0') : c.missed ? 'Missed' : ''}</span></div>`).join('') || '<div class="card"><b>No calls yet</b><p class="muted small">Your voice and video calls will appear here.</p></div>'}</div></div>`,

    chat: () => {
      const c = S.chat; if (!c) return loadingBox();
      return `<div class="chat">${bar(esc(c.other.name), { right: `<button class="icon-btn call-head-btn" data-ak-call="audio" aria-label="Voice call" title="Voice call">☎</button><button class="icon-btn call-head-btn" data-ak-call="video" aria-label="Video call" title="Video call">▣</button><button class="icon-btn" data-act="reportopen" data-id="${c.other.id}" aria-label="Block or report">${ic.flag}</button>` })}
        <div class="msgs" id="msgs"></div>
        <div class="media-options"><select id="media-mode" aria-label="Media privacy"><option value="normal">Keep in chat</option><option value="view_once">Close to destroy (view once)</option><option value="timed:10">10 seconds</option><option value="timed:30">30 seconds</option><option value="timed:60">1 minute</option><option value="timed:3600">1 hour</option><option value="timed:86400">24 hours</option><option value="timed:604800">7 days</option></select><span class="muted tiny">Media privacy</span></div>
        <div class="composer"><label class="icon-btn attach" aria-label="Attach photo or video">＋<input id="chatfile" type="file" multiple accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"></label><label class="icon-btn attach" aria-label="Take a photo">${ic.cam}<input id="chatcamera" type="file" accept="image/*" capture="environment"></label><button class="icon-btn voice-btn" data-act="voice" aria-label="Record voice note">${S.recording ? '■' : '🎙'}</button><input id="msg" type="text" maxlength="1000" placeholder="Write a message" autocomplete="off"><button class="icon-btn" style="background:var(--brand);color:var(--on-brand);border:0" data-act="send" aria-label="Send">${ic.send}</button></div><p class="media-note">Only chat matches can send media. Photos up to 8 MB · Videos up to 20 MB · Voice notes up to 2 minutes.</p></div>`;
    },

    vault: () => `${bar('Private Vault')}<div class="pad"><div class="banner">${ic.lock}<span>Your Vault is private. Only matches you explicitly authorize can view a photo, for the time you choose. A recipient may still capture anything displayed.</span></div><label class="btn primary" style="display:inline-flex;align-items:center;gap:8px">＋ Add private photos<input id="vaultfile" type="file" accept="image/jpeg,image/png,image/webp" multiple hidden></label><p class="muted small">JPEG, PNG or WebP · 8 MB maximum per image</p><div class="list">${(S.vault||[]).map(a=>`<div class="card stack"><div class="row" style="gap:12px">${a.preview ? `<img src="${a.preview}" style="width:76px;height:76px;object-fit:cover;border-radius:12px">` : '<div class="vault-blur">🔒</div>'}<div class="grow"><b>${a.owned?'Your private photo':'Shared private photo'}</b><span class="muted small" style="display:block">${a.owned?(a.grant_id&&!a.revoked_at&&new Date(a.expires_at)>new Date()?'Access granted until '+new Date(a.expires_at).toLocaleTimeString():'Locked by default'):'Access expires '+new Date(a.expires_at).toLocaleTimeString()}</span></div></div>${a.owned?`<div class="row wrap"><select id="vault-match-${a.id}" class="grow">${S.matches.map(m=>`<option value="${m.id}">${esc(m.other.name)}</option>`).join('')}</select><select id="vault-duration-${a.id}"><option value="5">5 min</option><option value="15" selected>15 min</option><option value="30">30 min</option><option value="60">1 hour</option><option value="1440">24 hours</option></select><button class="btn sm primary" data-act="vaultgrant" data-id="${a.id}" ${S.matches.length?'':'disabled'}>Grant access</button><button class="btn sm danger" data-act="vaultdelete" data-id="${a.id}">Delete</button></div>${a.grant_id&&!a.revoked_at&&new Date(a.expires_at)>new Date()?`<button class="btn sm ghost" data-act="vaultrevoke" data-id="${a.grant_id}">Revoke current access</button>`:''}`:''}</div>`).join('')||'<div class="card"><b>Your Vault is empty</b><p class="muted small">Add a private photo to get started.</p></div>'}</div></div>`,

    report: () => {
      const p = openAny(S.rep.target) || { name: 'this person' };
      return `${bar('Block or report')}<div class="pad"><p class="muted">Tell us what happened with ${esc(p.name)}. A person reviews every report.</p>
        <div class="list">${REASONS.map((r) => `<button class="toggle" role="radio" aria-checked="${S.rep.reason === r}" data-act="reason" data-id="${r}"><span>${r}</span><span class="sw"></span></button>`).join('')}</div>
        <label class="f">Details (optional)<textarea id="rdet" maxlength="500">${esc(S.rep.details)}</textarea></label>
        <button class="toggle" role="switch" aria-checked="${S.rep.block}" data-act="blockt"><span>Also block ${esc(p.name)}</span><span class="sw"></span></button>
        <button class="btn danger" data-act="submitreport" ${S.busy ? 'disabled' : ''}>Submit report</button></div>`;
    },

    tips: () => `${bar('Stay safe')}<div class="pad"><div class="banner">${ic.warn}<span>Romance scams are the biggest risk on any dating app. These rules protect you.</span></div><div class="list">
      ${[['Never send money, airtime or gifts', 'Not for emergencies, school fees, customs fees or investments. Report anyone who asks.'], ['Meet in a public place first', 'Tell a friend where you are going and share your live location.'], ['Keep chatting on Akoma at first', 'Move to WhatsApp only when you feel comfortable.'], ['Check the verified badge', 'A badge means a real face and an ID were checked. It is not a guarantee of character.'], ['Trust your instincts', 'If someone rushes you, pressures you or avoids a call, step back and report.']]
        .map((t) => `<div class="stack" style="padding:12px 0;gap:4px"><b>${t[0]}</b><p class="muted small">${t[1]}</p></div>`).join('')}</div></div>`,

    me: () => {
      const m = S.me;
      return `${bar('My profile')}<div class="pad"><div class="row" style="gap:16px">${av({ id: m.id, name: m.name, photos: m.photos, photo_hidden: false }, 76)}
        <div class="grow"><h3 style="font-size:22px">${esc(m.name)}, ${m.age}</h3><p class="muted small">${esc(m.city)}</p><div style="margin-top:6px">${vb()}</div></div></div>
        ${m.bio ? `<p>${esc(m.bio)}</p>` : ''}
        ${isM() ? `<div class="subcard free-access"><div class="row" style="justify-content:space-between"><h3>Akoma access</h3><span class="badge good">Free</span></div>
          <p class="small">All members can discover profiles, send message requests and chat without subscriptions or hidden charges.</p></div>` : ''}
        <div class="list"><button class="item" data-go="edit"><span class="grow"><b>Edit profile and photos</b></span></button>
          <button class="item" data-go="vault"><span class="grow"><b>Private Vault</b><span class="muted small" style="display:block">Share private photos with selected matches</span></span><span>›</span></button>
          <div class="card stack"><div class="row" style="justify-content:space-between"><b>Looking Tonight</b><span class="badge tonight-badge">✦ Beacon</span></div><p class="muted small">Let people in your city know you're open to chatting or meeting. This turns off automatically.</p>${m.looking_tonight_until&&new Date(m.looking_tonight_until)>new Date()?`<p class="small">Active until ${new Date(m.looking_tonight_until).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</p>`:''}<label class="f">I'm open to<select id="tonight-mode"><option value="either"${m.looking_tonight_mode==='either'?' selected':''}>Chatting or meeting</option><option value="chat"${m.looking_tonight_mode==='chat'?' selected':''}>Chatting</option><option value="meet"${m.looking_tonight_mode==='meet'?' selected':''}>Meeting</option></select></label><label class="f">Duration<select id="tonight-hours"><option value="4">4 hours</option><option value="6">6 hours</option></select></label><button class="btn primary" data-act="tonight-on">${m.looking_tonight_until&&new Date(m.looking_tonight_until)>new Date()?'Renew Looking Tonight':'Activate Looking Tonight'}</button><button class="btn ghost" data-act="tonight-off">Turn off beacon</button></div>
          <button class="item" data-go="settings"><span class="grow"><b>Settings and privacy</b></span></button>
          <button class="item" data-go="tips"><span class="grow"><b>Safety tips</b></span></button>
          <button class="item" data-go="help"><span class="grow"><b>Help and contact</b></span></button></div></div>`;
    },

    edit: () => {
      const m = S.me;
      return `${bar('Edit profile')}<div class="pad">
        <div class="slots">${Array.from({ length: 6 }, (_, i) => m.photos[i]
          ? `<button class="slot on" style="background:url(${m.photos[i]}) center/cover" data-act="rmphoto" data-id="${i}" aria-label="Remove photo ${i + 1}">${ic.x.replace('<svg', '<svg style="width:20px;height:20px;background:rgba(0,0,0,.5);border-radius:50%;padding:3px"')}</button>`
          : `<label class="slot" aria-label="Add photo">+<input id="editphoto" type="file" accept="image/*" multiple></label>`).join('')}</div>
        <label class="f">City<select class="full" id="ect">${CITIES.map((c) => `<option${c === m.city ? ' selected' : ''}>${c}</option>`).join('')}</select></label>
        <label class="f">Bio<textarea id="ebio" maxlength="240">${esc(m.bio)}</textarea></label>
        <p class="err" id="eerr" hidden></p>
        <div class="stack"><b class="small">Interests</b><div class="tags" style="gap:8px">${INTERESTS.map((i) => `<button class="chip" aria-pressed="${(S.editInterests || m.interests).includes(i)}" data-act="echip" data-id="${i}">${i}</button>`).join('')}</div></div>
        <div class="stack"><b class="small">Looking for</b><div class="tags" style="gap:8px">${LOOKING.map((w) => `<button class="chip" aria-pressed="${(S.editLooking || m.looking_for) === w}" data-act="ewant" data-id="${w}">${w}</button>`).join('')}</div></div>
        <button class="btn primary" data-act="editsave" ${S.busy ? 'disabled' : ''}>Save changes</button></div>`;
    },

    settings: () => {
      const m = S.me;
      const tg = (k, title, sub) => `<button class="toggle" role="switch" aria-checked="${!!m[k]}" data-act="set" data-id="${k}"><span><b>${title}</b>${sub ? `<span class="muted small" style="display:block">${sub}</span>` : ''}</span><span class="sw"></span></button>`;
      return `${bar('Settings')}<div class="pad"><div class="list">
        ${isW() ? tg('hide_photo', 'Hide my profile photo', 'Only people you match with can see it') : ''}
        ${tg('hide_from_contacts', 'Hide me from my phone contacts')}${tg('notifications', 'Notifications')}
        ${tg('online_visible', 'Show my online status', 'Optional and equal for men and women. When off, you also cannot see other members’ activity.')}
        ${!DEMO ? `<button class="toggle" role="switch" aria-checked="${S.allowIncomingCalls}" data-act="callsetting"><span><b>Allow incoming calls</b><span class="muted small" style="display:block">Turn off voice and video call invitations</span></span><span class="sw"></span></button>` : ''}
        <div class="card stack"><b>Nearby users</b><p class="muted small">Optional. If you enable this, Akoma stores an approximate location rounded to about 500 metres. Other members never receive your coordinates or see a map—only a broad distance band, and only when both of you enable nearby sharing. This setting works the same for men and women.</p>
          <div class="row wrap"><span class="muted small">${m.location_enabled ? 'Location sharing is on' : 'Location sharing is off'}</span>
          <button class="btn sm ${m.location_enabled ? 'ghost' : 'primary'}" data-act="${m.location_enabled ? 'locationoff' : 'locationon'}">${m.location_enabled ? 'Turn off' : 'Enable nearby'}</button></div>
        </div></div>
        <button class="btn ghost" data-act="signout">Sign out</button>
        ${DEMO ? '<button class="btn ghost" data-act="demoreset">Reset demo data</button>' : ''}
        ${S.confirmDel ? `<div class="card stack"><b>Delete your account?</b><p class="muted small">Your profile, photos and chats are removed. This cannot be undone.</p><div class="row"><button class="btn sm grow" data-act="delno">Keep my account</button><button class="btn sm danger grow" data-act="delyes">Delete</button></div></div>` : '<button class="btn danger" data-act="del">Delete my account</button>'}</div>`;
    },

    plans: () => `${bar('Free for everyone')}<div class="pad"><div class="card stack free-access"><span class="badge good">Always free</span><h3>No subscriptions. No payment required.</h3><p class="muted">Every Akoma member gets access to discovery, message requests and chats at no cost.</p><button class="btn primary" data-act="tabto" data-id="discover">Explore Akoma</button></div></div>`,

    receipt: () => `${bar('Payments')}<div class="pad">${S.sub && S.sub.active ? `<div class="card stack" style="align-items:center;text-align:center"><span class="badge good" style="padding:10px">${ic.check}</span><h3>Subscription active</h3><p class="muted small">Until ${new Date(S.sub.ends).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}</p></div>` : ''}
      <div class="stack"><b>Payment history</b>${S.payments.length ? `<div class="list">${S.payments.map((r) => `<div class="row" style="padding:10px 0;justify-content:space-between"><span>${esc(r.plan === 'week' ? 'Weekly' : 'Monthly')} <span class="muted small">· ${esc(r.network || '')} · ${new Date(r.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span></span><b>${U.money(r.amount_ghs)}</b></div>`).join('')}</div>` : '<p class="muted small">No payments yet.</p>'}</div>
      <button class="btn primary" data-act="tabto" data-id="discover">Back to Discover</button></div>`,

    help: () => `${bar('Help and contact')}<div class="pad"><div>
      <details><summary>How does verification work?</summary><p>Everyone submits a government-issued ID, such as a Ghana Card. A moderator reviews it privately before approving the account.</p></details>
      <details><summary>Can men message me first?</summary><p>Verified men can send a free message request. It arrives as a request. You choose whether to open a chat, and he cannot send another initial request unless you reply.</p></details>
      <details><summary>Someone asked me for money</summary><p>Do not send anything. Tap the flag in the chat to report them. We remove scammers quickly.</p></details>
      <details><summary>Who can see my photos?</summary><p>Everyone can see them unless you hide your profile photo in Settings. Then only people you have matched with can.</p></details>
      <details><summary>How do I delete my account?</summary><p>Go to Settings and choose Delete my account.</p></details></div>
      <div class="card stack"><b>Contact support</b>${C.SUPPORT_WHATSAPP || C.SUPPORT_EMAIL ? `<p class="small">${C.SUPPORT_WHATSAPP ? 'WhatsApp: ' + esc(C.SUPPORT_WHATSAPP) : ''}${C.SUPPORT_WHATSAPP && C.SUPPORT_EMAIL ? '<br>' : ''}${C.SUPPORT_EMAIL ? 'Email: ' + esc(C.SUPPORT_EMAIL) : ''}</p>` : '<p class="muted small">Add your support WhatsApp number and email in js/config.js.</p>'}</div></div>`
  };

  // ---------------------------------------------------------------- loaders
  const LOAD = {
    async discover() { S.profiles = await API.profiles(S.f); },
    async timeline() { const [f, p] = await Promise.all([API.feed(), API.profiles({})]); S.feed = f; S.profiles = p; },
    async likes() { S.reqs = await API.requests(); },
    async matches() { S.matches = await API.matches(); },
    async inbox() { S.matches = await API.matches(); },
    async callhistory() { S.callHistory = await API.callHistory(); },
    async settings() { if (!DEMO) S.allowIncomingCalls = await API.callSettings(); },
    async me() { S.me = await API.me(); },
    async edit() { S.me = await API.me(); S.editInterests = null; S.editLooking = null; },
    async vault() { S.matches = await API.matches(); S.vault = await API.vaultAssets(); for (const a of S.vault) { if (a.storage_path) { try { a.preview = await API.vaultImage(a.storage_path); } catch (_) {} } } },
    async plans() { [S.plans, S.sub] = await Promise.all([API.plans(), API.subscription()]); },
    async receipt() { [S.payments, S.sub] = await Promise.all([API.payments(), API.subscription()]); },
    async compose() {}
  };

  // ---------------------------------------------------------------- navigation
  function render() {
    const st = $('#screen').scrollTop;
    $('#screen').innerHTML = SCREENS[S.screen]();
    const showTabs = S.me && S.me.status === 'approved' && MAIN.includes(S.screen);
    $('#tabs').hidden = !showTabs;
    if (showTabs) {
      const tabs = [['discover', 'Discover', 'tdisc'], ['timeline', 'Timeline', 'ttime'], ['likes', isW() ? 'Requests' : 'Sent', 'tlikes'], ['matches', 'Matches', 'tmatch'], ['inbox', 'Chats', 'tchat']];
      const key = { tdisc: 't_disc', ttime: 't_time', tlikes: 't_likes', tmatch: 't_match', tchat: 't_chat' };
      $('#tabs').innerHTML = tabs.map((t) => `<button data-tab="${t[0]}" ${S.screen === t[0] ? 'aria-current="page"' : ''}>${ic[key[t[2]]]}${t[1]}${t[0] === 'likes' && isW() && S.reqs.incoming.length ? `<span class="dot">${S.reqs.incoming.length}</span>` : ''}</button>`).join('');
    }
    const demobar = $('#demobar');
    demobar.hidden = !(DEMO && S.screen !== 'welcome' && S.screen !== 'boot');
    if (!demobar.hidden) demobar.innerHTML = '<span>Demo mode. Data stays in this browser.</span><button data-act="signout">Switch user</button>';
    $('#screen').scrollTop = S.last === S.screen ? st : 0;
    S.last = S.screen;
    if (S.screen === 'chat') drawMsgs();
    if (S.toast) {
      const t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = S.toast;
      $('#phone').appendChild(t); S.toast = ''; setTimeout(() => t.remove(), 2800);
    }
  }
  async function go(screen, o) {
    o = o || {};
    if (S.unwatch && screen !== 'chat') { S.unwatch(); S.unwatch = null; }
    if (screen !== 'chat') window.AKOMA_CURRENT_MATCH = null;
    if (o.reset) S.hist = [];
    else if (!o.back && !o.replace && S.screen !== screen && S.screen !== 'boot') S.hist.push(S.screen);
    S.screen = screen;
    const loader = LOAD[screen];
    if (loader) S.loading = true;
    render();
    if (loader) {
      try { await loader(); } catch (e) { toast(U.friendly(e)); }
      if (S.screen === screen) { S.loading = false; render(); }
    }
  }
  const tab = (s) => go(s, { reset: true });
  function back() { const p = S.hist.pop(); go(p || (S.me && S.me.status === 'approved' ? 'discover' : 'welcome'), { back: true }); }

  async function route() {
    S.me = await API.me();
    if (!S.me) { S.onb = freshOnb(); return go('role', { reset: true }); }
    if (S.me.isAdmin) return go('adminhint', { reset: true });
    if (S.me.status !== 'approved') return go('status', { reset: true });
    if (S.me.role === 'woman') { try { S.reqs = await API.requests(); } catch (e) { /* badge only */ } }
    S.f = { min: 18, max: 99 };
    return go('discover', { reset: true });
  }

  // ---------------------------------------------------------------- chat
  function msgHTML(m) {
    const mine = m.sender_id === S.me.id;
    let content = esc(m.body || '');
    if (m.media_path || m.media_url) {
      const expired = m.expires_at && new Date(m.expires_at) < new Date();
      if (expired || (m.media_mode === 'view_once' && m.opened_at && !mine && !m.media_url)) content = '<span class="media-expired">Media expired or already viewed</span>';
      else if (m.media_mode === 'view_once' && !mine) content = `<button class="media-open" data-act="openmedia" data-id="${m.id}">◉ Open view-once ${m.message_type || 'media'}</button>`;
      else if (m.media_type === 'image' || m.message_type === 'image') content = m.media_url ? `<img class="chat-image" src="${m.media_url}" alt="Shared photo" loading="lazy">` : '<span>Photo sent</span>';
      else if (m.message_type === 'video') content = m.media_url ? `<video class="chat-video" src="${m.media_url}" controls playsinline preload="metadata"></video>` : '<span>Video sent</span>';
      else if (m.message_type === 'audio') content = m.media_url ? `<audio class="chat-audio" src="${m.media_url}" controls preload="metadata"></audio>${m.duration_seconds ? `<small class="media-timer">${m.duration_seconds}s voice note</small>` : ''}` : '<span>Voice note</span>';
      else content = '<span>Media sent</span>';
      if (m.media_mode === 'timed' && m.expires_at) content += `<small class="media-timer">Expires ${new Date(m.expires_at).toLocaleString()}</small>`;
      if (!mine && m.message_type && m.message_type !== 'text') content += `<button class="report-media" data-act="reportmedia" data-id="${m.id}">Report this media</button>`;
    }
    let h = `<div class="b ${mine ? 'me' : 'them'}${m.flagged ? ' flag' : ''}">${content}</div>`;
    if (m.flagged) {
      h += `<div class="sys">${mine ? 'Safety check: your message mentions money. Akoma does not allow money or airtime requests. Repeated violations lead to a ban.' : 'Safety check: this message asks for money. Never send money or airtime to someone you have not met.'}
        ${mine ? '' : `<button class="btn sm danger" style="margin-top:8px;display:block" data-act="reportopen" data-id="${S.chat.other.id}">Report this person</button>`}</div>`;
    }
    return h;
  }
  function drawMsgs() {
    const box = $('#msgs'); if (!box) return;
    box.innerHTML = '<div class="sys" style="background:var(--surface2);border-color:var(--line)">Akoma never asks for money. If someone does, report them.</div>' + S.msgs.map(msgHTML).join('');
    if (S.ephemeral) { const m=S.msgs.find(x=>String(x.id)===String(S.ephemeral.id)); const media=m&&m.message_type==='video'?`<video src="${S.ephemeral.url}" controls autoplay playsinline></video>`:m&&m.message_type==='audio'?`<audio src="${S.ephemeral.url}" controls autoplay></audio>`:`<img src="${S.ephemeral.url}" alt="Private expiring media">`; box.insertAdjacentHTML('beforeend',`<div class="ephemeral-view"><div class="ephemeral-panel"><div class="row" style="justify-content:space-between"><b>Private media</b><button class="btn sm danger" data-act="closemedia" data-id="${S.ephemeral.id}">Close & destroy</button></div>${media}<p class="muted small">Closing deletes the server copy. A recipient may still capture what is displayed.</p></div></div>`); }
    box.scrollTop = box.scrollHeight;
  }
  function addMsg(m) { if (!S.msgs.some((x) => x.id === m.id)) { S.msgs.push(m); S.msgs.sort((a, b) => a.id - b.id); drawMsgs(); } }
  async function openChat(matchId) {
    let m = S.matches.find((x) => x.id === matchId);
    if (!m) { S.matches = await API.matches(); m = S.matches.find((x) => x.id === matchId); }
    if (!m) { toast('That chat is no longer available'); return render(); }
    S.chat = m; window.AKOMA_CURRENT_MATCH = { id: m.id, name: m.other.name }; S.msgs = []; S.ephemeral=null;
    await go('chat');
    try { S.msgs = await API.messages(matchId); drawMsgs(); } catch (e) { toast(U.friendly(e)); render(); return; }
    if (S.unwatch) S.unwatch();
    S.unwatch = API.watchMessages(matchId, addMsg);
  }
  async function uploadChatMedia(file, voiceDuration) {
    if (!file || !S.chat) return;
    const kind = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : 'audio';
    let blob = file;
    if (kind === 'image') blob = await shrink(file);
    const choice = ($('#media-mode') || {}).value || 'normal';
    const mode = choice.startsWith('timed:') ? 'timed' : choice;
    const seconds = choice.startsWith('timed:') ? Number(choice.split(':')[1]) : null;
    toast('Uploading…'); render();
    try { addMsg(await API.sendMedia(S.chat.id, blob, kind, mode, seconds || null, voiceDuration || null)); toast('Media sent'); }
    catch (e) { toast(U.friendly(e)); }
    render();
  }
  async function toggleVoiceRecord() {
    if (S.recording && S.recorder) { S.recorder.stop(); return; }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) { toast('Voice recording is not supported in this browser.'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream); S.recorder = recorder; S.recordChunks = []; S.recording = true; render();
      recorder.ondataavailable = e => { if (e.data && e.data.size) S.recordChunks.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop()); S.recording = false; S.recorder = null; render();
        const blob = new Blob(S.recordChunks, { type: recorder.mimeType || 'audio/webm' });
        if (blob.size && S.chat) await uploadChatMedia(new File([blob], 'voice-note.webm', { type: blob.type }), Math.min(120, Math.round((Date.now() - (S.recordStarted || Date.now())) / 1000)));
        if (S.recordLimit) clearTimeout(S.recordLimit);
      };
      recorder.start(); S.recordStarted = Date.now();
      S.recordLimit = window.setTimeout(() => { if (S.recorder && S.recorder.state === 'recording') S.recorder.stop(); }, 120000);
      toast('Recording… tap the microphone again to send.');
    } catch (e) { S.recording = false; toast('Microphone permission is needed to record a voice note.'); render(); }
  }
  async function openCard(id) {
    S.gal = 0; S.card = openAny(id) || null;
    await go('profile');
    try { S.card = await API.profile(id); } catch (e) { toast(U.friendly(e)); }
    if (S.screen === 'profile') render();
  }
  function startCompose(p) { S.cmp = { to: p, text: '', err: '', today: S.cmp.today }; return go('compose'); }

  // ---------------------------------------------------------------- actions
  async function guard(fn) {
    if (S.busy) return;
    S.busy = true; render();
    try { await fn(); } catch (e) { toast(U.friendly(e)); } finally { S.busy = false; render(); }
  }

  async function act(a, id) {
    switch (a) {
      case 'back': return back();
      case 'demo': await API.demoLogin(id); return route();
      case 'signout': if (S.unwatch) { S.unwatch(); S.unwatch = null; } await API.signOut(); S.me = null; S.profiles = []; S.matches = []; S.reqs = { incoming: [], outgoing: [] }; S.step = 'email'; S.email = ''; S.password = ''; return go('welcome', { reset: true });
      case 'demoreset': await API.demoReset(); S.me = null; return go('welcome', { reset: true });
      case 'demoapprove': await API.demoApproveMe(); return route();
      case 'refresh': S.me = await API.me(); if (S.me && S.me.status === 'approved') return route(); toast('Still waiting for review'); return render();

      case 'authmode':
        S.authMode = id === 'login' ? 'login' : 'signup'; return render();
      case 'authsubmit': {
        S.email = ($('#auth-email') || {}).value || S.email;
        S.password = ($('#auth-password') || {}).value || S.password;
        return guard(async () => {
          const result = await API.authenticate(S.email, S.password, S.authMode);
          if (result && result.confirmationRequired) {
            S.authMode = 'login';
            S.password = '';
            toast('Account created. Check your email for the confirmation link, then sign in here.');
            return;
          }
          S.password = '';
          await route();
        });
      }

      // onboarding
      case 'role': S.onb.role = id; S.f = { min: 18, max: 99 }; return go('details');
      case 'details': {
        const name = $('#nm').value.trim(), age = parseInt($('#ag').value, 10), err = $('#derr');
        S.onb.name = name; S.onb.age = isNaN(age) ? '' : age; S.onb.city = $('#ct').value;
        if (!name) { err.textContent = 'Enter your first name.'; err.hidden = false; return; }
        if (!(age >= 18)) { err.textContent = 'Akoma is for people aged 18 and over. Enter your real age to continue.'; err.hidden = false; return; }
        return go('selfie');
      }
      case 'agree': S.onb.agreed = !S.onb.agreed; return render();
      case 'rmslot': S.onb.photos.splice(+id, 1); return render();
      case 'chip': { const b = $('#bio'); if (b) S.onb.bio = b.value; const i = S.onb.interests.indexOf(id); if (i >= 0) S.onb.interests.splice(i, 1); else if (S.onb.interests.length < 12) S.onb.interests.push(id); return render(); }
      case 'biosave': {
        S.onb.bio = $('#bio').value.trim();
        if (U.hasContact(S.onb.bio) || U.hasMoney(S.onb.bio)) { const e = $('#bioerr'); e.textContent = U.friendly(new Error('bio_not_allowed')); e.hidden = false; return; }
        return go('prefs');
      }
      case 'want': S.onb.looking = id; return render();
      case 'finish': {
        S.f = { min: Math.max(18, +$('#pmin').value || 18), max: Math.min(99, +$('#pmax').value || 99) };
        return guard(async () => {
          const o = S.onb, d = o.done;
          if (!d.profile) { const ex = await API.me(); if (!ex) await API.createProfile({ role: o.role, name: o.name, age: o.age, city: o.city, bio: o.bio, interests: o.interests, looking_for: o.looking }); d.profile = true; }
          while (d.photos < o.photos.length) { await API.addPhoto(o.photos[d.photos].blob); d.photos++; }
          if (o.card && !d.card) { await API.uploadVerification('card', o.card.blob); d.card = true; }
          S.me = await API.me(); await go('status', { reset: true });
        });
      }

      // browsing
      case 'dview': S.dview = id; return render();
      case 'open': return openCard(id);
      case 'gal': S.gal = +id; return render();
      case 'pass': { const p = S.profiles.find((x) => x.id === id); if (p) p.passed = true; render(); try { await API.passProfile(id); } catch (e) { /* local skip is enough */ } return; }
      case 'like': {
        const p = S.profiles.find((x) => x.id === id) || S.card;
        if (isW()) return guard(async () => { const mid = await API.likeProfile(id); toast('Chat opened with ' + p.name); S.matches = await API.matches(); await openChat(mid); });
        if (p && p.is_match) return act('openchat', id);
        return startCompose(p);
      }
      case 'sendreq': {
        const t = ($('#rmsg').value || '').trim(); S.cmp.text = t;
        const bad = !t ? 'Write a short message first.' : U.hasContact(t) ? U.friendly(new Error('contact_not_allowed')) : U.hasMoney(t) ? U.friendly(new Error('money_not_allowed')) : '';
        if (bad) { S.cmp.err = bad; return render(); }
        S.cmp.err = '';
        return guard(async () => { await API.sendRequest(S.cmp.to.id, t); S.cmp.today++; toast('Request sent to ' + S.cmp.to.name + '. You can write again when she replies.'); await go('likes', { reset: true }); });
      }
      case 'applyf': { const lo = Math.max(18, +$('#fmin').value || 18), hi = Math.min(99, +$('#fmax').value || 99); S.f = { min: Math.min(lo, hi), max: Math.max(lo, hi), radius: +($('#fradius')||{}).value || 0 }; toast('Filters applied'); S.hist.pop(); return go('discover', { back: true }); }
      case 'resetf': S.f = { min: 18, max: 99, radius: 0 }; S.hist.pop(); return go('discover', { back: true });
      case 'accept': return guard(async () => { const mid = await API.respondRequest(id, true); S.reqs.incoming = S.reqs.incoming.filter((r) => r.id !== id); S.matches = await API.matches(); toast('Chat opened'); await openChat(mid); });
      case 'decline': return guard(async () => { await API.respondRequest(id, false); S.reqs.incoming = S.reqs.incoming.filter((r) => r.id !== id); });
      case 'callhistory': return go('callhistory');
      case 'callsetting': return guard(async()=>{ S.allowIncomingCalls = await API.setIncomingCalls(!S.allowIncomingCalls); toast(S.allowIncomingCalls ? 'Incoming calls enabled' : 'Incoming calls disabled'); render(); });
      case 'openchat': {
        if (!S.matches.length) S.matches = await API.matches();
        const m = S.matches.find((x) => x.id === id) || S.matches.find((x) => x.other.id === id);
        if (!m) { toast('That chat is no longer available'); return render(); }
        return openChat(m.id);
      }
      case 'unmatch': return guard(async () => { const m = S.matches.find((x) => x.other.id === id); if (m) { await API.unmatch(m.id); if (window.AkomaCalls) await window.AkomaCalls.endIfMatch(m.id); } S.matches = S.matches.filter((x) => x.other.id !== id); toast('Unmatched'); await go('matches', { reset: true }); });

      case 'tonight-on': return guard(async()=>{ const mode=($('#tonight-mode')||{}).value||'either', hours=+($('#tonight-hours')||{}).value||4; await API.setLookingTonight(true,mode,hours); toast('Looking Tonight is active for '+hours+' hours.'); S.me=await API.me(); });
      case 'tonight-off': return guard(async()=>{ await API.setLookingTonight(false); toast('Looking Tonight turned off.'); S.me=await API.me(); });
      case 'vaultgrant': { const matchId=($('#vault-match-'+id)||{}).value, minutes=+($('#vault-duration-'+id)||{}).value||15; if(!matchId){toast('You need an active match to grant access.');return;} return guard(async()=>{await API.grantVault(id,matchId,minutes); S.vault=await API.vaultAssets(); toast('Vault access granted for '+minutes+' minutes.');render();}); }
      case 'vaultrevoke': return guard(async()=>{await API.revokeVault(id); S.vault=await API.vaultAssets();toast('Vault access revoked.');render();});
      case 'vaultdelete': return guard(async()=>{await API.deleteVault(id); S.vault=await API.vaultAssets();toast('Vault photo deleted.');render();});

      // chat
      case 'send': {
        const el = $('#msg'); const t = (el.value || '').trim(); if (!t) return;
        el.value = ''; try { addMsg(await API.sendMessage(S.chat.id, t)); } catch (e) { el.value = t; toast(U.friendly(e)); render(); } return;
      }
      case 'openmedia': return guard(async () => { const url = await API.openMedia(id); const m = S.msgs.find(x => String(x.id) === String(id)); if (m) { m.opened_at = new Date().toISOString(); S.ephemeral={id,url}; drawMsgs(); } });
      case 'closemedia': return guard(async()=>{ await API.closeMedia(id); const m=S.msgs.find(x=>String(x.id)===String(id)); if(m){m.media_path=null;m.media_url=null;m.body='Expired media';m.opened_at=new Date().toISOString();} if(S.ephemeral&&String(S.ephemeral.id)===String(id))S.ephemeral=null; drawMsgs(); toast('Media closed and server copy deleted.'); });
      case 'reportmedia': S.rep = { target: S.chat.other.id, reason: 'Something else', block: false, details: 'I am reporting media message ' + id + ' in this conversation.' }; return go('report');
      case 'voice': return toggleVoiceRecord();

      // timeline
      case 'plike': { const p = S.feed.find((x) => x.id === id); if (!p) return; p.liked = !p.liked; p.likes += p.liked ? 1 : -1; render(); try { await API.togglePostLike(id); } catch (e) { p.liked = !p.liked; p.likes += p.liked ? 1 : -1; render(); } return; }
      case 'rmimg': S.draft.blob = null; S.draft.preview = null; return render();
      case 'post': {
        const t = (($('#ptxt') || {}).value || '').trim(); S.draft.text = t;
        if (!t && !S.draft.blob) { S.draft.err = 'Write something or add a photo.'; return render(); }
        if (U.hasContact(t) || U.hasMoney(t)) { S.draft.err = 'Posts cannot include contact details or ask for money, airtime or gifts.'; return render(); }
        S.draft.err = '';
        return guard(async () => { await API.createPost({ body: t, blob: S.draft.blob }); const had = !!S.draft.blob; S.draft = { text: '', blob: null, preview: null, err: '' }; S.feed = await API.feed(); toast(had ? 'Posted. A moderator will review your photo first.' : 'Posted to the timeline'); });
      }

      // safety
      case 'reportopen': S.rep = { target: id, reason: REASONS[0], block: true, details: '' }; return go('report');
      case 'reason': S.rep.reason = id; return render();
      case 'blockt': { const d = $('#rdet'); if (d) S.rep.details = d.value; S.rep.block = !S.rep.block; return render(); }
      case 'submitreport': {
        const d = $('#rdet'); if (d) S.rep.details = d.value;
        return guard(async () => { await API.report({ target: S.rep.target, reason: S.rep.reason, details: S.rep.details, block: S.rep.block }); if (S.rep.block && S.chat && window.AkomaCalls) await window.AkomaCalls.endIfMatch(S.chat.id); toast('Report sent. A moderator will review it.'); S.profiles = S.profiles.filter((p) => !(S.rep.block && p.id === S.rep.target)); await go(S.rep.block ? 'inbox' : 'discover', { reset: true }); });
      }

      // account
      case 'echip': { const b = $('#ebio'); if (b) S.me.bio = b.value; const cur = (S.editInterests || S.me.interests).slice(); const i = cur.indexOf(id); if (i >= 0) cur.splice(i, 1); else if (cur.length < 12) cur.push(id); S.editInterests = cur; return render(); }
      case 'ewant': { const b = $('#ebio'); if (b) S.me.bio = b.value; S.editLooking = id; return render(); }
      case 'editsave': {
        const bio = $('#ebio').value.trim();
        if (U.hasContact(bio) || U.hasMoney(bio)) { const e = $('#eerr'); e.textContent = U.friendly(new Error('bio_not_allowed')); e.hidden = false; return; }
        return guard(async () => { await API.updateProfile({ bio, city: $('#ect').value, interests: S.editInterests || S.me.interests, looking_for: S.editLooking || S.me.looking_for }); S.me = await API.me(); toast('Profile updated'); S.hist.pop(); await go('me', { back: true }); });
      }
      case 'rmphoto': return guard(async () => { await API.removePhoto(+id); S.me = await API.me(); });
      case 'set': {
        const v = !S.me[id]; S.me[id] = v; render();
        try {
          if (id === 'online_visible') await API.setOnlineVisibility(v);
          else await API.updateProfile({ [id]: v });
          S.me = await API.me();
        } catch (e) { S.me[id] = !v; toast(U.friendly(e)); }
        render(); return;
      }
      case 'locationon': return guard(async () => {
        if (!navigator.geolocation) throw new Error('Location is not supported by this browser.');
        const pos = await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:false,timeout:12000,maximumAge:300000}));
        await API.setLocation(pos.coords.latitude,pos.coords.longitude,true);
        S.me = await API.me(); toast('Nearby distance enabled. Only approximate distance bands are shared.'); render();
      });
      case 'locationoff': return guard(async () => {
        await API.setLocation(null,null,false); S.me = await API.me(); toast('Location sharing turned off.'); render();
      });
      case 'del': S.confirmDel = true; return render();
      case 'delno': S.confirmDel = false; return render();
      case 'delyes': return guard(async () => { await API.deleteAccount(); S.confirmDel = false; S.me = null; await go('welcome', { reset: true }); });
      case 'tabto': return tab(id);

      // subscription
      case 'plan': { const m = $('#momo'); if (m) S.momo = m.value; S.plan = id; return render(); }
      case 'net': { const m = $('#momo'); if (m) S.momo = m.value; S.net = id; return render(); }
      case 'pay': {
        const m = $('#momo'); if (m) S.momo = m.value;
        if (SIMULATED && S.momo.replace(/\D/g, '').length < 10) { const e = $('#perr'); e.textContent = 'Enter a 10-digit mobile number.'; e.hidden = false; return; }
        S.paying = true; render();
        try { await API.pay({ plan: S.plan, network: S.net, phone: S.momo }); S.paying = false; toast('Payment confirmed'); await go('receipt', { replace: true }); }
        catch (e) { S.paying = false; toast(U.friendly(e)); render(); }
        return;
      }
    }
  }

  // ---------------------------------------------------------------- events
  const phone = $('#phone');
  phone.addEventListener('click', (e) => {
    const t = e.target.closest('[data-tab],[data-go],[data-act]'); if (!t || t.tagName === 'LABEL') return;
    if (t.dataset.tab) return tab(t.dataset.tab);
    if (t.dataset.go) return go(t.dataset.go);
    act(t.dataset.act, t.dataset.id).catch((err) => { toast(U.friendly(err)); render(); });
  });
  phone.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    if (e.target.id === 'msg') { e.preventDefault(); act('send'); }
    else if (e.target.id === 'auth-email' || e.target.id === 'auth-password') { e.preventDefault(); act('authsubmit'); }
  });
  phone.addEventListener('input', (e) => {
    if (e.target.id === 'ptxt') S.draft.text = e.target.value;
    if (e.target.id === 'rmsg') { S.cmp.text = e.target.value; const c = $('#rc'); if (c) c.textContent = S.cmp.text.length + '/200 · Free to send'; }
  });
  phone.addEventListener('change', async (e) => {
    const t = e.target, files = Array.from(t.files || []); if (!files.length) return;
    try {
      if (t.id === 'selfie') { const blob = await shrink(files[0], 'verify'); S.onb.selfie = { blob, preview: await U.blobToDataURL(blob) }; render(); }
      else if (t.id === 'idcard') { const blob = await shrink(files[0], 'verify'); S.onb.card = { blob, preview: await U.blobToDataURL(blob) }; render(); }
      else if (t.id === 'pending-id') { await guard(async () => { const blob = await shrink(files[0], 'verify'); await API.uploadVerification('card', blob); S.me = await API.me(); toast('Your ID was submitted securely for review.'); render(); }); t.value = ''; }
      else if (t.id === 'slotfile') { for (const f of files.slice(0, 6 - S.onb.photos.length)) { const blob = await shrink(f); S.onb.photos.push({ blob, preview: await U.blobToDataURL(blob) }); } render(); }
      else if (t.id === 'pimg') { S.draft.text = ($('#ptxt') || {}).value || S.draft.text; S.draft.blob = await shrink(files[0]); S.draft.preview = await U.blobToDataURL(S.draft.blob); S.draft.err = ''; render(); }
      else if (t.id === 'editphoto') { await guard(async () => { for (const f of files.slice(0, 6 - S.me.photos.length)) await API.addPhoto(await shrink(f)); S.me = await API.me(); }); }
      else if (t.id === 'chatfile' || t.id === 'chatcamera') { for (const f of files.slice(0, 5)) await uploadChatMedia(f); t.value = ''; }
      else if (t.id === 'vaultfile') { await guard(async()=>{ for(const f of files.slice(0,8)) await API.uploadVault(f); S.vault=await API.vaultAssets(); toast('Private photos added to your Vault.'); render(); }); t.value=''; }
    } catch (err) { toast(U.friendly(err)); render(); }
  });

  // ---------------------------------------------------------------- start
  (async function start() {
    render();
    try {
      await API.init();
      window.dispatchEvent(new Event('akoma:ready'));
      if (API.session()) {
        await route();
        try { await API.heartbeat(); } catch (_) {}
        window.setInterval(() => { if (API.session() && document.visibilityState === 'visible') API.heartbeat().catch(() => {}); }, 120000);
        window.setInterval(async () => {
          if (!API.session() || document.visibilityState !== 'visible' || S.screen !== 'status' || S.busy) return;
          try {
            const latest = await API.me();
            if (latest && latest.status === 'approved') { S.me = latest; toast('Your Akoma account is approved. Welcome in!'); await route(); }
            else if (latest && S.me && (latest.status !== S.me.status || latest.id_card_path !== S.me.id_card_path || latest.review_note !== S.me.review_note)) { S.me = latest; render(); }
          } catch (_) { /* A temporary network issue should not interrupt the pending screen. */ }
        }, 30000);
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && API.session()) API.heartbeat().catch(() => {}); });
      } else await go('welcome', { reset: true });
    } catch (e) { $('#screen').innerHTML = `<div class="pad"><div class="banner">${ic.warn}<span>Akoma could not start. ${esc(U.friendly(e))}</span></div><button class="btn primary" onclick="location.reload()">Try again</button></div>`; }
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(() => {});
  })();
})();

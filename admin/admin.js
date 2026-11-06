// Meet GH admin dashboard: verification queue, reports, posts, users, payments, waitlist.
(function () {
  'use strict';
  const U = window.AkomaUtil, API = window.API;
  const app = document.getElementById('app');
  const $ = (s) => document.querySelector(s);
  // Show a useful message instead of leaving a blank page when a dependency is missing.
  if (!U || !API || !API.admin) {
    if (app) app.innerHTML = '<div class="login"><div class="brandmark">♥</div><h1>Meet GH Admin</h1><p class="err">The dashboard scripts did not load correctly. Please upload the complete Meet GH folder, keeping the js, css and admin folders together, then refresh this page.</p><p class="muted small">If you opened this page from a file preview, publish it to a web host and open its HTTPS URL.</p></div>';
    return;
  }
  const A = API.admin;
  const esc = U.esc;
  window.addEventListener('error', (event) => {
    if (!app) return;
    const message = event && event.message ? event.message : 'Unknown JavaScript error';
    app.innerHTML = `<div class="login"><div class="brandmark">♥</div><h1>Meet GH Admin</h1><p class="err">The dashboard encountered an error: ${esc(message)}</p><p class="muted small">Refresh the page. If the problem continues, send a screenshot of this message.</p></div>`;
  });
  const DEMO = API.mode === 'demo';
  const TABS = [['overview', 'Overview'], ['queue', 'Verification'], ['content', 'Content review'], ['reports', 'Reports'], ['feedback', 'Problem reports'], ['posts', 'Posts'], ['users', 'Users'], ['payments', 'Payments'], ['waitlist', 'Waitlist']];
  const REJECT = ['Selfie is unclear', 'Face could not be checked', 'Profile photos need review', 'Profile looks fake', 'Possible under-18 account', 'Other'];
  const GOAL = 100;
  const S = { me: null, tab: 'overview', stats: null, data: {}, q: '', busy: false, email: '', toast: '' };

  const badgeFor = (st) => `<span class="badge ${st === 'approved' ? 'good' : st === 'pending' ? 'warn' : 'bad'}">${esc(st)}</span>`;
  const date = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ' ' + U.clock(iso);
  function note(t) { S.toast = t; }
  // Same service worker as the member app, so admin alerts can arrive while this page is closed.
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) { navigator.serviceWorker.register('../sw.js', { scope: '../', updateViaCache: 'none' }).catch(() => {}); }
  function showToast() { if (!S.toast) return; const t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = S.toast; document.body.appendChild(t); S.toast = ''; setTimeout(() => t.remove(), 2600); }
  const dataImg = (url, label) => (url ? `<img src="${esc(url)}" alt="${esc(label)}" loading="lazy">` : `<div class="ph">${DEMO ? 'Sample ' + esc(label) : 'Not uploaded'}</div>`);

  // ------------------------------------------------------------- views
  function loginView() {
    return `<div class="login">
      <div class="brandmark" aria-hidden="true">♥</div>
      <h1>Meet GH Admin</h1>
      <p class="muted">Sign in with the email address and password of your approved admin account.</p>
      <form id="admin-login" novalidate>
        <label class="f">Email address<input id="admin-email" type="email" autocomplete="username" inputmode="email" placeholder="admin@example.com" value="${esc(S.email)}" required></label>
        <label class="f">Password<input id="admin-password" type="password" autocomplete="current-password" placeholder="Your password" required></label>
        <button class="btn primary" id="admin-submit" type="submit">Sign in to dashboard</button>
      </form>
      <button class="link" id="admin-forgot" type="button">Forgot password?</button>
      <p class="err" id="lerr" role="alert" hidden></p>
      <p class="muted small">Admin access is restricted. A normal member account cannot open this dashboard.</p>
      ${DEMO ? '<button class="btn gold" data-act="demoadmin">Enter as admin (demo)</button>' : ''}
    </div>`;
  }

  const pushCanUse = () => !DEMO && API.pushStatus && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  // Shown until alerts are on, so no admin misses a verification request or report.
  const pushBanner = () => (pushCanUse() && !S.pushOn && Notification.permission !== 'denied'
    ? `<div class="banner" style="margin:12px 16px;display:flex;gap:12px;align-items:center;justify-content:space-between;padding:12px 14px;border-radius:12px;background:#fdf1d3;color:#3a2f10;font-size:14px"><span>🔔 Turn on alerts to get notified about new members, verification requests, reports and photo posts, even when this page is closed.</span><button class="btn sm primary" data-act="adminpush">Turn on</button></div>` : '');

  function header() {
    const st = S.stats || {};
    const badge = { queue: st.pending, content: st.pendingContent, reports: st.openReports, posts: st.pendingPosts };
    return `<div class="top"><div class="top-in"><div class="top-row"><h1>Meet GH Admin</h1><div class="row"><span class="small">${esc(S.me.name)}</span>${pushCanUse() ? `<button class="link" data-act="adminpush">${S.pushOn ? '🔔 Alerts on' : '🔕 Turn on alerts'}</button>` : ''}<button class="link" data-act="signout">Sign out</button></div></div>
      <div class="tabs" role="tablist">${TABS.map((t) => `<button role="tab" aria-selected="${S.tab === t[0]}" data-tab="${t[0]}">${t[1]}${badge[t[0]] ? `<span class="count">${badge[t[0]]}</span>` : ''}</button>`).join('')}</div></div></div>`;
  }

  const V = {
    overview() {
      const s = S.stats; if (!s) return '<div class="empty">Loading…</div>';
      const pct = Math.min(100, Math.round((s.waitlistWomen / GOAL) * 100));
      const ratio = s.women ? (s.men / s.women).toFixed(1) : '0';
      const tile = (n, label, tab, alert) => `<button class="tile ${alert ? 'alert' : ''}" data-tab="${tab}"><b>${n}</b><span class="muted small">${label}</span></button>`;
      return `<div class="tiles">${tile(s.pending, 'Profiles to verify', 'queue', s.pending > 0)}${tile(s.pendingContent || 0, 'Changed bios / photos', 'content', (s.pendingContent || 0) > 0)}${tile(s.openReports, 'Open reports', 'reports', s.openReports > 0)}${tile(s.pendingPosts, 'Photos to review', 'posts', s.pendingPosts > 0)}
        <div class="tile"><b>${s.women}</b><span class="muted small">Women approved</span></div><div class="tile"><b>${s.men}</b><span class="muted small">Men approved</span></div>
        <div class="tile"><b>${s.activeSubs}</b><span class="muted small">Active subscribers</span></div><div class="tile"><b>${U.money(s.revenue)}</b><span class="muted small">Total payments</span></div></div>
        <div class="panel"><h2>Launch check</h2>
          <div class="row" style="justify-content:space-between"><span><b>${s.waitlistWomen}</b> of ${GOAL} women on the waitlist</span><span class="muted small">${pct}%</span></div>
          <div class="bar gold" role="progressbar" aria-valuenow="${s.waitlistWomen}" aria-valuemin="0" aria-valuemax="${GOAL}"><i style="width:${pct}%"></i></div>
          <p class="muted small">Plan: reach ${GOAL} real women on the waitlist in 6 to 8 weeks, with at least 30% passing verification. If you cannot, stop or change the offer before spending on development.</p>
          <p class="muted small">Men approved per woman approved: <b>${ratio}</b>. Aim for about 1.0 or lower so no woman's inbox floods. Men waiting: ${s.waitlistMen}.</p></div>`;
    },

    queue() {
      const rows = S.data.queue; if (!rows) return '<div class="empty">Loading…</div>';
      if (!rows.length) return '<div class="empty">Nobody is waiting for review.</div>';
      return rows.map((r) => {
        const p = r.profile, man = p.role === 'man';
        return `<div class="case"><div class="case-head"><h3>${esc(p.name)}, ${p.age}</h3><span class="muted small">DOB: ${esc(p.date_of_birth || 'Not supplied (legacy account)')}</span><span class="badge">${esc(p.role)}</span><span class="muted small">${esc(p.city)} · joined ${date(p.created_at)} · waiting ${Math.max(0, Math.floor((Date.now() - new Date(p.created_at).getTime()) / 3600000))}h</span></div>
          ${p.bio ? `<p>${esc(p.bio)}</p>` : '<p class="muted">No bio.</p>'}
          <p class="small muted">Interests: ${esc((p.interests || []).join(', ') || 'none')} · Looking for: ${esc(p.looking_for)}</p>
          <div class="imgs"><figure>${dataImg(r.selfie, 'Submitted selfie')}<figcaption>Submitted selfie</figcaption></figure>
            ${(r.photos.length ? r.photos : [null]).map((u, i) => `<figure>${dataImg(u, 'photo')}<figcaption>Profile photo ${i + 1}</figcaption></figure>`).join('')}</div>
          <p class="small muted">${r.hasSelfie ? "Review the submitted selfie for a live-looking face and compare it with the profile photos. This selfie check does not establish legal identity or age. Reject suspicious or apparently under-18 accounts." : "This member has not submitted a selfie yet. A selfie is required before approval."}</p>
          <div class="actions"><button class="btn primary" data-act="approve" data-id="${p.id}" ${r.hasSelfie ? "" : 'disabled title="Selfie required before approval"'}>Approve</button>
            <select data-reason="${p.id}" aria-label="Rejection reason">${REJECT.map((x) => `<option>${x}</option>`).join('')}</select>
            <button class="btn danger" data-act="reject" data-id="${p.id}">Reject</button></div></div>`;
      }).join('');
    },

    content() {
      const rows=S.data.content; if(!rows) return '<div class="empty">Loading content awaiting review…</div>';
      if(!rows.length) return '<div class="empty">No changed bios or photos are waiting for review.</div>';
      return rows.map(q=>`<div class="case"><div class="case-head"><h3>${esc(q.member.name)}</h3><span class="badge warn">${esc(q.type.replace('profile_','').replace('_',' '))}</span><span class="muted small">${date(q.created_at)}</span></div>
        ${q.type==='profile_bio'?`<p>${esc(q.payload.bio||'')}</p>`:''}
        ${q.type==='profile_photos'?`<div class="imgs">${(q.media||[]).map((u,i)=>`<figure>${dataImg(u,'Proposed profile photo')}<figcaption>Proposed photo ${i+1}</figcaption></figure>`).join('')||'<p class="muted">No preview available</p>'}</div>`:''}
        <div class="actions"><button class="btn primary" data-act="contentok" data-id="${q.id}">Approve change</button><button class="btn danger" data-act="contentno" data-id="${q.id}">Reject change</button></div></div>`).join('');
    },

    reports() {
      const rows = S.data.reports; if (!rows) return '<div class="empty">Loading…</div>';
      const open = rows.filter((r) => r.status === 'open');
      const filt = S.data.rfilter === 'all' ? rows : open;
      const head = `<div class="row wrap"><button class="btn sm ${S.data.rfilter !== 'all' ? 'primary' : ''}" data-act="rfilter" data-id="open">Open (${open.length})</button><button class="btn sm ${S.data.rfilter === 'all' ? 'primary' : ''}" data-act="rfilter" data-id="all">All (${rows.length})</button></div>`;
      if (!filt.length) return head + '<div class="empty">No reports here.</div>';
      return head + filt.map((r) => `<div class="case"><div class="case-head"><h3>${esc(r.reported.name)}</h3>${badgeFor(r.reported.status || 'approved')}<span class="badge ${r.status === 'open' ? 'warn' : ''}">${esc(r.status)}</span><span class="muted small">${esc(r.reason)} · ${date(r.created_at)}</span></div>
        <p class="small muted">Reported by ${esc(r.reporter.name)}</p>${r.details ? `<p>&ldquo;${esc(r.details)}&rdquo;</p>` : ''}<p class="small muted">Target: ${esc(r.target_type||'profile')}${r.media_kind ? ' · '+esc(r.media_kind) : ''}</p>${r.target_text ? `<p><b>Comment:</b> &ldquo;${esc(r.target_text)}&rdquo;</p>` : ''}${r.media ? `<div class="imgs big"><figure>${r.media_kind==='video'?`<video controls playsinline src="${esc(r.media)}" style="width:100%;border-radius:12px"></video>`:r.media_kind==='audio'?`<audio controls src="${esc(r.media)}"></audio>`:`<img src="${esc(r.media)}" alt="Reported content">`}</figure></div>`:''}
        ${r.recent.length ? `<div class="chat">${r.recent.map((m) => `<div class="${m.from}${m.flagged ? ' flag' : ''}">${esc(m.body)}</div>`).join('')}</div>` : '<p class="small muted">No chat between these two.</p>'}
        ${r.status === 'open' ? `<div class="actions"><button class="btn danger" data-act="banreport" data-id="${r.id}" data-user="${r.reported.id}">Ban ${esc(r.reported.name)}</button>${r.target_type === 'comment' && r.target_id ? `<button class="btn danger" data-act="rmcmt" data-id="${r.id}" data-cid="${r.target_id}">Remove comment</button>` : ''}<button class="btn" data-act="dismiss" data-id="${r.id}">Dismiss report</button></div>` : ''}</div>`).join('');
    },

    feedback() {
      const rows = S.data.feedback; if (!rows) return '<div class="empty">Loading problem reports…</div>';
      if (!rows.length) return '<div class="empty">No software problem reports yet.</div>';
      return rows.map((r) => `<div class="case"><div class="case-head"><h3>${esc(r.category)}</h3><span class="badge ${r.status === 'open' ? 'warn' : ''}">${esc(r.status)}</span><span class="muted small">${date(r.created_at)}</span></div><p class="small muted">From ${esc(r.reporter && r.reporter.name || 'Meet GH member')} · Page: ${esc(r.page || 'Unknown')} · Version: ${esc(r.app_version || 'Unknown')}</p><p>${esc(r.details)}</p></div>`).join('');
    },

    posts() {
      const rows = S.data.posts; if (!rows) return '<div class="empty">Loading…</div>';
      if (!rows.length) return '<div class="empty">No photos are waiting for review.</div>';
      return rows.map((p) => {
        const img = p.image ? (typeof p.image === 'string' ? `<img src="${esc(p.image)}" alt="Post photo">` : `<div class="ph" style="background:linear-gradient(160deg,hsl(${p.image.h} 50% 40%),hsl(${p.image.h + 50} 55% 62%));color:#fff">${esc(p.image.label)}</div>`) : '';
        return `<div class="case"><div class="case-head"><h3>${esc(p.author.name)}</h3><span class="muted small">${date(p.created_at)}</span></div>${p.body ? `<p>${esc(p.body)}</p>` : ''}
          <div class="imgs big"><figure>${img}</figure></div>
          <div class="actions"><button class="btn primary" data-act="postok" data-id="${p.id}">Approve</button><button class="btn danger" data-act="postno" data-id="${p.id}">Remove</button></div></div>`;
      }).join('');
    },

    users() {
      const rows = S.data.users;
      const search = `<label class="f">Search by name<input type="search" id="uq" placeholder="Name or city" value="${esc(S.q)}"></label>`;
      if (!rows) return search + '<div class="empty">Loading…</div>';
      if (!rows.length) return search + '<div class="empty">No members match.</div>';
      return `${search}<div class="actions"><button class="btn sm danger" data-act="bulkban">Ban selected members</button><span class="muted small">Select members below</span></div><div class="tablewrap"><table><thead><tr><th>Select</th><th>Name</th><th>Role</th><th class="num">Age</th><th>City</th><th>Status</th><th>Subscribed</th><th>Featured</th><th>Actions</th></tr></thead><tbody>
        ${rows.map((u) => `<tr><td><input type="checkbox" class="user-select" value="${u.id}" aria-label="Select ${esc(u.name)}"></td><td>${esc(u.name)}</td><td>${esc(u.role)}</td><td class="num">${u.age}</td><td>${esc(u.city)}</td><td>${badgeFor(u.status)}</td><td>${u.role === 'man' ? (u.subscribed ? '<span class="badge good">Yes</span>' : '<span class="muted">No</span>') : '<span class="muted">Free</span>'}</td>
          <td>${u.featured ? '<span class="badge warn">Featured</span>' : '<span class="muted">No</span>'}</td>
          <td><div class="actions">${u.status === 'approved' ? `<button class="btn sm" data-act="feature" data-id="${u.id}" data-days="${u.featured ? 0 : 7}">${u.featured ? 'Unfeature' : 'Feature 7 days'}</button><button class="btn sm danger" data-act="ban" data-id="${u.id}">Ban</button>` : ''}
            ${u.status === 'banned' || u.status === 'rejected' ? `<button class="btn sm" data-act="restore" data-id="${u.id}">Restore</button>` : ''}</div></td></tr>`).join('')}</tbody></table></div>`;
    },

    payments() {
      const rows = S.data.payments; if (!rows) return '<div class="empty">Loading…</div>';
      if (!rows.length) return '<div class="empty">No payments yet.</div>';
      const total = rows.reduce((a, p) => a + Number(p.amount_ghs), 0);
      return `<div class="panel"><h2>${U.money(total)} from ${rows.length} payment${rows.length === 1 ? '' : 's'}</h2><div class="tablewrap"><table><thead><tr><th>Date</th><th>Member</th><th>Plan</th><th>Network</th><th>Reference</th><th class="num">Amount</th></tr></thead><tbody>
        ${rows.map((p) => `<tr><td>${date(p.created_at)}</td><td>${esc(p.user.name)}</td><td>${esc(p.plan === 'week' ? 'Weekly' : 'Monthly')}</td><td>${esc(p.network || '')}</td><td>${esc(p.reference)}</td><td class="num">${U.money(p.amount_ghs)}</td></tr>`).join('')}</tbody></table></div></div>`;
    },

    waitlist() {
      const rows = S.data.waitlist; if (!rows) return '<div class="empty">Loading…</div>';
      const w = rows.filter((r) => r.role === 'woman'), m = rows.filter((r) => r.role === 'man');
      const pct = Math.min(100, Math.round((w.length / GOAL) * 100));
      return `<div class="panel"><h2>${w.length} women · ${m.length} men</h2><div class="bar gold"><i style="width:${pct}%"></i></div>
        <p class="muted small">Invite women first. Admit men in small batches, about one per woman.</p>
        <div class="actions"><button class="btn sm" data-act="copy" data-id="woman">Copy phone numbers: women not invited</button><button class="btn sm" data-act="copy" data-id="man">Copy phone numbers: men not invited</button></div></div>
        ${rows.length ? `<div class="tablewrap"><table><thead><tr><th>Joined</th><th>Name</th><th>Role</th><th>City</th><th>Phone</th><th>Invited</th></tr></thead><tbody>
        ${rows.map((r) => `<tr><td>${date(r.created_at)}</td><td>${esc(r.name)}</td><td>${esc(r.role)}</td><td>${esc(r.city)}</td><td>${esc(r.phone)}</td><td><button class="btn sm ${r.invited ? '' : 'gold'}" data-act="invite" data-id="${r.id}" data-v="${r.invited ? 0 : 1}">${r.invited ? 'Invited' : 'Mark invited'}</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Nobody has joined yet. Share the waitlist page.</div>'}`;
    }
  };

  function render() {
    if (!S.me) { app.innerHTML = loginView(); return; }
    const keep = document.activeElement && document.activeElement.id === 'uq' ? document.activeElement.selectionStart : null;
    app.innerHTML = header() + pushBanner() + `<main>${V[S.tab]()}</main>`;
    if (keep !== null) { const q = $('#uq'); if (q) { q.focus(); q.setSelectionRange(keep, keep); } }
    showToast();
  }

  // ------------------------------------------------------------- data
  const LOAD = {
    overview: async () => {},
    queue: async () => { S.data.queue = await A.queue(); },
    content: async () => { S.data.content = await A.contentQueue(); },
    reports: async () => { S.data.reports = await A.reports(); S.data.rfilter = S.data.rfilter || 'open'; },
    feedback: async () => { S.data.feedback = await A.feedback(); },
    posts: async () => { S.data.posts = await A.posts(); },
    users: async () => { S.data.users = await A.users(S.q); },
    payments: async () => { S.data.payments = await A.payments(); },
    waitlist: async () => { S.data.waitlist = await A.waitlist(); }
  };
  async function refresh() {
    try { S.stats = await A.stats(); } catch (e) { note(U.friendly(e)); }
    render();
    try { await LOAD[S.tab](); } catch (e) { note(U.friendly(e)); }
    render();
  }
  async function afterLogin() {
    S.me = await API.me();
    if (!S.me || !S.me.isAdmin) {
      if (S.me) { await API.signOut(); S.me = null; }
      render(); const e = $('#lerr'); if (e) { e.textContent = 'This account is not an admin. Make it one in Supabase (see the setup guide).'; e.hidden = false; }
      return;
    }
    try { S.pushOn = pushCanUse() ? await API.pushStatus() : false; } catch (_) { S.pushOn = false; }
    if (pushCanUse() && !S.pushOn && Notification.permission === 'granted') { try { await API.enablePush(); S.pushOn = true; } catch (_) {} }
    await refresh();
  }

  async function act(a, id, el) {
    switch (a) {
      case 'adminpush': {
        const want = !S.pushOn; S.pushOn = want; render();
        try { if (want) await API.enablePush(); else await API.disablePush(); note(want ? 'Alerts are on for this device.' : 'Alerts are off for this device.'); }
        catch (e) { S.pushOn = !want; note(U.friendly(e)); }
        return render();
      }
      case 'demoadmin': await API.demoLogin('admin'); return afterLogin();
      case 'signout': await API.signOut(); S.me = null; S.data = {}; return render();

      case 'contentok': await A.reviewContent(id,true,'Approved by moderator'); note('Content approved'); return refresh();
      case 'contentno': await A.reviewContent(id,false,'Rejected by moderator'); note('Content rejected'); return refresh();
      case 'approve': await A.setStatus(id, 'approved', ''); note('Approved'); return refresh();
      case 'reject': { const sel = document.querySelector(`[data-reason="${id}"]`); await A.setStatus(id, 'rejected', sel ? sel.value : ''); note('Rejected'); return refresh(); }
      case 'rfilter': S.data.rfilter = id; return render();
      case 'banreport': await A.setStatus(el.dataset.user, 'banned', 'Banned after report'); await A.resolveReport(id, 'actioned'); note('User banned'); return refresh();
      case 'rmcmt': await A.removeComment(el.dataset.cid); await A.resolveReport(id, 'actioned'); note('Comment removed'); return refresh();
      case 'dismiss': await A.resolveReport(id, 'dismissed'); note('Report dismissed'); return refresh();
      case 'postok': await A.moderatePost(id, true); note('Post approved'); return refresh();
      case 'postno': await A.moderatePost(id, false); note('Post removed'); return refresh();
      case 'bulkban': { const ids=[...document.querySelectorAll('.user-select:checked')].map(x=>x.value); if(!ids.length){note('Select at least one member');return render();} if(!confirm(`Ban ${ids.length} selected member(s)?`)) return; for(const uid of ids) await A.setStatus(uid,'banned','Bulk ban by admin'); note(`${ids.length} members banned`); return refresh(); }
      case 'ban': await A.setStatus(id, 'banned', 'Banned by admin'); note('User banned'); return refresh();
      case 'restore': await A.setStatus(id, 'approved', ''); note('Restored'); return refresh();
      case 'feature': await A.feature(id, +el.dataset.days); note(+el.dataset.days ? 'Featured for 7 days' : 'Removed from featured'); return refresh();
      case 'invite': await A.invite(id, el.dataset.v === '1'); return refresh();
      case 'copy': {
        const list = (S.data.waitlist || []).filter((r) => r.role === id && !r.invited).map((r) => r.phone).join('\n');
        try { await navigator.clipboard.writeText(list); note(list ? 'Numbers copied' : 'Nobody to copy'); } catch (e) { note('Copy is blocked here. Select the numbers in the table instead.'); }
        return render();
      }
    }
  }

  document.addEventListener('submit', async (e) => {
    if (e.target.id !== 'admin-login') return;
    e.preventDefault();
    const email = ($('#admin-email').value || '').trim().toLowerCase();
    const password = $('#admin-password').value || '';
    S.email = email;
    const button = $('#admin-submit');
    const error = $('#lerr');
    button.disabled = true; button.textContent = 'Signing in…';
    error.hidden = true;
    try {
      await API.authenticate(email, password, 'login');
      await afterLogin();
    } catch (err) {
      error.textContent = U.friendly(err);
      error.hidden = false;
      button.disabled = false; button.textContent = 'Sign in to dashboard';
    }
  });

  document.addEventListener('click', async (e) => {
    const forgot = e.target.closest('#admin-forgot');
    if (forgot) {
      const email = ($('#admin-email').value || '').trim().toLowerCase();
      const error = $('#lerr');
      if (!email) {
        error.textContent = 'Enter your email address above, then tap Forgot password again.';
        error.hidden = false;
        return;
      }
      forgot.disabled = true;
      forgot.textContent = 'Sending recovery email…';
      error.hidden = true;
      try {
        await API.requestPasswordReset(email);
        error.textContent = 'If this email belongs to an account, Supabase will send a password-reset link. Check your inbox and Spam folder.';
        error.hidden = false;
        error.style.color = 'var(--good)';
      } catch (err) {
        error.textContent = U.friendly(err);
        error.hidden = false;
      } finally {
        forgot.disabled = false;
        forgot.textContent = 'Forgot password?';
      }
      return;
    }
    const tabBtn = e.target.closest('[data-tab]');
    if (tabBtn) { S.tab = tabBtn.dataset.tab; render(); try { await LOAD[S.tab](); } catch (err) { note(U.friendly(err)); } render(); return; }
    const t = e.target.closest('[data-act]'); if (!t) return;
    try { await act(t.dataset.act, t.dataset.id, t); } catch (err) { note(U.friendly(err)); render(); }
  });
  let timer = null;
  document.addEventListener('input', (e) => {
    if (e.target.id !== 'uq') return;
    S.q = e.target.value; clearTimeout(timer);
    timer = setTimeout(async () => { try { S.data.users = await A.users(S.q); } catch (err) { note(U.friendly(err)); } render(); }, 250);
  });

  (async function start() {
    $('#demo').hidden = !DEMO;
    try { await API.init(); if (API.session()) await afterLogin(); else render(); }
    catch (e) { app.innerHTML = `<div class="login"><h1>Meet GH Admin</h1><p class="err">Could not start: ${esc(U.friendly(e))}</p></div>`; }
  })();
})();

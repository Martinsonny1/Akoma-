// Meet GH one-to-one LiveKit calling.
// UI events are installed once at module load; signalling subscriptions are managed separately.
// Load LiveKit asynchronously so a CDN/network failure cannot disable call-button events.
  let LiveKit = null;
  let liveKitLoadError = null;
  const liveKitReady = import('https://cdn.jsdelivr.net/npm/livekit-client@2.15.6/+esm')
    .then(mod => { LiveKit = mod; return mod; })
    .catch(err => { liveKitLoadError = err; console.error('Meet GH LiveKit SDK failed to load:', err); return null; });
(() => {
  'use strict';
  const API = () => window.API_SB;
  let unsubscribe = null;
  let active = null;
  let room = null;
  let muted = false;
  let cameraOff = false;
  let speakerOn = true;
  let timer = null;
  let ringTimer = null;
  let startedAt = 0;
  let handlingAction = false;

  const remoteAudio = new Set();

  // Web Audio feedback. Audio is unlocked by the user's first interaction,
  // as required by mobile browsers; tones never rely on external media files.
  const Sound = (() => {
    let ctx = null, timer = null, kind = null;
    const defaults = { calls: true, messages: true, matches: true, ringtone: 'classic' };
    let prefs = { ...defaults };
    try { prefs = { ...defaults, ...JSON.parse(localStorage.getItem('akoma_sound_preferences') || '{}') }; } catch (_) {}
    function save() { try { localStorage.setItem('akoma_sound_preferences', JSON.stringify(prefs)); } catch (_) {} }
    function context() {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      if (!ctx) ctx = new Ctx();
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return ctx;
    }
    function tone(freq, duration, volume = 0.12, type = 'sine', delay = 0) {
      const c = context(); if (!c) return;
      const start = c.currentTime + delay;
      const osc = c.createOscillator(), gain = c.createGain();
      osc.type = type; osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.001, volume), start + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      osc.connect(gain); gain.connect(c.destination);
      osc.start(start); osc.stop(start + duration + 0.03);
    }
    function pattern(name) {
      if (name === 'incoming') {
        if (prefs.ringtone === 'gentle') { tone(523.25,.32,.13); tone(659.25,.42,.12,'sine',.38); }
        else if (prefs.ringtone === 'digital') { tone(784,.16,.12,'triangle'); tone(988,.16,.12,'triangle',.2); tone(784,.16,.12,'triangle',.42); }
        else { tone(440,.42,.16); tone(554.37,.42,.14,'sine',.46); }
      } else if (name === 'outgoing') {
        tone(425,1.1,.09); tone(480,1.1,.08,'sine',.04);
      } else if (name === 'connected') {
        tone(660,.12,.10); tone(880,.16,.10,'sine',.14);
      } else if (name === 'ended') {
        tone(520,.12,.08); tone(390,.22,.08,'sine',.14);
      } else if (name === 'message') {
        tone(740,.10,.055); tone(988,.13,.05,'sine',.11);
      } else if (name === 'match') {
        tone(659.25,.16,.09); tone(783.99,.16,.09,'sine',.17); tone(987.77,.28,.10,'sine',.34);
      }
    }
    function allowed(name) {
      if (['incoming','outgoing','connected','ended'].includes(name)) return prefs.calls;
      if (name === 'message') return prefs.messages;
      if (name === 'match') return prefs.matches;
      return true;
    }
    function stop() { if (timer) clearInterval(timer); timer = null; kind = null; }
    function loop(name, interval) {
      stop(); if (!allowed(name)) return;
      kind = name; pattern(name);
      timer = setInterval(() => { if (kind === name) pattern(name); }, interval);
    }
    function play(name) { stop(); if (allowed(name)) pattern(name); }
    function unlock() { const c = context(); if (c?.state === 'suspended') c.resume().catch(() => {}); }
    function setPreference(key, value) {
      if (!(key in prefs)) return;
      prefs[key] = value; save();
      if (key === 'calls' && !value) stop();
    }
    document.addEventListener('click', unlock, { passive: true });
    document.addEventListener('touchend', unlock, { passive: true });
    return {
      loop, play, stop, unlock,
      preferences: () => ({ ...prefs }),
      setPreference,
      previewRingtone: () => { stop(); pattern('incoming'); },
      setEnabled(v) { setPreference('calls', !!v); setPreference('messages', !!v); setPreference('matches', !!v); }
    };
  })();
  window.AkomaSounds = Sound;

  const el = (tag, attrs = {}, html = '') => {
    const n = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => k === 'class' ? n.className = v : n.setAttribute(k, v));
    n.innerHTML = html;
    return n;
  };
  const svg = d => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICON_FS = svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>');
  const ICON_EXIT = svg('<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>');
  const ICON_MAX = svg('<path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/>');
  const escapeHtml = s => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function ensureLayer() {
    let n = document.getElementById('ak-call-layer');
    if (!n) { n = el('div', { id: 'ak-call-layer' }); document.body.appendChild(n); }
    return n;
  }
  function setStatus(s) {
    const n = document.querySelector('#ak-call-layer .ak-call-status');
    if (n) n.textContent = s;
  }
  function setBusy(busy, label) {
    const layer = ensureLayer();
    layer.querySelectorAll('[data-call-ui]').forEach(b => {
      if (['hide','fullscreen','maximise'].includes(b.dataset.callUi)) return;
      b.disabled = !!busy;
      b.setAttribute('aria-busy', busy ? 'true' : 'false');
    });
    if (label) setStatus(label);
  }
  function paint(call, state) {
    active = call;
    const layer = ensureLayer();
    const isVideo = call.call_type === 'video';
    const name = call.peer_name || 'Meet GH match';
    const connected = !!room;
    const immersive = layer.classList.contains('immersive');
    const incoming = !!call.incoming;
    const outgoing = !incoming && state === 'Calling…';
    layer.innerHTML = `<section class="ak-call-card ${isVideo ? 'is-video' : ''}${isVideo && connected ? ' is-connected' : ''}" role="dialog" aria-modal="true" aria-label="${isVideo ? 'Video' : 'Voice'} call">
      <div class="ak-call-top"><span class="ak-call-brand">MEET GH</span><button type="button" class="ak-call-min" data-call-ui="hide" aria-label="Minimise call">⌄</button></div>
      <div class="ak-remote-video" id="ak-remote-video"></div><div class="ak-self-video" id="ak-self-video"></div>
      <div class="ak-call-avatar">${isVideo ? '▣' : '♡'}</div><h2>${escapeHtml(name)}</h2>
      <p class="ak-call-status" aria-live="polite">${escapeHtml(state)}</p><div class="ak-call-clock" id="ak-call-clock"></div>
      <div class="ak-call-actions">
        ${incoming ? `<button type="button" class="ak-call-answer" data-call-ui="accept">Answer</button><button type="button" class="ak-call-decline" data-call-ui="decline">Decline</button><button type="button" class="ak-call-control" data-call-ui="block">Block caller</button>` : ''}
        ${outgoing ? `<button type="button" class="ak-call-decline" data-call-ui="hangup">Cancel call</button>` : ''}
        ${connected ? `<button type="button" data-call-ui="mute" class="ak-call-control">${muted ? 'Unmute' : 'Mute'}</button>` : ''}
        ${connected && isVideo ? `<button type="button" data-call-ui="camera" class="ak-call-control">${cameraOff ? 'Camera on' : 'Camera off'}</button>` : ''}
        ${connected ? `<button type="button" data-call-ui="speaker" class="ak-call-control ${speakerOn ? 'selected' : ''}">${speakerOn ? 'Speaker on' : 'Speaker off'}</button><button type="button" class="ak-call-decline" data-call-ui="hangup">End call</button>` : ''}
      </div><p class="ak-call-disclaimer">Calls are not recorded. Use block/report if you feel unsafe.</p>
      ${isVideo ? `<button type="button" class="ak-call-fs" data-call-ui="fullscreen" aria-pressed="${immersive}" aria-label="${immersive ? 'Exit fullscreen' : 'Fullscreen'}">${immersive ? ICON_EXIT : ICON_FS}</button>` : ''}
      <button type="button" class="ak-call-max" data-call-ui="maximise" aria-label="Maximise call">${ICON_MAX}</button>
    </section>`;
    layer.classList.add('visible');
  }
  function closeLayer() {
    const layer = document.getElementById('ak-call-layer');
    if (layer) { layer.classList.remove('visible', 'minimised', 'immersive'); layer.innerHTML = ''; }
    if (document.fullscreenElement) { try { document.exitFullscreen(); } catch (_) {} }
  }
  async function setImmersive(on) {
    const layer = document.getElementById('ak-call-layer');
    if (!layer || !active) return;
    layer.classList.toggle('immersive', on);
    layer.classList.remove('minimised');
    // Native fullscreen where supported (not iOS Safari); the CSS mode above works everywhere.
    try {
      if (on && !document.fullscreenElement && layer.requestFullscreen) await layer.requestFullscreen();
      if (!on && document.fullscreenElement) await document.exitFullscreen();
    } catch (_) {}
    const b = layer.querySelector('.ak-call-fs');
    if (b) { b.innerHTML = on ? ICON_EXIT : ICON_FS; b.setAttribute('aria-pressed', String(on)); b.setAttribute('aria-label', on ? 'Exit fullscreen' : 'Fullscreen'); }
  }
  function clockStart() {
    startedAt = Date.now(); clearInterval(timer);
    timer = setInterval(() => {
      const n = document.getElementById('ak-call-clock');
      if (n) { const sec = Math.floor((Date.now() - startedAt) / 1000); n.textContent = String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0'); }
    }, 1000);
  }
  function applySpeakerState() {
    remoteAudio.forEach(a => { a.muted = !speakerOn; });
    document.querySelectorAll('#ak-call-layer audio').forEach(a => { a.muted = !speakerOn; });
  }
  async function connect(tokenData, call) {
    const sdk = await liveKitReady;
    if (!sdk) throw new Error('The calling library could not load. Check your internet connection or CDN access, then reload Meet GH.');
    if (!tokenData?.token || !tokenData?.server_url) throw new Error('The calling server did not return a valid LiveKit connection token.');
    if (room) { try { await room.disconnect(); } catch (_) {} }
    const { Room, RoomEvent, Track } = sdk;
    room = new Room({ adaptiveStream: true, dynacast: true });
    room.on(RoomEvent.TrackSubscribed, (track) => {
      if (track.kind === Track.Kind.Video) {
        const target = document.getElementById('ak-remote-video');
        if (target) { target.innerHTML = ''; target.appendChild(track.attach()); }
      } else if (track.kind === Track.Kind.Audio) {
        const node = track.attach();
        node.muted = !speakerOn;
        remoteAudio.add(node);
        document.body.appendChild(node);
      }
    });
    room.on(RoomEvent.TrackUnsubscribed, track => track.detach().forEach(node => { remoteAudio.delete(node); node.remove(); }));
    room.on(RoomEvent.Disconnected, () => { if (active) { setStatus('Call disconnected'); finishLocal(); } });
    room.on(RoomEvent.Reconnecting, () => setStatus('Reconnecting…'));
    room.on(RoomEvent.Reconnected, () => setStatus('Connected'));
    setStatus('Connecting…');
    await room.connect(tokenData.server_url, tokenData.token, { autoSubscribe: true });
    muted = false; cameraOff = false; speakerOn = true;
    // Render the connected UI first: paint() rebuilds the DOM and would wipe any video attached earlier.
    paint(call, 'Connected');
    Sound.play('connected');
    await room.localParticipant.setMicrophoneEnabled(true);
    if (call.call_type === 'video') {
      await room.localParticipant.setCameraEnabled(true);
      const pub = room.localParticipant.getTrackPublication(Track.Source.Camera);
      if (pub?.track) { const node = pub.track.attach(); const box = document.getElementById('ak-self-video'); if (box) box.appendChild(node); }
      // Re-attach any remote video that arrived before the UI was repainted.
      room.remoteParticipants.forEach(part => part.trackPublications.forEach(pub => {
        if (pub.track && pub.track.kind === Track.Kind.Video) {
          const target = document.getElementById('ak-remote-video');
          if (target) { target.innerHTML = ''; target.appendChild(pub.track.attach()); }
        }
      }));
    }
    applySpeakerState();
    clockStart();
  }
  async function callAction(payload) {
    if (!API()?.callRequest) throw new Error('Meet GH calling service is not ready. Please refresh and try again.');
    return API().callRequest(payload);
  }
  async function startCall(type) {
    const chat = window.AKOMA_CURRENT_MATCH;
    if (!chat?.id) { alert('Open a matched conversation before calling.'); return; }
    if (!navigator.mediaDevices?.getUserMedia) { alert('Calls need HTTPS and a browser with microphone/camera support.'); return; }
    if (active) { alert('You already have a call in progress.'); return; }
    try {
      const test = await navigator.mediaDevices.getUserMedia({ audio: true, video: type === 'video' });
      test.getTracks().forEach(t => t.stop());
      const result = await callAction({ action: 'start', match_id: chat.id, call_type: type });
      const call = { ...result.call, incoming: false, peer_name: chat.name };
      paint(call, 'Calling…');
      Sound.loop('outgoing', 3000);
      const callId = call.id;
      clearTimeout(ringTimer);
      ringTimer = setTimeout(async () => {
        if (active?.id === callId && !room) {
          try { await callAction({ action: 'miss', call_id: callId }); } catch (_) {}
          finishLocal();
        }
      }, 45000);
    } catch (e) { alert(e.message || 'Could not start call.'); }
  }
  async function acceptCall() {
    if (!active || handlingAction) return;
    handlingAction = true;
    Sound.stop();
    clearTimeout(ringTimer); ringTimer = null;
    setBusy(true, 'Answering…');
    try {
      // Keep the incoming state until the server confirms acceptance.
      const call = active;
      const result = await callAction({ action: 'respond', call_id: call.id, reason: 'accept' });
      call.incoming = false;
      await connect(result, call);
    } catch (e) {
      setBusy(false);
      setStatus('Could not answer: ' + (e.message || 'Unknown error'));
      const layer = document.getElementById('ak-call-layer');
      if (layer && active) {
        const actions = layer.querySelector('.ak-call-actions');
        if (actions && !actions.querySelector('[data-call-ui="accept"]')) {
          const b = el('button', { type: 'button', class: 'ak-call-answer', 'data-call-ui': 'accept' }, 'Try again');
          actions.prepend(b);
        }
      }
    } finally { handlingAction = false; }
  }
  async function blockCaller() {
    if (!active || !active.incoming || handlingAction) return;
    const callerId = active.caller_id;
    if (!callerId || !API()?.report) { setStatus('Unable to block this caller right now.'); return; }
    if (!confirm('Block this caller and report the call? They will no longer be able to contact you.')) return;
    handlingAction = true; setBusy(true, 'Blocking caller…');
    try {
      await API().report({ target: callerId, reason: 'Harassment', details: 'Blocked from the incoming call screen.', block: true });
      await finishLocal();
      alert('Caller blocked.');
    } catch (e) {
      setBusy(false); setStatus('Could not block caller: ' + (e.message || 'Please try again.'));
    } finally { handlingAction = false; }
  }
  async function declineCall() {
    if (!active || handlingAction) return;
    Sound.stop();
    handlingAction = true; setBusy(true, 'Declining…');
    try { await callAction({ action: 'respond', call_id: active.id, reason: 'decline' }); }
    catch (e) { console.warn('Meet GH decline failed:', e); }
    finally { handlingAction = false; await finishLocal(); }
  }
  async function hangup() {
    if (!active || handlingAction) return;
    Sound.stop();
    const c = active; handlingAction = true; setBusy(true, 'Ending call…');
    try { await callAction({ action: 'end', call_id: c.id, reason: 'hangup' }); }
    catch (e) { console.warn('Meet GH end call failed:', e); }
    finally { handlingAction = false; await finishLocal(); }
  }
  async function finishLocal() {
    Sound.stop();
    clearTimeout(ringTimer); ringTimer = null; clearInterval(timer); timer = null;
    if (room) { try { await room.disconnect(); } catch (_) {} room = null; }
    remoteAudio.forEach(node => { try { node.remove(); } catch (_) {} }); remoteAudio.clear();
    active = null; handlingAction = false; muted = false; cameraOff = false; speakerOn = true;
    closeLayer();
  }
  async function incoming(row) {
    if (!row || row.status !== 'ringing' || row.recipient_id !== API()?.session?.()?.userId || active) return;
    const matches = await API().matches().catch(() => []);
    const match = matches.find(m => m.id === row.match_id);
    const call = { ...row, incoming: true, peer_name: match?.other?.name || 'Your match' };
    paint(call, 'Incoming ' + (row.call_type === 'video' ? 'video' : 'voice') + ' call');
    Sound.loop('incoming', 2400);
    clearTimeout(ringTimer);
    ringTimer = setTimeout(async () => {
      if (active?.id === row.id && active.incoming) {
        try { await callAction({ action: 'miss', call_id: row.id }); } catch (_) {}
        finishLocal();
      }
    }, 45000);
  }
  async function onCallChange(payload) {
    const row = payload?.new;
    if (!row) return;
    if (row.status === 'ringing' && row.recipient_id === API()?.session?.()?.userId) { await incoming(row); return; }
    if (active && row.id === active.id) {
      if (row.status === 'accepted' && !active.incoming && !room) {
        Sound.stop();
        clearTimeout(ringTimer);
        try { const token = await callAction({ action: 'token', call_id: row.id }); await connect(token, active); }
        catch (e) { alert(e.message || 'Could not connect call.'); finishLocal(); }
      } else if (['declined', 'missed', 'ended', 'failed'].includes(row.status)) {
        setStatus(row.status === 'declined' ? 'Call declined' : row.status === 'missed' ? 'No answer' : 'Call ended');
        Sound.stop(); Sound.play('ended');
        setTimeout(finishLocal, 1400);
      }
    }
  }

  // Install UI delegation immediately, independently of authentication/subscription timing.
  document.addEventListener('click', async e => {
    const target = e.target instanceof Element ? e.target : e.target?.parentElement;
    if (!target) return;
    const start = target.closest('[data-ak-call]');
    if (start) { e.preventDefault(); startCall(start.dataset.akCall); return; }
    const control = target.closest('[data-call-ui]');
    if (!control) return;
    e.preventDefault();
    const action = control.dataset.callUi;
    try {
      if (action === 'accept') return await acceptCall();
      if (action === 'decline') return await declineCall();
      if (action === 'block') return await blockCaller();
      if (action === 'hangup') return await hangup();
      if (action === 'fullscreen') { const layer = document.getElementById('ak-call-layer'); await setImmersive(!layer?.classList.contains('immersive')); return; }
      if (action === 'maximise') { document.getElementById('ak-call-layer')?.classList.remove('minimised'); return; }
      if (action === 'hide') { document.getElementById('ak-call-layer')?.classList.toggle('minimised'); return; }
      if (action === 'mute' && room) {
        muted = !muted; await room.localParticipant.setMicrophoneEnabled(!muted);
        control.textContent = muted ? 'Unmute' : 'Mute'; control.classList.toggle('selected', muted); return;
      }
      if (action === 'camera' && room) {
        cameraOff = !cameraOff; await room.localParticipant.setCameraEnabled(!cameraOff);
        control.textContent = cameraOff ? 'Camera on' : 'Camera off'; control.classList.toggle('selected', cameraOff); return;
      }
      if (action === 'speaker' && room) {
        speakerOn = !speakerOn; applySpeakerState();
        control.textContent = speakerOn ? 'Speaker on' : 'Speaker off'; control.classList.toggle('selected', speakerOn); return;
      }
    } catch (err) {
      console.error('Meet GH call control failed:', err);
      setStatus(err?.message || 'That call control could not be applied.');
    }
  });

  document.addEventListener('fullscreenchange', () => {
    const layer = document.getElementById('ak-call-layer');
    if (!document.fullscreenElement && layer?.classList.contains('immersive')) setImmersive(false);
  });

  function installSubscription() {
    const api = API();
    const session = api?.session?.();
    if (!session?.userId || !api?.callSubscribe) return;
    if (unsubscribe) unsubscribe();
    unsubscribe = api.callSubscribe(session.userId, onCallChange);
  }
  window.addEventListener('akoma:ready', installSubscription);
  window.addEventListener('akoma:auth', () => {
    if (API()?.session?.()) installSubscription();
    else { if (unsubscribe) unsubscribe(); unsubscribe = null; finishLocal(); }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && API()?.session?.() && !unsubscribe) installSubscription();
  });
  // If auth completed before this module registered its event listeners, subscribe now.
  if (API()?.session?.()) installSubscription();
  window.AkomaCalls = {
    start: startCall,
    hangup,
    endIfMatch: async matchId => { if (active && active.match_id === matchId) await hangup(); },
  };
})();

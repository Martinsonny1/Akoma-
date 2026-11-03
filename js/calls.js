// Akoma one-to-one LiveKit calling. Requires a secure HTTPS origin and Supabase Edge Function.
import { Room, RoomEvent, Track } from 'https://cdn.jsdelivr.net/npm/livekit-client@2.15.6/+esm';
(() => {
  'use strict';
  const API = () => window.API_SB;
  let unsubscribe = null, active = null, room = null, muted = false, cameraOff = false, timer = null, ringTimer = null, startedAt = 0;
  const el = (tag, attrs = {}, html = '') => { const n = document.createElement(tag); Object.entries(attrs).forEach(([k,v]) => k === 'class' ? n.className = v : n.setAttribute(k,v)); n.innerHTML = html; return n; };
  const escapeHtml = s => String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function ensureLayer() { let n = document.getElementById('ak-call-layer'); if (!n) { n = el('div',{id:'ak-call-layer'}); document.body.appendChild(n); } return n; }
  function setStatus(s) { const n = document.querySelector('#ak-call-layer .ak-call-status'); if (n) n.textContent = s; }
  function paint(call, state) {
    active = call;
    const layer = ensureLayer();
    const isVideo = call.call_type === 'video';
    const name = call.peer_name || 'Akoma match';
    layer.innerHTML = `<section class="ak-call-card ${isVideo?'is-video':''}">
      <div class="ak-call-top"><span class="ak-call-brand">AKOMA</span><button class="ak-call-min" data-call-ui="hide" aria-label="Minimise">⌄</button></div>
      <div class="ak-remote-video" id="ak-remote-video"></div><div class="ak-self-video" id="ak-self-video"></div>
      <div class="ak-call-avatar">${isVideo?'▣':'♡'}</div><h2>${escapeHtml(name)}</h2>
      <p class="ak-call-status">${escapeHtml(state)}</p><div class="ak-call-clock" id="ak-call-clock"></div>
      <div class="ak-call-actions">
        ${call.incoming ? `<button class="ak-call-answer" data-call-ui="accept">Answer</button><button class="ak-call-decline" data-call-ui="decline">Decline</button>` : ''}
        ${!call.incoming && state === 'Calling…' ? `<button class="ak-call-decline" data-call-ui="hangup">Cancel call</button>` : ''}
        <button data-call-ui="mute" class="ak-call-control">${muted?'Unmute':'Mute'}</button>
        ${isVideo ? `<button data-call-ui="camera" class="ak-call-control">Camera off</button>` : ''}
        <button data-call-ui="speaker" class="ak-call-control">Speaker</button>
        ${state === 'Connected' || state === 'Reconnecting…' ? `<button data-call-ui="hangup" class="ak-call-decline">End call</button>` : ''}
      </div><p class="ak-call-disclaimer">Calls are not recorded. Use block/report if you feel unsafe.</p>
    </section>`;
    layer.classList.add('visible');
  }
  function closeLayer() { const layer = document.getElementById('ak-call-layer'); if (layer) { layer.classList.remove('visible'); layer.innerHTML = ''; } }
  function clockStart() { startedAt = Date.now(); clearInterval(timer); timer = setInterval(() => { const n=document.getElementById('ak-call-clock'); if(n){const sec=Math.floor((Date.now()-startedAt)/1000); n.textContent=String(Math.floor(sec/60)).padStart(2,'0')+':'+String(sec%60).padStart(2,'0');}},1000); }
  async function connect(tokenData, call) {
    if (room) { try { await room.disconnect(); } catch (_) {} }
    room = new Room({ adaptiveStream: true, dynacast: true });
    room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      const target = track.kind === Track.Kind.Video ? document.getElementById('ak-remote-video') : null;
      if (target) { target.innerHTML=''; target.appendChild(track.attach()); }
      if (track.kind === Track.Kind.Audio) document.body.appendChild(track.attach());
    });
    room.on(RoomEvent.TrackUnsubscribed, track => track.detach().forEach(n=>n.remove()));
    room.on(RoomEvent.Disconnected, () => { if (active) { setStatus('Call disconnected'); finishLocal(); } });
    room.on(RoomEvent.Reconnecting, () => setStatus('Reconnecting…'));
    room.on(RoomEvent.Reconnected, () => setStatus('Connected'));
    setStatus('Connecting…');
    await room.connect(tokenData.server_url, tokenData.token, { autoSubscribe: true });
    await room.localParticipant.setMicrophoneEnabled(true);
    if (call.call_type === 'video') {
      await room.localParticipant.setCameraEnabled(true);
      const pub = room.localParticipant.getTrackPublication(Track.Source.Camera);
      if (pub?.track) { const node=pub.track.attach(); const box=document.getElementById('ak-self-video'); if(box) box.appendChild(node); }
    }
    setStatus('Connected'); clockStart();
  }
  async function callAction(payload) { return API().callRequest(payload); }
  async function startCall(type) {
    const chat = window.AKOMA_CURRENT_MATCH;
    if (!chat) { alert('Open a matched conversation before calling.'); return; }
    if (!navigator.mediaDevices?.getUserMedia) { alert('Calls need HTTPS and a browser with microphone/camera support.'); return; }
    try {
      // Request permission before ringing so the user can see and resolve browser permission prompts.
      const test = await navigator.mediaDevices.getUserMedia({audio:true, video:type==='video'}); test.getTracks().forEach(t=>t.stop());
      const result = await callAction({action:'start',match_id:chat.id,call_type:type});
      const call = {...result.call, incoming:false, peer_name:chat.name};
      paint(call,'Calling…');
      const callId = call.id;
      const expiry = setTimeout(async()=>{ if(active?.id===callId && !room){ try{await callAction({action:'miss',call_id:callId});}catch(_){} closeLayer(); active=null; } },45000);
      call._expiry = expiry;
    } catch (e) { alert(e.message || 'Could not start call.'); }
  }
  async function acceptCall() {
    if (!active) return;
    clearTimeout(ringTimer); ringTimer = null; active.incoming = false;
    try {
      const result = await callAction({action:'respond',call_id:active.id,reason:'accept'});
      await connect(result,active);
    } catch(e) { alert(e.message || 'Could not answer call.'); closeLayer(); active=null; }
  }
  async function declineCall() { if(!active)return; try{await callAction({action:'respond',call_id:active.id,reason:'decline'});}catch(_){} closeLayer(); active=null; }
  async function hangup() { if(!active)return; const c=active; try{await callAction({action:'end',call_id:c.id,reason:'hangup'});}catch(_){} finishLocal(); }
  async function finishLocal() { clearTimeout(ringTimer); ringTimer=null; clearInterval(timer); timer=null; if(room){try{await room.disconnect();}catch(_){} room=null;} active=null; closeLayer(); }
  async function incoming(row) {
    if (!row || row.status !== 'ringing' || row.recipient_id !== API().session()?.userId || active) return;
    // Fetch a friendly name from the currently loaded chat/match list if available.
    const matches = await API().matches().catch(()=>[]); const match = matches.find(m=>m.id===row.match_id);
    const call = {...row,incoming:true,peer_name:match?.other?.name || 'Your match'};
    paint(call,'Incoming '+(row.call_type==='video'?'video':'voice')+' call');
    clearTimeout(ringTimer); ringTimer=setTimeout(async()=>{if(active?.id===row.id && active.incoming){try{await callAction({action:'miss',call_id:row.id});}catch(_){} closeLayer();active=null;}},45000);
  }
  async function onCallChange(payload) {
    const row=payload.new; if(!row)return;
    if(row.status==='ringing' && row.recipient_id===API().session()?.userId){ await incoming(row); return; }
    if(active && row.id===active.id){
      if(row.status==='accepted' && !active.incoming && !room){ clearTimeout(active._expiry); try{const token=await callAction({action:'token',call_id:row.id}); await connect(token,active);}catch(e){alert(e.message||'Could not connect call.');finishLocal();} }
      else if(['declined','missed','ended','failed'].includes(row.status)){ setStatus(row.status==='declined'?'Call declined':row.status==='missed'?'No answer':'Call ended'); setTimeout(finishLocal,1400); }
    }
  }
  function install() {
    if (!API()?.session?.()) return;
    if (unsubscribe) unsubscribe();
    unsubscribe = API().callSubscribe(API().session().userId,onCallChange);
    document.addEventListener('click', async e=>{
      const start=e.target.closest('[data-ak-call]'); if(start){e.preventDefault(); startCall(start.dataset.akCall);return;}
      const control=e.target.closest('[data-call-ui]'); if(!control)return;
      const action=control.dataset.callUi;
      if(action==='accept') return acceptCall(); if(action==='decline') return declineCall(); if(action==='hangup') return hangup();
      if(action==='hide'){document.getElementById('ak-call-layer')?.classList.toggle('minimised');return;}
      if(action==='mute' && room){muted=!muted;await room.localParticipant.setMicrophoneEnabled(!muted);control.textContent=muted?'Unmute':'Mute';}
      if(action==='camera' && room){cameraOff=!cameraOff;await room.localParticipant.setCameraEnabled(!cameraOff);control.textContent=cameraOff?'Camera on':'Camera off';}
      if(action==='speaker'){document.querySelectorAll('#ak-call-layer audio').forEach(a=>a.muted=!a.muted);control.classList.toggle('selected');}
    });
  }
  window.addEventListener('akoma:ready',install);
  window.addEventListener('akoma:auth',()=>{ if(API()?.session?.()) install(); else { if(unsubscribe) unsubscribe(); unsubscribe=null; finishLocal(); } });
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible' && API()?.session?.() && !unsubscribe)install();});
  // app.js sets this when it opens a matched chat; name/id are used for call start UI only.
  const watchChat = () => { const old=window.openChat; if(old&&!old.__akWrapped){window.openChat=async(...args)=>{const r=await old(...args);return r;};window.openChat.__akWrapped=true;} };
  watchChat();
  window.AkomaCalls={start:startCall,hangup,endIfMatch:async(matchId)=>{if(active && active.match_id===matchId) await hangup();}};
})();

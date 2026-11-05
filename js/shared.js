// Helpers shared by the member app, the admin dashboard and the waitlist page.
window.AkomaUtil = (function () {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const hue = (id) => { let h = 0; for (const c of String(id || 'x')) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };

  // Same rules as supabase/schema.sql, so people get instant feedback.
  const MONEY = /(momo|mobile money|send (me )?(some )?money|airtime|cedis|ghs|gh₵|western union|bitcoin|crypto|gift ?card|emergency|per hour|per night|my rates?|escort|sugar ?(mummy|mama|daddy)|hook ?up|one night)/i;
  const CONTACT = /(https?:\/\/|www\.|\.com|\.gh\b|wa\.me|whatsapp|telegram|instagram|snapchat|@[a-z0-9_.]{3,})/i;
  const DIGITS = /(\+?[0-9][ .()-]*){9,}/;
  const hasMoney = (t) => MONEY.test(t || '');
  const hasContact = (t) => CONTACT.test(t || '') || DIGITS.test(t || '');

  const ERRORS = {
    subscription_required: 'Subscribe to send message requests.',
    daily_limit: "You have used today's message requests. Try again tomorrow.",
    already_requested: 'You already sent her a request.',
    already_matched: 'You are already matched. Open the chat.',
    blocked: 'You can no longer contact this person.',
    contact_not_allowed: 'Phone numbers, links and social handles are not allowed here.',
    money_not_allowed: 'This cannot ask for money, airtime or gifts.',
    bad_length: 'Check the length of your message.',
    not_allowed: 'That is not available for your account.',
    not_found: 'That person or item is no longer available.',
    bio_not_allowed: 'Your bio cannot include contact details or requests for money.',
    bad_photo_path: 'That photo could not be used. Try another.',
    bad_id_path: 'Your ID photo could not be verified. Upload it again.',
    delete_failed: 'Your account could not be fully deleted. Please try again.',
    id_required: 'This member has no readable ID file uploaded yet.',
    too_many_photos: 'You can add up to 6 photos.',
    bad_code: 'Enter the 6-digit code.',
    bad_phone: 'Enter a valid Ghana mobile number.',
    script_load_failed: 'Could not load the sign-in service. Check your internet connection and refresh the page.',
    'Invalid login credentials': 'The email or password is incorrect. Check both and try again.',
    'Email not confirmed': 'Please confirm your email address using the link we sent you, then sign in.',
    'User already registered': 'An account already exists with this email. Choose Sign in instead.',
    'Password should be at least': 'Choose a password with at least 8 characters.',
    'For security purposes': 'Too many attempts. Wait a little and try again.',
    'Email rate limit exceeded': 'Too many confirmation emails were requested. Wait a few minutes before trying again.',
    payment_cancelled: 'Payment was cancelled.',
    payment_timeout: 'We have not received the payment yet. If you were charged, it will appear shortly.'
  };
  const friendly = (e) => {
    const m = (e && e.message) || String(e || '');
    if (ERRORS[m]) return ERRORS[m];
    for (const k of Object.keys(ERRORS)) if (m.includes(k)) return ERRORS[k];
    if (/invalid login credentials/i.test(m)) return ERRORS['Invalid login credentials'];
    if (/email not confirmed/i.test(m)) return ERRORS['Email not confirmed'];
    if (/user already registered/i.test(m)) return ERRORS['User already registered'];
    if (/password should be at least/i.test(m)) return ERRORS['Password should be at least'];
    if (/rate limit exceeded|security purposes/i.test(m)) return /email rate limit/i.test(m) ? ERRORS['Email rate limit exceeded'] : ERRORS['For security purposes'];
    if (/failed to fetch|network|load failed/i.test(m)) return 'No connection. Check your data and try again.';
    // Surface Supabase's actionable auth message instead of hiding every failure behind a generic alert.
    if (/auth|email|password|signup|sign.?in|confirmation/i.test(m) && m.length < 180) return m;
    return 'Something went wrong. Please try again.';
  };

  const LOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';

  // Round avatar: photo if allowed, a blurred lock if she hid it, else her initial.
  function avatar(p, size, square) {
    size = size || 48;
    const h = hue(p.id || p.name);
    const cls = 'av' + (square ? ' sq' : '') + (p.photo_hidden ? ' hid' : '') + (p.looking_tonight ? ' tonight-ring' : '');
    const initial = esc((p.name || '?').trim().charAt(0).toUpperCase());
    const url = !p.photo_hidden && p.photos && p.photos[0];
    const inner = url
      ? `<img src="${esc(url)}" alt="${esc(p.name)}" loading="lazy">`
      : `<span>${initial}</span>${p.photo_hidden ? LOCK : ''}`;
    return `<div class="${cls}" style="--h:${h};--s:${size}px">${inner}</div>`;
  }

  function timeAgo(iso) {
    const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'Just now';
    if (s < 3600) return Math.floor(s / 60) + ' min ago';
    if (s < 86400) return Math.floor(s / 3600) + ' h ago';
    if (s < 172800) return 'Yesterday';
    if (s < 604800) return Math.floor(s / 86400) + ' days ago';
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }
  const clock = (iso) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const money = (n) => 'GHS ' + Number(n).toLocaleString('en-GB', { maximumFractionDigits: 2 });

  // Shrink photos before upload: smaller, faster on mobile data.
  async function compressImage(file, maxDim, quality) {
    maxDim = maxDim || 1080; quality = quality || 0.82;
    let bmp;
    try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch (e) {
      bmp = await new Promise((res, rej) => {
        const img = new Image(); const url = URL.createObjectURL(file);
        img.onload = () => { URL.revokeObjectURL(url); res(img); };
        img.onerror = () => rej(new Error('bad_photo_path'));
        img.src = url;
      });
    }
    const w = bmp.width || bmp.naturalWidth, h = bmp.height || bmp.naturalHeight;
    const k = Math.min(1, maxDim / Math.max(w, h));
    const c = document.createElement('canvas');
    c.width = Math.round(w * k); c.height = Math.round(h * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('bad_photo_path'))), 'image/jpeg', quality));
  }
  const blobToDataURL = (blob) => new Promise((res, rej) => {
    const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob);
  });

  // Ghana mobile number -> +233XXXXXXXXX, or null if it does not look right.
  function normalizePhone(raw) {
    let d = String(raw || '').replace(/[^0-9+]/g, '');
    if (d.startsWith('+233')) d = d.slice(4);
    else if (d.startsWith('233')) d = d.slice(3);
    else if (d.startsWith('0')) d = d.slice(1);
    return /^[235][0-9]{8}$/.test(d) ? '+233' + d : null;
  }

  return { esc, hue, hasMoney, hasContact, friendly, avatar, timeAgo, clock, money, compressImage, blobToDataURL, normalizePhone, LOCK };
})();

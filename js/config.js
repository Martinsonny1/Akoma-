// Akoma settings. Leave SUPABASE_URL empty to run the built-in demo
// (data stays in this browser only). Fill the values in to go live.
window.AKOMA_CONFIG = {
  // From Supabase > Project Settings > API
  SUPABASE_URL: 'https://kphqgpdxcscjiylzuman.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_oIUJbnbOQMYu02Lrep93zA_ga6oHCZ9',
  // Add a VAPID public key after configuring the push-delivery Edge Function.
  VAPID_PUBLIC_KEY: 'BLKr-IjiU-BjP2-1n4KKdTmClbalBitdVO7lpWd4xIuC_gmwC5I_TiQKE6quIl4VHhtDTjEvNqYB-IjN8UiHKCM',

  // Payments are disabled: all member features are free.
  PAYMENTS_MODE: 'disabled',
  PAYSTACK_PUBLIC_KEY: '',

  // Shown on the Help page
  SUPPORT_WHATSAPP: '0256250046',
  SUPPORT_EMAIL: '',

  // All member features are free. No subscription or daily request limit.
};

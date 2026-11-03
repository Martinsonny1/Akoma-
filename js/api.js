// Picks the data layer: live Supabase when configured, otherwise the in-browser demo.
(function () {
  const C = window.AKOMA_CONFIG || {};
  const live = !!(C.SUPABASE_URL && C.SUPABASE_ANON_KEY);
  window.API = live ? window.API_SB : window.API_DEMO;
})();

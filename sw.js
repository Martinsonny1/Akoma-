// Keeps the app shell available when the connection is weak. Live data is never cached.
const CACHE = 'meetgh-shell-v21-push-toggle';
const SHELL = ['./', 'index.html', 'css/app.css', 'js/config.js', 'js/shared.js', 'js/api-demo.js', 'js/api-supabase.js', 'js/api.js', 'js/app.js', 'js/calls.js', 'icon.svg', 'manifest.webmanifest', 'privacy.html', 'terms.html', 'welcome.html', 'images/meet-gh-brand.png', 'images/welcome-heart-bg.jpg'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // Supabase, Paystack and fonts go straight to the network
  e.respondWith(
    fetch(e.request).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return res; })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('index.html')))
  );
});


self.addEventListener('push', (event) => {
  let data={title:'Meet GH',body:'You have a new update.',url:'/'};
  try { if(event.data) data={...data,...event.data.json()}; } catch (_) { if(event.data) data.body=event.data.text(); }
  event.waitUntil(self.registration.showNotification(data.title||'Meet GH',{
    body:data.body||'You have a new update.',icon:'icon-192.png',badge:'icon-192.png',
    tag:data.tag||'meetgh-update',silent:false,data:{url:data.url||'/'}
  }));
});
self.addEventListener('notificationclick',(event)=>{
  event.notification.close(); const target=new URL(event.notification.data?.url||'/',self.location.origin).href;
  event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{
    const match=list.find(c=>new URL(c.url).origin===self.location.origin);
    if(match){match.navigate(target);return match.focus();} return clients.openWindow(target);
  }));
});

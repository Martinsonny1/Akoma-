# Meet GH push notifications: setup (about 10 minutes, once)

What members get, even with the app closed: new message (text, photo, video, voice note), new match,
message request, request accepted, incoming call (rings until answered) and missed call, likes and comments
on their posts, Vault photo shared, profile approved or needs attention.
Admins also get: new member, new verification request, new report, photo post to review, new problem report.
No message text is ever shown on the lock screen (comments show a short preview).

## 1. Edge Function secrets
Supabase > Edge Functions > `push-delivery` > Secrets:
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (the public key must match `VAPID_PUBLIC_KEY` in `js/config.js`)
- `VAPID_SUBJECT` (e.g. `mailto:you@example.com`)
- `PUSH_WEBHOOK_SECRET` (any long random string)

## 2. Deploy the new function code
Paste `supabase/functions/push-delivery/index.ts` over the old function and deploy.

## 3. Run the SQL
1. Run `supabase/push_notifications_migration.sql` in the SQL editor.
2. Then run (with your values):
```sql
update public.push_config set
  function_url = 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/push-delivery',
  secret       = 'SAME_VALUE_AS_PUSH_WEBHOOK_SECRET'
where id = 1;
```
3. **Delete the old Database Webhooks** (messages, matches, calls) if you created them, or members get doubles.

## 4. Redeploy the site, then test
- Open the app on a phone: a "Turn on notifications" card appears. Tap it and allow.
- Admins: open the admin dashboard and tap "Turn on alerts".
- Close the app. From a second account, send a message, like a post, comment, call.

## Notes
- iPhones only get push after "Add to Home Screen" (iOS limitation).
- If someone taps "Not now" the card returns after 3 days. If they block notifications in the browser, only they can unblock it in browser/site settings.
- Calls: a push cannot guarantee ringing if the phone is off, offline or has battery restrictions.

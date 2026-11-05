# Deploy Meet GH's private media Edge Function

The app's private chat media and Vault previews use this function so each response can carry `Cache-Control: private, no-store` and so close-to-destroy media is removed through the Supabase Storage API.

## 1. Create the function

1. Open your Supabase project.
2. Go to **Edge Functions** and create a function named `media-lifecycle`.
3. Open `supabase/functions/media-lifecycle/index.ts` from this ZIP.
4. Copy its complete contents into the function editor and deploy it.
5. In the function's Secrets settings, add `CRON_SECRET` with a long random value. Keep it private.

The function uses Supabase's built-in `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` environment variables. Never put the service-role key in website JavaScript.

## 2. Run database migrations

Run the SQL migrations in this order, after your existing base schema:

1. `supabase/features_migration.sql` (nearby and online status, if not already applied)
2. `supabase/media_messaging_migration.sql` (media messaging, if not already applied)
3. `supabase/presence_vault_migration.sql` (Vault and Looking Tonight)
4. `supabase/security_hardening_migration.sql` (locks name/age after approval, validates ID file paths)

Re-deploy `media-lifecycle` after updating: it now also handles `delete-account`, which removes a member's ID, photos, vault and chat media from Storage before deleting the account.

Do not rerun `schema.sql` on a live database just to add these features.

## 3. Schedule physical media cleanup

The function deletes expired timed media and abandoned view-once media through the Storage API. Configure a scheduled POST every minute to:

`https://YOUR_PROJECT_REF.supabase.co/functions/v1/media-lifecycle`

Headers:

- `Content-Type: application/json`
- `x-cron-secret: YOUR_CRON_SECRET`

JSON body:

```json
{"action":"cleanup"}
```

Use Supabase Cron with `pg_net`, or an external scheduler. Do not expose the cron secret in frontend code. Do not schedule the old SQL helper that deletes directly from `storage.objects`; Storage objects must be removed through the Storage API.

## 4. Test before launch

Use two approved accounts with an active match:

- Upload and open a normal photo, then check the Edge Function response headers for `Cache-Control: private, no-store`.
- Send a close-to-destroy photo, open it once, close it, and confirm the message changes to expired and the object is removed from the private `chat-media` bucket.
- Grant a Vault photo for 15 minutes, download it from the matched account, revoke access, and confirm a fresh download fails.
- Confirm an unmatched account cannot download Vault or chat media.
- Activate Looking Tonight for four hours and verify the glowing ring appears only to eligible same-city profiles; turn it off and verify the ring disappears after refreshing discovery.

## Important limitations

No web app can stop a recipient photographing their screen, taking screenshots, recording the display or copying content already delivered to their device. `no-store` prevents ordinary HTTP cache persistence; it cannot erase pixels or files already captured. Vault revocation blocks future authorized downloads but cannot remotely erase a copy already viewed.

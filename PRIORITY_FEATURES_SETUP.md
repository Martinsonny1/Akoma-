# Meet GH priority update — deployment checklist

This update adds the client and database foundations for the requested safety, privacy and reliability work. **Apply the database migration and deploy the Edge Function changes before publishing the updated website.** Keep a database backup first.

## 1. Database migration

In Supabase → SQL Editor, run `supabase/priority_features_migration.sql` after the existing schema and migrations (including `verification_progressive_migration.sql`, `media_messaging_migration.sql`, `calls_migration.sql` and `presence_vault_migration.sql`). It is safe to rerun for the added columns/tables, but review any SQL error rather than continuing with a partially applied migration.

What it adds:
- `date_of_birth` as the source of truth; the database calculates and maintains the existing `age` field for compatibility.
- Signup acceptance timestamps and policy versions.
- A moderation queue that holds changed profile bios/photos until approval. Existing approved profile content stays visible while the change is pending.
- Admin review RPC and decision audit entries.
- Reports that can identify a profile, post or message, including message media kind/path.
- Push subscription storage with owner-only RLS.
- ID retention timestamps and an approval-based 30-day deletion schedule.

**Legacy accounts:** Existing accounts retain their existing `age` value and have `date_of_birth = NULL`. Do not invent birth dates from age. Decide on a safe re-confirmation flow for existing members before making DOB mandatory for their accounts.

## 2. Admin moderation

Deploy the updated `admin/` and `js/` folders together. The Admin dashboard now includes a Content review queue for changed profile bios and photos, report previews for reported image/video/audio content, name/city search and bulk member banning. Admin status changes, content reviews and report decisions are recorded in `admin_log`.

## 3. Delete ID images after approval

Deploy the updated `supabase/functions/media-lifecycle/` Edge Function. Set the `CRON_SECRET` secret for the function. Schedule a daily POST request to:

`https://YOUR_PROJECT_REF.supabase.co/functions/v1/media-lifecycle`

with header `x-cron-secret: YOUR_CRON_SECRET` and JSON body `{"action":"cleanup"}`. Use Supabase Cron/HTTP scheduling or a trusted external scheduler. The response includes `idsRemoved`. The cleanup removes due files from the private `verification` bucket and clears `id_card_path`; it does not delete the verification decision or admin audit history. Test this in a non-production project first.

The ID retention clock begins when an admin approves the account and is set to 30 days. A scheduled cleanup must be running for deletion to occur; the policy page states this dependency.

## 4. Push notifications

Deploy `supabase/functions/push-delivery/` as an Edge Function. Configure these Edge Function secrets:

- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT` (for example, a monitored `mailto:` address)
- `PUSH_WEBHOOK_SECRET` (a long random secret)

Add the matching VAPID public key to `VAPID_PUBLIC_KEY` in `js/config.js` (this key is public; never put the private key in browser code).

Create Supabase Database Webhooks (POST JSON to the `push-delivery` function, with header `x-webhook-secret: YOUR_PUSH_WEBHOOK_SECRET`) for:
- `public.messages` — INSERT
- `public.matches` — INSERT
- `public.calls` — INSERT

The function sends push notifications for new messages, new matches and incoming calls. Expired push endpoints are removed automatically. The browser subscription is created from Settings → Enable push alerts.

Push notifications require HTTPS, a supported browser, user permission and working VAPID/webhook configuration. iOS PWAs have additional installation/OS requirements. Push alerts improve reachability but do not guarantee that an incoming call can ring or be answered when the device is offline, force-stopped or has restricted background activity. Keep the in-app call timeout and missed-call handling.

## 5. Legal pages and signup consent

`privacy.html` and `terms.html` are linked from the signup consent step. Signup records the acceptance timestamp and policy version in the profile. Before launch, replace every `[Add ...]` placeholder with the actual operator/business and contact details. These are practical starter policies, not legal advice; obtain a Ghana data-protection/legal review and ensure the retention, processors and contact details match your real operations.

## 6. Existing accounts and testing

Test with separate member and admin accounts:
1. New signup: choose a DOB that is 18+, then verify that a younger DOB is rejected.
2. Confirm that the full DOB is not included in public profile RPC results; only calculated age should be displayed.
3. Change an approved member's bio and add/remove a photo. Confirm the existing public content remains unchanged until the Content review decision is approved.
4. Approve and reject content; confirm the audit log receives the decision.
5. Report a post and a message with image/video/audio media; confirm the Reports queue displays the content preview where storage permissions allow.
6. Approve a test account, set its `id_delete_after` to a past timestamp in a test project, run the cleanup action and confirm the file is removed from the private bucket.
7. Subscribe a test browser to push, then insert test message/match/call records and confirm notifications arrive.
8. Check the app at 320px width, keyboard focus, offline/online transitions and camera/microphone permission denial.

## 7. Still requiring operational follow-through

- The daily ID cleanup schedule and push database webhooks are external Supabase configuration steps; deploying the files alone does not activate them.
- Read receipts and typing indicators were not included in this safety/privacy pass.
- A full network-loss recovery strategy, device/browser-specific background-call QA and formal accessibility audit should be completed before broad launch.

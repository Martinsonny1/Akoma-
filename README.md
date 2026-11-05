# Akoma — static web application

Akoma is a browser-based dating and social application for adults in Ghana. It uses plain HTML, CSS and JavaScript. There is no Node.js, Python, build step or app installation required for visitors.

## Deploy the public app

1. Open the extracted Akoma folder. Its root `index.html` is the application entry point.
2. Upload the **contents** of the extracted Akoma folder to a static HTTPS host such as Netlify Drop, Cloudflare Pages, Vercel (static deployment), or GitHub Pages. Do not upload the parent folder as an extra nested directory.
3. Open the resulting HTTPS URL on any phone, tablet or computer.
4. To install it like an app on a supported phone, use the browser's **Add to Home Screen** option. This is optional.

Visitors do not install Python, Node.js or anything else. The local development server is no longer part of the deployment workflow.

## Configure Supabase before public launch

1. Create a Supabase project and run `supabase/schema.sql` in its SQL Editor.
2. In Authentication settings, enable Email provider. Set the Site URL to your final website URL and add that URL (and its auth redirect path) to the allowed redirect URLs.
3. Open `js/config.js` and set `SUPABASE_URL` and `SUPABASE_ANON_KEY` using the Project URL and the publishable/anon public key from Supabase Project Settings → API. Never put a `service_role` or secret key in browser JavaScript.
4. If email confirmation is enabled, configure a reliable SMTP provider before inviting real users. Supabase's default email service is intended for testing and has sending limits.
5. Create your first account, complete onboarding, then promote that profile to admin using the SQL instructions in `SUPABASE_SETUP_GUIDE.md`.
6. In Supabase Storage and Authentication, verify the policies and test signup, email confirmation, sign-in, profile creation, photo uploads, reporting and account deletion before opening the service to the public.

## Free for every member

Akoma's member experience is free: no subscriptions, premium tiers, paid boosts, pay-per-message or daily message-request cap. The app's safety and moderation rules still apply. Payment integration is disabled.

## Pages

- `index.html` — member application
- `admin/index.html` — admin dashboard
- `landing.html` — public waitlist / introduction page
- `supabase/schema.sql` — database schema and access policies

## Important before launch

- The live Supabase integration must be tested against your own project; packaging does not verify your database configuration.
- Protect all admin operations with database-side role checks and Row Level Security. Never rely on hiding admin buttons in JavaScript.
- Akoma handles sensitive profile photos and identity documents. Complete a privacy policy, terms, retention/deletion procedure and Data Protection Commission obligations before onboarding real members.
- Manual verification requires a trusted moderation team. Restrict access to government-issued ID images and delete them when no longer needed.
- HTTPS is required for service workers, camera access and installable PWA behaviour.


## Nearby users and online status

This update adds optional nearby-distance bands and online activity indicators for **all members equally**.

1. Deploy the updated static files.
2. In Supabase SQL Editor, run `supabase/features_migration.sql` **after** the original `supabase/schema.sql`. This is a separate, re-runnable migration for existing projects.
3. Run `supabase/media_messaging_migration.sql` after both files to add private photo, video, voice-note, view-once and timed media messaging.
3. Test with two approved accounts. Each account must independently enable Nearby sharing before a distance band appears.
4. Each account must enable “Show my online status” before either member can see activity labels. Hiding your status also hides other members' status from you.
5. Nearby sharing requires HTTPS and browser location permission. Users can turn it off at any time.

Privacy behaviour:
- Exact browser coordinates are not returned by any profile-list function.
- Coordinates are snapped to roughly 500-metre grid cells before storage.
- Other members receive only `Under 1 km`, `1–5 km`, `5–10 km`, or `10+ km`.
- Online activity is reduced to `Online now`, `Active today`, or `Active this week`; no exact last-seen time is exposed.
- The app sends a heartbeat every two minutes while the page is visible. Closing the page naturally causes the online label to age out.
- Both features are opt-in and have the same controls for men and women.

The demo adapter stores simulated settings in the current browser only. Demo profiles do not have real-world coordinates, so distance matching should be tested with two demo accounts that have both opted in and location permission enabled; never interpret demo coordinates as real locations.


## Media messaging setup

- Media uploads use the private `chat-media` Storage bucket. Only members of the active, unblocked match can upload or access that conversation's media.
- Run `supabase/media_messaging_migration.sql` after the two existing SQL files.
- For automatic physical deletion of expired/timed media, enable the `pg_cron` extension in Supabase Database → Extensions, then run the one-time `cron.schedule` statement documented at the bottom of `media_messaging_migration.sql`. If pg_cron is unavailable on your plan, schedule `public.cleanup_expired_chat_media()` from a trusted server-side Edge Function.
- View-once is enforced by a one-time database RPC and a short-lived signed URL. No browser can guarantee that screenshots, screen recordings or an external camera are prevented.
- Photos are compressed in the browser. Video compression is not built in; videos are limited to 20 MB and supported formats. Voice recording requires microphone permission and HTTPS (or localhost).


## New: Private Vault + Looking Tonight

This build adds a private photo Vault and a time-limited Looking Tonight beacon.

1. Run `supabase/presence_vault_migration.sql` after the existing schema, nearby/online and media migrations.
2. Vault images are stored in the private `vault-media` bucket. Access is checked by Storage RLS and active match/grant records.
3. Owners can grant access for 5, 15, 30, 60 minutes or 24 hours and revoke it. Access is not automatic on matching.
4. Looking Tonight can be enabled for 4 or 6 hours and is limited to approved opposite-role profiles in the same city; it does not reveal coordinates.

**Privacy limitation:** revocation prevents subsequent authorized fetches, but cannot erase an image already viewed, saved, photographed or captured by the recipient. Browser apps cannot guarantee screenshot prevention. Looking Tonight is an availability signal, not consent to intimacy or a guarantee that someone is physically nearby.

For production, add a scheduled cleanup for expired beacon rows and review Supabase Storage policies after deployment. The app enforces access on new requests; data already delivered to a device cannot be remotely recalled.

Media caching note: uploads request `cacheControl: '0'` to avoid long-lived freshness, but direct Supabase Storage delivery cannot guarantee a universal browser/CDN `no-store` policy or erase content already downloaded. A production-wide no-store guarantee requires routing media through an authenticated Edge Function/proxy that sets `Cache-Control: no-store` on every response.


### Edge Function required for private media delivery and deletion

Deploy `supabase/functions/media-lifecycle/index.ts` as the Supabase Edge Function named `media-lifecycle`. Set its `CRON_SECRET` environment secret. It uses the caller's JWT for authorization, routes view-once and Vault downloads through responses with `Cache-Control: private, no-store`, and deletes Storage objects through the Supabase Storage API when the recipient closes the viewer. Configure a scheduled POST to the function with JSON `{"action":"cleanup"}` and header `x-cron-secret: <CRON_SECRET>` every minute to physically remove expired media and abandoned view-once uploads. Do not schedule the older SQL cleanup helper from the previous media migration; deleting rows from `storage.objects` directly does not reliably remove the underlying object bytes.

All chat-media deliveries (normal, timed and close-to-destroy) and Vault downloads are routed through this Edge Function and returned with `Cache-Control: private, no-store` headers. Profile and public-facing profile-photo delivery continue to use the existing private signed-URL flow.

For deployment of the `media-lifecycle` Edge Function and the scheduled cleanup job, follow `EDGE_FUNCTION_SETUP.md` before enabling these features for real users.

## Voice and video calls (LiveKit)

This build includes one-to-one LiveKit voice/video calls inside matched chats and a call-history view. Run `supabase/calls_migration.sql` after the existing Akoma migrations, add `LIVEKIT_URL`, `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` as Supabase Edge Function secrets, and deploy `supabase/functions/livekit-call/index.ts` as `livekit-call`. Follow the complete no-command-line instructions in `SUPABASE_SETUP_GUIDE.md`. Never place the LiveKit API secret or Supabase service-role key in browser code.

Calls have no app-imposed duration cap, but LiveKit usage, network availability and plan limits still apply. Incoming call ringing in this build requires the app page to be open; closed-browser/native push calling is not included. Calls are not recorded.


## Updated identity verification and pending access

New registrations submit a government-issued ID (Ghana Card accepted) for manual review. Pending and rejected accounts remain in a restricted verification hub: they can check status, replace/resubmit an ID, and preview descriptions of Akoma features, but they cannot browse real member profiles or use matching, messaging, calls, nearby, or Vault features. Run `supabase/verification_progressive_migration.sql` in Supabase SQL Editor after the existing migrations; this prevents admin approval when no government ID has been submitted. The app checks approval automatically every 30 seconds while the verification screen is open. The review target shown to users is an aim, not a guarantee or automatic approval. Admins should review the queue promptly and only approve after checking the ID and profile. Existing schema columns `selfie_path` and `id_card_path` are retained for compatibility; the updated flow uses `id_card_path` for all new submissions.


## Latest safety and privacy update

See [PRIORITY_FEATURES_SETUP.md](PRIORITY_FEATURES_SETUP.md) for the required Supabase migration, ID-image cleanup schedule, push notification configuration, and verification checklist. Run the migration and configure the scheduled jobs/webhooks before relying on the new backend features.

## Guest browsing and selfie verification update

For the guest-first onboarding update, deploy the latest app files and run `supabase/guest_selfie_verification_migration.sql` in Supabase SQL Editor after the existing migrations. Read `AKOMA_GUEST_SELFIE_UPDATE.md` for the deployment order, behavior changes, and test checklist. New accounts begin as guests; guests can browse Discover and read Timeline but cannot initiate interactions until selfie review is approved. Selfie review is manual and is not legal identity or age verification.


### Guest verification and software problem reports
Run `supabase/app_feedback_migration.sql` once in the Supabase SQL Editor to enable in-app technical problem reports and the admin Problem reports tab. Featured profiles are displayed both in the featured carousel and in the main Discover listing. Guest members can start selfie verification from My Profile or Settings at any time.

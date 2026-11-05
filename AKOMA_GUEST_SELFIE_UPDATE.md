# Meet GH guest browsing and selfie verification update

## What changed
- New signups begin as persistent `guest` accounts.
- Guests can browse approved profiles in Discover and read the Timeline.
- Guests cannot like/pass, send requests or messages, create posts, like posts, use calls, or use other approved-member actions. Existing server-side RPC and Edge Function approval checks remain in place.
- Selfie upload is optional during onboarding and can be skipped. Guests can submit a selfie later from Discover, Timeline, or a profile view.
- Submitting a selfie moves the account to `pending`; admin approval moves it to `approved`. Rejected users can resubmit.
- Admin moderation now displays the selfie and requires a selfie before approval.
- Existing approved accounts remain approved. Existing pending accounts without a selfie become guests.
- ID columns and old ID files are retained for backwards compatibility; the app no longer requests or uses them for approval.

## Required Supabase step
1. Open Supabase Dashboard → SQL Editor.
2. Create a new query.
3. Paste and run `supabase/guest_selfie_verification_migration.sql`.
4. Confirm it completes successfully before deploying the website files.

This migration changes profile status handling, guest profile discovery, read-only Timeline access, selfie submission and admin approval. Do not run only part of the SQL.

## Important verification limitation
This implementation provides a private selfie upload and human moderator review. It does not perform automated liveness detection, biometric face matching, or legal identity/age verification. The existing 18+ date-of-birth gate remains. Moderators should reject accounts they reasonably suspect are under 18.

## Existing services preserved
The existing Supabase project, authentication, profile/photo storage, chat, matches, calls, LiveKit, push notifications, sound settings, admin functions and service-worker setup are retained. The service-worker cache version is bumped so installed PWAs fetch the new app shell.

## Deployment order
1. Run the Supabase migration above.
2. Deploy the full contents of this ZIP to the same hosting project and root directory.
3. Open Meet GH on the phone while online and refresh/reopen it to receive the updated service worker.
4. Test with a new test account: skip selfie, browse Discover and Timeline, confirm interactions are blocked; then submit a selfie, approve it in Admin, and confirm full access unlocks.


## Featured profiles and problem reports (follow-up)
- Featured members remain in the normal Discover grid and are also shown in the Featured carousel.
- Guest accounts have a persistent selfie-verification entry on My Profile and Settings, so they can submit a selfie whenever they choose. Pending accounts see their review status.
- Added a Report a problem form in My Profile and Settings. Reports are saved separately from member safety reports in `app_feedback`.
- Admin dashboard has a new Problem reports tab.
- Run `supabase/app_feedback_migration.sql` once in Supabase SQL Editor before using the report form in production. This is an additive migration and does not modify existing profiles, chats or messages.

# Meet GH — Progressive verification update

## What changed
- New sign-ups now submit a government-issued ID (Ghana Card accepted) for manual review; the old selfie requirement has been removed from the new onboarding flow.
- Pending and rejected users land on a welcoming verification hub instead of a dead-end waiting message.
- The hub shows account/ID/review progress, allows missing or rejected IDs to be uploaded again, and previews Meet GH features without exposing real member profiles.
- Pending accounts remain restricted from discovery, likes, matching, messaging, calls, Nearby and Vault. Existing database-side approval checks remain in place.
- The app checks approval every 30 seconds while the pending screen is open and moves the member into the app after approval.
- The admin verification queue now reviews the ID and profile photos, shows how long a member has waited, and disables approval when no ID has been submitted.
- Added `supabase/verification_progressive_migration.sql` to enforce the ID requirement in the database's admin approval function.

## Deployment steps
1. Back up the currently deployed Meet GH files.
2. Upload the contents of this ZIP's `akoma_latest` folder to the same static hosting root, replacing the previous website files.
3. In Supabase Dashboard → SQL Editor, run `supabase/verification_progressive_migration.sql` once.
4. Confirm the private `verification` Storage bucket and its existing policies remain enabled.
5. Test a fresh account: complete onboarding, submit an ID, confirm it remains pending, and confirm it cannot see member profiles or use member features.
6. In the admin dashboard, review the ID and approve the account. The pending screen should unlock automatically within about 30 seconds while open.
7. Test a pending account without an ID and confirm the admin approval button is disabled and the SQL function rejects approval without an ID.

## Important notes
- This package does not automatically approve anyone after 24 hours. The 24-hour wording is a review target only.
- Automatic in-app status checking runs while the verification screen is open. It is not a push notification when the app/browser is fully closed.
- Existing `selfie_path` data and database column are retained for compatibility. New onboarding uses `id_card_path` for every member.
- ID documents are sensitive. Keep the `verification` bucket private, restrict moderator access, publish a clear retention/deletion policy, and confirm applicable Ghana Data Protection Commission obligations before launch.
- The live Supabase deployment still needs to be tested with your own project and admin account.

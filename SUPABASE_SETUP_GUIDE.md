# Akoma: Supabase setup from zero (free member access)

This guide is for the `akoma-app-free-improved` project. It assumes you do not yet have a Supabase account.

## What you need

- A Google account or email address.
- The Meet GH ZIP extracted on your Windows computer.
- Internet access.
- No credit card is required to start a Supabase Free project in the normal signup flow; if the dashboard asks for billing details, stop and review the plan before proceeding.

## Important: free for members vs. free to operate

Meet GH's member features are free: there are no subscriptions, premium tiers, paid boosts, or daily request caps. Supabase has a Free plan with quotas, but Meet GH uses email and password authentication, so you do not need Twilio or another SMS provider. Supabase's built-in email service is suitable for initial development but has sending limits; configure custom SMTP before a public launch if required. See https://supabase.com/docs/guides/auth and https://supabase.com/docs/guides/auth/auth-smtp.

## Step 1 — Create your Supabase account

1. Open https://supabase.com/dashboard.
2. Choose **Start your project** / **Sign in** and create an account.
3. Verify your email if asked.
4. Create an organization if the dashboard asks. Give it a name such as `Meet GH` and choose the Free plan.

## Step 2 — Create the Meet GH database project

1. In the dashboard, click **New project**.
2. Select your `Meet GH` organization.
3. Project name: `akoma-production` (or `akoma-test` while testing).
4. Create a strong database password and save it somewhere private. You do not need to put this password in the website code.
5. Choose the nearest available region to Ghana (for example, a Europe region if offered; choose based on latency shown in the dashboard).
6. Select the **Free** plan and create the project.
7. Wait until the project status is ready.

## Step 3 — Create the database tables and security rules

1. Open your new project.
2. In the left sidebar, open **SQL Editor**.
3. Choose **New query**.
4. On your computer, open `Meet GH/supabase/schema.sql` in Notepad or VS Code.
5. Select all, copy, and paste into the Supabase SQL Editor.
6. Click **Run**. Wait for it to finish. It creates Meet GH's tables, security rules, database functions, and private `photos` and `verification` storage buckets.
7. If you see an error, stop and copy the complete error message. Do not run random SQL fixes or share your database password.

**Do not run** `supabase/dev-simulated-payments.sql`. Payments are disabled because Meet GH is free for every member.

## Step 4 — Enable email authentication

1. In Supabase, open **Authentication** → **Sign In / Providers** (the exact label may vary).
2. Open **Email** and make sure email sign-in is enabled.
3. For account verification, enable **Confirm email**. New Meet GH registrations submit a government-issued ID (Ghana Card accepted) for manual review; the pending screen allows ID resubmission and does not unlock real member browsing or interactions. Supabase will send a confirmation link to new users.
4. You do not need to enable Phone authentication or configure Twilio, Vonage, MessageBird, or another SMS provider.
5. During development, use an email inbox you can access. After registering, open the confirmation email and follow its link, then return to Meet GH and sign in.
6. For production delivery, review Supabase's email sending limits and configure custom SMTP so confirmation and account emails are reliable.

Meet GH's login screen supports **Create account** and **Sign in** using email plus a password of at least 8 characters. If email confirmation is enabled, users must confirm their email before signing in.

## Step 5 — Copy the Supabase URL and public key

1. In the Supabase project, open **Project Settings** → **API** (or **API Keys**).
2. Copy the **Project URL**. It looks like `https://abcdefgh.supabase.co`.
3. Copy the browser-safe **anon / public** key (often shown as the legacy `anon` key). Do **not** copy `service_role` or any secret key into the website.
4. On your computer, open `Meet GH/js/config.js`.
5. Replace the empty values:

```js
SUPABASE_URL: 'https://YOUR-PROJECT-REF.supabase.co',
SUPABASE_ANON_KEY: 'YOUR-ANON-PUBLIC-KEY',
```

Keep `PAYMENTS_MODE: 'disabled'`. Save the file. The anon/public key is designed to be used in the browser; the database's RLS policies protect member data. Never expose the database password or service-role key.

## Step 6 — Run Meet GH locally on Windows

1. Install Python 3 from https://www.python.org/downloads/windows/ if it is not already installed. During installation, tick **Add Python to PATH**.
2. Extract the Meet GH ZIP. Open the extracted `Meet GH` folder.
3. Open that folder in File Explorer, click the address bar, type `cmd`, and press Enter.
4. In the command window, run:

```bat
cd web
py -m http.server 8000
```

5. Open Chrome and visit `http://localhost:8000`.
6. The app should now connect to Supabase. If the URL/key are still blank, it will use local demo mode instead.
7. Use your configured email account and OTP to sign in. Create a test profile and complete the onboarding flow.

To stop the local server, return to Command Prompt and press `Ctrl + C`.

## Step 7 — Make your own account an admin

First create an account using your email address, confirm it if required, sign in, and complete the member onboarding so a row exists in `public.profiles`.

1. In Supabase, open **SQL Editor** → **New query**.
2. Run this query to find your account:

```sql
select id, phone
from auth.users
order by created_at desc;
```

3. Copy the UUID (`id`) belonging to your test account.
4. Replace `PASTE-YOUR-USER-UUID-HERE` in this query and run it:

```sql
update public.profiles
set role = 'admin', status = 'approved'
where id = 'PASTE-YOUR-USER-UUID-HERE';
```

5. Sign out of Meet GH and sign in again. Open `http://localhost:8000/admin/` to use the moderation dashboard.
6. If the update says `UPDATE 0`, your profile row has not been created yet. Finish onboarding first, then repeat the query.

Keep admin access private. Do not promote ordinary member accounts to admin.

## Step 8 — Deploy the website for public testing

You can host the static `web` folder on Vercel, Netlify, or Cloudflare Pages. For Vercel:

1. Create a GitHub repository and upload the contents of `Meet GH` (not the outer `Meet GH` folder) to it.
2. In Vercel, import that repository.
3. Framework preset: **Other**.
4. Build command: leave blank; Output Directory: `.` (the repository root, since `index.html` is at the root).
5. Deploy.
6. In Supabase, open **Authentication** → **URL Configuration**. Set **Site URL** to your deployed HTTPS address, and add the deployed domain to **Redirect URLs** if the dashboard asks.
7. Test the member app and admin page at `https://YOUR-DOMAIN/` and `https://YOUR-DOMAIN/admin/`.

If you already use Vercel for another project, create a separate project for Meet GH so you do not overwrite StoreNest.

## Step 9 — Before real users join

- Configure a real SMS provider and verify that OTP messages arrive on MTN, Telecel, and AT numbers in Ghana. This may incur SMS charges. Supabase does not make real SMS delivery free.
- Configure rate limits and CAPTCHA to reduce OTP abuse.
- Test with at least two separate accounts and devices: profile creation, admin approval, discovery, requests, accept/decline, chat, block, report, and account deletion.
- Confirm that private profile photos and verification documents cannot be opened by another user without permission.
- Remove all email accounts and fixed OTPs.
- Publish a Privacy Policy and Terms. Obtain appropriate consent and handle government-issued ID images carefully; check Data Protection Commission requirements before launch.
- Monitor Supabase usage and free-plan quotas. Free projects may pause after inactivity and quotas can change; see https://supabase.com/docs/guides/platform/billing-on-supabase.

## Troubleshooting

- **App still shows demo:** check that both `SUPABASE_URL` and `SUPABASE_ANON_KEY` in `js/config.js` are filled in, saved, and not surrounded by placeholder text.
- **Invalid API key:** use the project's anon/public key, not the database password or service-role key.
- **SMS provider error:** test OTP numbers still require Phone auth to be enabled and the provider setup to satisfy Supabase's current configuration. Check the Authentication logs.
- **Profile pending:** this is expected. An admin must approve the profile in `/admin/`.
- **Admin page says not authorized:** promote the profile using Step 7, then sign out and sign in again.
- **Photos fail:** check that the SQL schema completed and that both private Storage buckets exist (`photos` and `verification`).
- **Never paste secrets in chat or GitHub.** If you accidentally publish a service-role key or database password, rotate it in Supabase immediately.


## Password recovery
The admin sign-in page now includes **Forgot password?**. In Supabase, open **Authentication → URL Configuration** and ensure your deployed admin recovery URL is allowed, for example:
`https://YOUR-SITE.netlify.app/admin/reset-password.html`
Also ensure the site origin is listed as a Site URL/redirect URL as appropriate. Then enter the account email on `/admin/` and tap **Forgot password?**. The recovery email opens the reset page, where you can choose a new password.


## Media messaging migration

After the nearby/online migration, open SQL Editor → New query and run `supabase/media_messaging_migration.sql`. This creates the private chat media bucket, database policies and RPCs for media delivery and view-once opening. To physically delete expired media automatically, enable `pg_cron` in Database → Extensions and run the optional schedule statement at the bottom of that SQL file. Otherwise, invoke `public.cleanup_expired_chat_media()` from a trusted scheduled Edge Function.

The app supports photos (JPEG/PNG/WebP, 8 MB), videos (MP4/WebM/QuickTime, 20 MB), and voice notes (2 minutes maximum, 8 MB). Voice recording requires HTTPS and microphone permission. A website cannot guarantee screenshot or screen-recording prevention.


## Private Vault and Looking Tonight migration

After the existing migrations, run `supabase/presence_vault_migration.sql`. This creates the private Vault storage bucket, match-scoped timed grants, revocation RPCs, and 4/6-hour Looking Tonight beacons. No public bucket is used. Test with two approved accounts that have an active match, verify a non-match cannot read Vault objects, and verify that revoking a grant blocks a fresh download.

A previously downloaded or captured image cannot be remotely erased. Do not describe Vault access as screenshot-proof.

Media caching note: uploads request `cacheControl: '0'` to avoid long-lived freshness, but direct Supabase Storage delivery cannot guarantee a universal browser/CDN `no-store` policy or erase content already downloaded. A production-wide no-store guarantee requires routing media through an authenticated Edge Function/proxy that sets `Cache-Control: no-store` on every response.


### Edge Function required for private media delivery and deletion

Deploy `supabase/functions/media-lifecycle/index.ts` as the Supabase Edge Function named `media-lifecycle`. Set its `CRON_SECRET` environment secret. It uses the caller's JWT for authorization, routes view-once and Vault downloads through responses with `Cache-Control: private, no-store`, and deletes Storage objects through the Supabase Storage API when the recipient closes the viewer. Configure a scheduled POST to the function with JSON `{"action":"cleanup"}` and header `x-cron-secret: <CRON_SECRET>` every minute to physically remove expired media and abandoned view-once uploads. Do not schedule the older SQL cleanup helper from the previous media migration; deleting rows from `storage.objects` directly does not reliably remove the underlying object bytes.

All chat-media deliveries (normal, timed and close-to-destroy) and Vault downloads are routed through this Edge Function and returned with `Cache-Control: private, no-store` headers. Profile and public-facing profile-photo delivery continue to use the existing private signed-URL flow.

See `EDGE_FUNCTION_SETUP.md` for deploying the `media-lifecycle` Edge Function, configuring the cleanup schedule, and testing no-store delivery and Vault revocation.

---

# LiveKit voice and video calling setup (added in this build)

This update adds one-to-one voice and video calls to matched conversations. Supabase handles authentication, call invitations and call history. LiveKit carries the real-time audio/video. Supabase does not store or relay the media streams.

## A. Create the Supabase project

1. Visit https://supabase.com/dashboard and sign in.
2. Select **New project** and choose your organisation.
3. Name it **Meet GH**. Create a strong database password and store it somewhere safe.
4. Choose a region reasonably close to your expected members. If your project has already been created in the United States, keep using it for this integration; changing region generally requires creating a new project and migrating data.
5. Choose the Free plan while developing and select **Create new project**.
6. Wait until the project is ready.

## B. Copy the browser-safe Supabase settings

1. Open **Project Settings → API** (the current dashboard may label this **API Keys**).
2. Copy the **Project URL**.
3. Copy the **Publishable key**. If your project shows the legacy `anon` public key instead, use that.
4. Open `js/config.js` in this ZIP and fill in `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
5. Do not copy the `service_role` key or any secret key into `js/config.js`, HTML or other browser files.

## C. Configure authentication

1. In Supabase, open **Authentication → Sign In / Providers** and enable **Email**.
2. Open **Authentication → URL Configuration**.
3. Set the Site URL to the HTTPS address where Meet GH will be hosted.
4. Add that same address to the allowed Redirect URLs. Add your local development URL only if you use one.
5. If email confirmation is enabled, configure a reliable SMTP provider before inviting real users. The built-in email sender is for testing and has sending limits.

## D. Create the database

Open **SQL Editor → New query**. Open each SQL file from this ZIP, copy its entire contents into the editor and press **Run**. For a brand-new database, use this order:

1. `supabase/schema.sql`
2. `supabase/features_migration.sql`
3. `supabase/media_messaging_migration.sql`
4. `supabase/presence_vault_migration.sql`
5. `supabase/calls_migration.sql`

If you already ran the first four migrations on your existing Meet GH database, run only `calls_migration.sql`. Do not reset or recreate a live database to add calling.

## E. Configure the LiveKit project

1. Open your LiveKit Cloud project.
2. In **Manage API keys**, create an API key and copy the API key and API secret. Save the secret securely; it is not a browser setting.
3. Find the project's **Server URL / WebSocket URL**. It normally starts with `wss://` and ends in `.livekit.cloud`. This is not the API key or API secret.
4. Keep the API key, API secret and URL private. Never paste the secret into chat or into `js/config.js`.

## F. Add the LiveKit secrets to Supabase

1. In Supabase, open **Edge Functions → Secrets** (sometimes under **Project Settings → Edge Functions**).
2. Add these three secrets exactly:
   - `LIVEKIT_URL` = your LiveKit `wss://...` server URL
   - `LIVEKIT_API_KEY` = your LiveKit API key
   - `LIVEKIT_API_SECRET` = your LiveKit API secret
3. Save the secrets. The function reads them server-side. Do not create frontend variables for them.

Supabase automatically provides `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` to Edge Functions. Do not manually expose the service-role key to the browser.

## G. Deploy the calling Edge Function (Dashboard, no command line)

1. Open **Edge Functions** in your Supabase dashboard.
2. Choose **Deploy a new function** / **Create function**.
3. Name it exactly `livekit-call`.
4. Open `supabase/functions/livekit-call/index.ts` from this ZIP.
5. Copy the complete file contents into the Supabase function editor, replacing the starter code.
6. Deploy the function. Keep JWT verification enabled; the function requires a signed-in Supabase user.
7. Confirm `livekit-call` appears in your Edge Functions list and has deployed successfully.

The function verifies that the caller belongs to the active match, both accounts are approved, and neither user has blocked the other before issuing LiveKit tokens. Tokens are created on the server and are never stored in a client-readable table.

## H. Deploy the existing private-media function

The Vault and expiring chat media features also require `media-lifecycle`. If it is not already deployed:

1. Create another Edge Function named `media-lifecycle`.
2. Paste the full contents of `supabase/functions/media-lifecycle/index.ts`.
3. Deploy it and configure `CRON_SECRET` as described in `EDGE_FUNCTION_SETUP.md`.
4. Follow the media cleanup instructions in that file. This is separate from calling.

## I. Host Meet GH securely

Upload the contents of this ZIP's application folder to a static HTTPS host (for example Netlify, Cloudflare Pages or Vercel). Do not upload the parent folder as an extra nested directory. Calls require HTTPS because browsers restrict microphone and camera access on insecure origins. Keep the `supabase` folder as your deployment reference; it does not need to be publicly hosted with the website.

## J. Test calling with two accounts

Use two separate approved accounts that have an active match:

1. Sign in on two different devices or browser profiles.
2. Open the same matched conversation.
3. Test voice call: start, receive, answer, mute and end.
4. Test video call: camera permission, self-view, remote video, mute and camera off.
5. Test decline, no answer, network interruption and reconnect.
6. Unmatch or block and confirm a new call cannot be started.
7. Open **Chats → Call history** and confirm the record appears.
8. Test Android Chrome and iPhone Safari on real devices, not only desktop emulation.

## Calling behaviour and limitations

- Calls are one-to-one and only available to approved members of an active, unblocked match.
- Either person can start voice or video calls. There is no gender-based calling restriction.
- There is no application-imposed maximum call duration. Network failures, browser suspension, device battery, LiveKit service limits or plan limits can still end a call. LiveKit usage and bandwidth may incur charges beyond the applicable free allowance.
- Calls are not recorded by this application.
- Incoming call alerts currently rely on the Meet GH page being open and connected to Supabase Realtime. This build does not include native push calling when the browser is fully closed or the phone is asleep. A later PWA push/native integration is needed for reliable background ringing.
- The call access token is short-lived (24 hours) for joining; this is not a 24-hour call timer. The application does not automatically end a connected call at that time.
- LiveKit Cloud project region is controlled in LiveKit, independently of the Supabase region. Choose the closest available region to your users when creating the LiveKit project; a region change may require a new project.
- Browser calls need microphone/camera permissions and a stable internet connection. Mobile data, TURN relay and video quality affect costs and call quality.

## Troubleshooting

- **Function not found:** check that the deployed function name is exactly `livekit-call`.
- **LiveKit is not configured:** check the three Edge Function secrets and redeploy/restart the function if the dashboard requires it.
- **Not authenticated:** sign out and back in; check the Supabase URL and publishable key in `js/config.js`.
- **Match no longer active:** confirm both accounts still have the active match and neither has blocked the other.
- **No incoming call:** keep both Meet GH tabs open, verify the `calls` table is in the `supabase_realtime` publication and check the recipient is signed in.
- **No microphone/camera:** open the app over HTTPS, grant browser permissions and check that another app is not holding the camera.
- **Connection fails:** verify `LIVEKIT_URL` begins with `wss://`, API key and secret belong to the same LiveKit project, and the LiveKit project is operational.


## Progressive verification update (new)

After deploying the updated website, open Supabase Dashboard → SQL Editor and run `supabase/verification_progressive_migration.sql`. This keeps the existing private `verification` bucket and profile policies, and adds a database-side safeguard so an admin cannot approve an account until a government-issued ID has been uploaded. New accounts submit an ID only; old `selfie_path` data is retained for compatibility. Pending users see a restricted welcome/verification hub and cannot access real member profiles or member interactions until approved.

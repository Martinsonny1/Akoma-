# Meet GH — launch-ready web app package

## What is included
- `welcome.html`: promotional landing page to share with groups. It uses the supplied romantic phone/heart background (`images/welcome-heart-bg.jpg`) and the supplied Meet GH artwork (`images/meet-gh-brand.png`).
- `index.html`: the actual Meet GH app. The promotional page's buttons open this app.
- Updated in-app first welcome screen with Meet GH branding and a richer romantic Ghana-inspired visual.
- Updated app metadata, PWA manifest, service worker cache version, admin labels and legal-page branding.
- Existing Supabase configuration, app JavaScript, SQL migrations and feature files are retained.

## How to deploy
1. Back up the current live project.
2. Extract this ZIP.
3. Upload the **contents** of the `Meet-GH` folder to the root of the existing Vercel project (the same place where `index.html`, `js/`, `css/`, and `supabase/` live).
4. Keep all folders and paths intact.
5. Share `https://YOUR-DOMAIN/welcome.html` with your groups.
6. The **Enter Meet GH** and **Get started on Meet GH** buttons open `./index.html`, the app on the same domain.

## Important
- `js/config.js` was retained, including the existing Supabase URL, public key and VAPID public key.
- No SQL migration is required for this visual/branding update.
- Existing database table names, auth identifiers, local-storage keys, and internal JavaScript globals such as `AKOMA_CONFIG` / `AkomaUtil` are intentionally retained to avoid breaking existing accounts and integrations.
- Existing domain `akoma-silk.vercel.app` is not changed by this ZIP. If you later attach a Meet GH domain, the same-site buttons continue to work.
- The supplied background image is intentionally used on the promotional welcome page; the supplied Meet GH artwork is used in the page and app welcome screen.
- Test login, Discover, Chats, Matches, calls and notifications on the deployed site before sharing widely. This package has syntax/ZIP checks but has not been live-tested against your Supabase project.

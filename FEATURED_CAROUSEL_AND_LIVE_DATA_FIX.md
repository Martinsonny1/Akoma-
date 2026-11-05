# Meet GH — Featured carousel and live-data restoration

This update restores `js/config.js` from the previous Meet GH notification-badges build. The uploaded `Akoma-.zip` did not contain that file even though `index.html` loads it. Without the Supabase URL and publishable key, `js/api.js` deliberately selects the local demo API, which explains why demo profiles and demo conversations appeared.

## Discover layout
- Featured profiles are placed directly after the Discover hero and before the guest prompt and normal listings.
- The featured row is a larger horizontal swipe carousel (176 × 218 px cards; slightly smaller on narrow phones).
- Featured profiles continue to appear in the normal listing too.
- The carousel is only rendered when there are active featured profiles returned by Supabase. An admin must feature profiles with an active `featured_until` date.

## Deployment
1. Deploy the complete `Akoma-` folder from this ZIP, not selected files.
2. Confirm `js/config.js` remains present in the deployed site. It contains the project's Supabase URL and browser-safe publishable key; it must not be replaced with a service-role key.
3. Refresh the PWA/site. If the old screen remains, close Meet GH fully and reopen it so the v17 service-worker cache is refreshed.
4. Confirm real profiles and conversations load. No SQL migration is required for this layout/config restoration.

No Supabase tables, profiles, messages or matches are deleted or modified by this update.

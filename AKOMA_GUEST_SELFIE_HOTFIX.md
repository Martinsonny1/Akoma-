# Akoma guest/selfie update hotfix

The previous guest update recreated `list_profiles()` without returning the two fields (`distance_band`, `activity_label`) already added to the `profile_card` composite type by the nearby/online feature migration. PostgreSQL can reject that function result, which can make Discover and match/chat card loading fail.

## If you already ran the previous guest migration
1. Open Supabase Dashboard → SQL Editor.
2. Open and run `supabase/guest_selfie_profiles_hotfix.sql`.
3. Reload Akoma.

This hotfix replaces only the `list_profiles()` function and its execute grant. It does not delete profiles, messages, matches, or other user data.

The corrected full migration also includes this compatible function for fresh installations.

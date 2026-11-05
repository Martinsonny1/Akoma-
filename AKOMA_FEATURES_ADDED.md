# Akoma feature upgrade

This ZIP is based on the previously supplied Akoma media-messaging project and adds:

- **Private Vault:** private storage, individual-photo permissions, match-specific grants for 5/15/30/60 minutes or 24 hours, and owner revocation.
- **Close-to-destroy media:** one-time chat media opens in a dedicated viewer; closing calls the Edge Function to delete the Storage object. A scheduled cleanup handles abandoned opens and expired timed media.
- **No-store delivery:** chat media (normal, timed and one-time) and Vault images are delivered through the `media-lifecycle` Edge Function with `Cache-Control: private, no-store` headers.
- **Looking Tonight:** optional 4- or 6-hour beacon, chat/meet/either intent, same-city discovery visibility, and an animated avatar ring. Men and women have identical controls.
- **Demo support:** local demo mode includes simulated beacon and Vault behaviour for interface testing.

## Before production

Run the SQL migrations and deploy the Edge Function as described in `EDGE_FUNCTION_SETUP.md`. The ZIP cannot apply changes to your live Supabase project automatically. JavaScript syntax checks passed; live Supabase policies, Edge Function deployment, uploads, cleanup scheduling and cross-account behaviour still require testing in your project.

Privacy cannot be absolute after content reaches another person's screen. A recipient can screenshot, record, photograph or otherwise copy what they see. Revocation blocks future downloads but cannot erase an existing capture.

# Meet GH calling upgrade

Added in this package:
- Voice and video call actions in matched chat headers.
- Incoming call overlay with answer/decline and outgoing ringing/cancel.
- LiveKit audio/video room connection, mute, camera on/off, speaker mute, reconnect status and end call.
- Server-side token generation via Supabase Edge Function; no LiveKit secret in frontend.
- Match, approval and mutual-block validation before call creation/token issuance.
- Call records and call-history screen.
- SQL migration for calls and incoming-call preferences.

Setup: follow `SUPABASE_SETUP_GUIDE.md`, especially sections D–J. Existing nearby/online, media, Vault and Looking Tonight features are retained.

Important: test with two approved accounts and a real HTTPS deployment. The included call signalling uses Supabase Realtime and requires the app page to be open for incoming ringing. Push notifications for fully closed browsers/native app calling are not part of this version. No call recording is implemented.

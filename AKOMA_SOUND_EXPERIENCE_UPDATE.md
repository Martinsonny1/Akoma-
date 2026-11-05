# Meet GH sound experience update

## Included
- Per-device sound preferences for calls, messages, and matches, stored in localStorage.
- Three incoming ringtone styles: Classic, Gentle, and Digital, with a preview button.
- Incoming in-app message sound when a new message arrives while the app is visible.
- Match success sound when a match is created through the in-app like/accept flows.
- Existing call sounds now respect the call-sounds preference.
- Service-worker cache version bumped so updated files are fetched after deployment.

## Notes
- Browser/OS push notification sounds are controlled by the device's notification settings and notification channel behavior. The service worker requests a non-silent notification but cannot force a custom sound on every device.
- Browser audio must be unlocked by a user gesture; the existing first-interaction audio unlock remains in place.
- Sound preferences are device/browser-local and are not synced across devices.

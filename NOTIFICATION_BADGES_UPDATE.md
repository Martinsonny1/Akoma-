# Akoma notification badges update

## Included
- Red numeric badge on Chats for total unread incoming messages.
- Red numeric badge on each chat row for that conversation's unread incoming messages.
- Red numeric badge on Matches for matches created since the member last opened Matches.
- Opening a conversation records its read time; opening Matches clears the new-match count.
- Badge counts refresh approximately every 12 seconds while the app is open.
- Existing historical matches are marked as already seen when the migration first runs.
- Guest accounts do not receive interaction badges because their interaction tabs are restricted.

## Supabase setup (required once)
1. Open Supabase Dashboard → SQL Editor.
2. Run `supabase/notification_badges_migration.sql`.
3. Deploy the complete updated `Akoma--main` folder.
4. Refresh/reopen Akoma.

The migration creates only two small per-user read-state tables. It does not modify or delete profiles, messages, matches, or chat records.

## Notes
- New likes/requests already have their existing Requests badge.
- Message counts are based on messages sent by the other member after the last read timestamp.
- Push delivery remains separate and unchanged; this update adds in-app badges.

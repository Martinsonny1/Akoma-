# Account deletion fix

This update fixes the Supabase account deletion path. It removes the member's chat media for conversations they participate in, removes their own photos/verification/vault files, then calls the existing `public.delete_my_account()` SECURITY DEFINER function so profile-linked records cascade safely. It does not truncate tables or delete other members.

## Required deployment steps
1. Deploy the complete `Akoma--main` folder to the same hosting project.
2. In Supabase Dashboard → SQL Editor, run `supabase/account_deletion_fix.sql` once.
3. In Supabase Dashboard → Edge Functions → `media-lifecycle`, deploy the updated function from `supabase/functions/media-lifecycle/index.ts` (or deploy the project using your normal Edge Function deployment method).
4. Test with a disposable account first. Do not test by deleting your main/admin account.

If deletion still fails, the app now returns a more specific error detail. Check Supabase Edge Function Logs for `AKOMA DELETE ACCOUNT ERROR`.

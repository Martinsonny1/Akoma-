# Publish Akoma without Python or Node.js

## Easiest method: Netlify Drop

1. Extract the ZIP on your computer.
2. Open the extracted Akoma folder (the one containing `index.html`).
3. Select everything in that folder (`index.html`, `css`, `js`, `admin`, `landing.html`, icons, manifest and service worker).
4. Visit https://app.netlify.com/drop and sign in or create a free Netlify account.
5. Drag the selected application folder onto the drop area (Netlify publishes its contents).
6. Netlify gives you an HTTPS website URL. Open it on your phone or PC.
7. For a custom domain, add it from the site's Domain settings.

You do not need to install Python, Node.js, npm, Git or an editor to publish the files.

## Before real users can register

- Edit `js/config.js` and enter your Supabase Project URL and public publishable/anon key. This is the only browser configuration file.
- Run `supabase/schema.sql` in your Supabase SQL Editor.
- Enable Email authentication and set the Supabase Site URL and allowed redirect URLs to the exact deployed HTTPS URL.
- If email confirmation is on, configure custom SMTP for reliable delivery.
- Re-upload the updated application folder after editing `config.js`.

## Keep these security rules

- Use only the Supabase publishable/anon key in `config.js`. Never expose the `service_role` key or any secret key in a public website.
- Confirm Row Level Security is enabled and test the SQL policies.
- A public URL does not mean the app is production-tested: test account creation, sign-in, email confirmation, profile verification, admin permissions, image uploads, blocking, reporting and deletion.

## Admin dashboard

After deployment, the admin dashboard is at `/admin/` on your deployed domain. Create your account and complete onboarding first, then follow `SUPABASE_SETUP_GUIDE.md` to assign the admin role securely.


## About editor 'implicit any' warnings

Some mobile code editors run TypeScript diagnostics against JavaScript embedded in `landing.html`. Warnings such as 'Parameter implicitly has an any type' are TypeScript type-checking notices; they are not, by themselves, JavaScript runtime errors and do not explain a blank admin page. The admin page has its own JavaScript files under `admin/` and `js/`.

# BUDO Studio integration setup

The application runs locally with an in-memory adapter, but production mode should use the three external services below.

## Supabase

1. Create a Supabase project.
2. Run [`../supabase/schema.sql`](../supabase/schema.sql) in the SQL editor.
3. Set `SUPABASE_URL` and either the server-only `SUPABASE_SECRET_KEY` (`sb_secret_...`) or legacy `SUPABASE_SERVICE_ROLE_KEY` in the server `.env`.
4. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in `frontend/.env.local` (the legacy `VITE_SUPABASE_ANON_KEY` name is also supported). The main BUDO Studio editor opens without a login.
5. Keep `REQUIRE_AUTH=false` in the server `.env` for the public main app. Set it to `true` only if you intentionally want to protect the API and require users to sign in.

For administrator access, set `ADMIN_EMAILS=admin@example.com` as a temporary server-only bootstrap allowlist, or set the user’s trusted Supabase `app_metadata.role` to `admin`. The API exposes `/api/admin/access`, `/api/admin/users`, and `PUT /api/admin/users/:id/role`. Do not use editable `user_metadata` for authorization.

The service-role key remains server-only. The React bundle receives only the publishable/anon key and uses Supabase Auth plus Realtime.

This is a Vite/React client, so the Next.js `page.tsx`, cookie server client, and Next middleware examples are not used. The browser helper is `frontend/src/supabase/client.js`; `createBrowserClient` manages the browser session and refresh behavior. The Express API still requires `SUPABASE_SERVICE_ROLE_KEY` for server-side database access.

## Cloudinary

Set `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` in the server `.env`. Template backgrounds and candidate source images are uploaded through Express; the final PDF/ZIP never passes through Cloudinary.

## Gemini

Set `GEMINI_API_KEY` and optionally `GEMINI_MODEL` in the server `.env`. The UI calls Gemini only for explicit brainstorming requests or image OCR. OCR results are returned as an editable draft and are not inserted until the user confirms the candidate form.

## Start

```powershell
npm install
npm --prefix frontend install
npm run build:full
npm start
```

Then open `http://localhost:8787/`. This is the only user-facing BUDO Studio app; older `/workspace/` links redirect to the same main editor.

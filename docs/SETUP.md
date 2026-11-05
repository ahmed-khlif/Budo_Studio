# BUDO Studio setup checklist

## Run the app

```powershell
npm install
npm start
```

Open `http://localhost:8787/`. This is the single main BUDO Studio app containing the editor, candidates, imports, templates, AI tools, and exports. Old `/workspace/` links redirect to `/`.

## Enable Supabase persistence

1. Open the Supabase SQL Editor for the project configured in `.env`.
2. Paste and run the complete [`../supabase/schema.sql`](../supabase/schema.sql) file.
3. Confirm that `candidates`, `template_presets`, and `template_assets` exist in the `public` schema.
4. Run [`../supabase/shared_workspace.sql`](../supabase/shared_workspace.sql) if all authenticated accounts should collaborate in the shared studio.
5. Run [`../supabase/certificates.sql`](../supabase/certificates.sql) to enable QR verification records and the public certificate page.
6. Check `http://localhost:8787/api/health` and verify `schemaReady` and `certificatesReady` are `true`.
7. Sign in through the BUDO Studio connection dialog, then use **Enregistrer tout** to sync candidates and the active template preset.

QR verification requires the current `certificates.sql` (including the `issue_key` column). Re-exporting the same candidate with the same data and template reuses the same QR token; changing the certificate data or template creates a new issuance. The public page reconstructs the certificate from the saved template snapshot, including the background, positioned fields, styling, and QR code; it does not require a per-certificate Cloudinary preview upload.

The server uses the server-only `SUPABASE_SECRET_KEY` (or legacy `SUPABASE_SERVICE_ROLE_KEY`). Never put either key in frontend files. The browser only receives the Supabase publishable key.

## Excel serial numbers

During the import preview, the **N° officiel · رقم تسلسلي** column is read from a detected header such as `رقم تسلسلي`, `Serial number`, or `Numéro officiel`. For the original BUDO workbook layout, column `E` is used as the fallback. The value is saved as `serial` and is used by the certificate’s diploma-number field.

## Services

- Cloudinary stores imported certificate backgrounds, including original PDF uploads, and candidate source images uploaded for OCR.
- Gemini is used only when the user explicitly requests brainstorming or OCR.
- PDF and ZIP exports are generated in the browser. The final export files are never sent to Express, Supabase, Cloudinary, or Gemini. The public verification page renders from the saved template snapshot instead of storing a separate certificate JPG.

## Troubleshooting

If the app shows **Schéma Supabase manquant**, the SQL file has not been applied or the tables are not exposed by the Supabase Data API. Run the schema again, then reload the app and check `/api/health`.

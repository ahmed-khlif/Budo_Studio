# BUDO Studio setup checklist

## Run the app

```powershell
npm install
npm start
```

Open `http://localhost:8787/`. The original BUDO Studio editor is the main app; the React migration is available at `http://localhost:8787/workspace/`.

## Enable Supabase persistence

1. Open the Supabase SQL Editor for the project configured in `.env`.
2. Paste and run the complete [`../supabase/schema.sql`](../supabase/schema.sql) file.
3. Confirm that `candidates`, `template_presets`, and `template_assets` exist in the `public` schema.
4. Check `http://localhost:8787/api/health` and verify `schemaReady` is `true`.
5. Sign in through the BUDO Studio connection dialog, then use **Enregistrer tout** to sync candidates and the active template preset.

The server uses the server-only `SUPABASE_SECRET_KEY` (or legacy `SUPABASE_SERVICE_ROLE_KEY`). Never put either key in frontend files. The browser only receives the Supabase publishable key.

## Excel serial numbers

During the import preview, the **N° officiel · رقم تسلسلي** column is read from a detected header such as `رقم تسلسلي`, `Serial number`, or `Numéro officiel`. For the original BUDO workbook layout, column `E` is used as the fallback. The value is saved as `serial` and is used by the certificate’s diploma-number field.

## Services

- Cloudinary stores imported certificate backgrounds, including original PDF uploads, and candidate source images uploaded for OCR.
- Gemini is used only when the user explicitly requests brainstorming or OCR.
- PDF and ZIP exports are generated in the browser. Final generated files are never sent to Express, Supabase, Cloudinary, or Gemini.

## Troubleshooting

If the app shows **Schéma Supabase manquant**, the SQL file has not been applied or the tables are not exposed by the Supabase Data API. Run the schema again, then reload the app and check `/api/health`.

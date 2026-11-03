# PC tracker sync (no Google Cloud)

Keeps the **live Netlify site** updated from an Excel export on this computer.

## Daily use

1. In Google Sheets: **File → Download → Microsoft Excel (.xlsx)**
2. Save/overwrite as:

   `K:\Cursor\zann-lab\data\tracker.xlsx`

3. On this PC, in a terminal:

```bash
cd K:\Cursor\zann-lab
npm run sync:tracker
```

4. Leave that window open while you want live updates.
5. When the sheet changes, download again over the same file (or wait for the 10‑minute timer after you replace the file).

The Netlify site reads Supabase, so phones/other Wi‑Fi see the new cases after sync finishes.

## Notes

- `.env.local` must have `DATABASE_URL` pointing at Supabase (already set for go-live).
- Ctrl+C stops the sync loop.
- Excel upload on the Import page is the same idea, one time, from the browser.

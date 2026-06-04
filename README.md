# OverLoader

Offline-first progressive overload tracker built as a static PWA.

## Local Development

Open the app with a static server:

```sh
python3 -m http.server 8801
```

Then visit:

```text
http://127.0.0.1:8801/
```

For local repo JSON push buttons, use the sync server:

```sh
python3 scripts/repo_sync_server.py --port 8801
```

## Deployment

This app is designed to run from GitHub Pages as a static site. Data is stored locally in the browser first, with optional Supabase sync for phone/laptop backup.

Note: `strong-history.js` contains generated workout history seed data. Do not publish this repository publicly unless that data is acceptable to expose.

## Supabase Sync

The app supports a single-owner Supabase sync backend. It does not use Supabase user accounts. Instead, one private sync secret protects two RPC functions that read/write the OverLoader cloud snapshot.

1. Create a free Supabase project.
2. Open `supabase.sql`.
3. Replace `REPLACE_WITH_A_LONG_RANDOM_SYNC_SECRET` with a long private phrase.
4. Run the SQL in the Supabase SQL editor.
5. In OverLoader, open `Data -> Cloud Sync`.
6. Paste the Supabase project URL, anon public key, and the same sync secret.
7. Press `Sync now`.

Use the same URL, anon key, and sync secret on each device. On a new device, `Sync now` pulls the cloud snapshot first if one already exists.

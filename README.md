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

This app is designed to run from GitHub Pages as a static site. Data is stored locally in the browser for now; cloud sync should be added with Supabase or a similar backend before relying on multi-device sync.

Note: `strong-history.js` contains generated workout history seed data. Do not publish this repository publicly unless that data is acceptable to expose.

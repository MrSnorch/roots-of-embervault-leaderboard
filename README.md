# ROE Leaderboard Dashboard

Tracks the [ROE](https://embervault.ruyui.com) global leaderboard daily, stores snapshots in `docs/state.json`, and serves a live dashboard via GitHub Pages.

## Setup

### 1. Create repo on GitHub

```bash
gh repo create roe-leaderboard --public
cd roe-leaderboard
git init
# copy all files here
git add .
git commit -m "init"
git push -u origin main
```

### 2. Enable GitHub Pages

Settings → Pages → Source: **Deploy from branch** → `main` / `docs` folder → Save.

Your dashboard will be at: `https://<your-username>.github.io/roe-leaderboard/`

### 3. Enable Actions

Settings → Actions → General → Allow all actions → Save.

The `fetch.yml` workflow runs every day at **12:00 UTC** automatically.

To run it immediately: Actions → "Fetch Leaderboard" → Run workflow.

## File structure

```
.github/
  workflows/
    fetch.yml          # daily cron: fetch API → update state.json → commit
scripts/
  update-state.js      # merges new snapshot into docs/state.json
docs/
  index.html           # dashboard (GitHub Pages root)
  state.json           # accumulated snapshots, grows daily
```

## State format

```json
{
  "snapshots": {
    "2026-06-14": {
      "ts": "2026-06-14T12:00:00.000Z",
      "online": 4,
      "players": {
        "mrsnorch": { "rank": 3, "level": 100, "score": 108795, "runeCount": 2455061, ... }
      }
    }
  },
  "players": {
    "mrsnorch": { "wallet": "0x07fd...", "activeSince": "2026-01-29T21:16:13.418+00:00" }
  }
}
```

Keeps last **365 days** of snapshots. `state.json` grows ~50–100 KB/year.

## Dashboard features

- **Stats bar** — online now, top score, total runes, avg level, days tracked
- **Online / day chart** — history of concurrent online players
- **Top-10 score chart** — bar chart of latest scores
- **Player history chart** — score / rank / runes / level over time for any player
- **Leaderboard table** — sortable, searchable, snapshot selector, rank delta vs previous day
- YOUR account (`mrsnorch`) highlighted in purple

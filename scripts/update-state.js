const fs = require('fs');
const path = require('path');

const RAW_PATH    = '/tmp/leaderboard_raw.json';
const STATE_PATH  = path.join(__dirname, '../docs/state.json');
const SNAPS_DIR   = path.join(__dirname, '../docs/snapshots');
const HOURLY_DIR  = path.join(__dirname, '../docs/hourly');
const HOURLY_INDEX_PATH = path.join(HOURLY_DIR, 'index.json');

const now = new Date();
const today = now.toISOString().slice(0, 10); // YYYY-MM-DD

// Load raw fetch
const raw = JSON.parse(fs.readFileSync(RAW_PATH, 'utf8'));
if (!raw.success || !Array.isArray(raw.data)) {
  console.error('Invalid API response');
  process.exit(1);
}

// Ensure snapshots dir exists
if (!fs.existsSync(SNAPS_DIR)) fs.mkdirSync(SNAPS_DIR, { recursive: true });

// Load state.json (players meta + index of snapshot dates)
let state = { snapshots: [], players: {} };
if (fs.existsSync(STATE_PATH)) {
  state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  // migrate old format (snapshots was an object)
  if (!Array.isArray(state.snapshots)) state.snapshots = Object.keys(state.snapshots).sort();
}

// Load the hourly snapshot closest to 23:00 UTC the previous day (the hour
// just before midnight) for the topFarmers delta. This matches
// hourly_stats.html, which also uses that hour as a hidden calculation
// baseline so its "00:00" row shows the gain from 23:00->00:00.
let prevSnapshot = null;
if (fs.existsSync(HOURLY_INDEX_PATH)) {
  const hourlyIndex = JSON.parse(fs.readFileSync(HOURLY_INDEX_PATH, 'utf8'));
  const baselineTime = new Date(`${today}T00:00:00Z`).getTime() - 3600 * 1000; // 23:00 previous day
  // hourlyIndex is sorted ascending; pick the hour closest in actual elapsed time to baselineTime.
  let closest = null;
  let closestDiff = Infinity;
  for (const h of hourlyIndex) {
    const hTime = new Date(h + ':00:00Z').getTime();
    const diff = Math.abs(hTime - baselineTime);
    if (diff < closestDiff) { closest = h; closestDiff = diff; }
  }
  if (closest) {
    const gz = require('zlib').gunzipSync(fs.readFileSync(path.join(HOURLY_DIR, `${closest}.json.gz`)));
    prevSnapshot = JSON.parse(gz.toString());
  }
}

// Build today's snapshot
const snapshot = {
  date: today,
  ts: new Date().toISOString(),
  online: 0,
  activeToday: 0,
  players: {}
};

for (const p of raw.data) {
  if (p.isOnline) snapshot.online++;
  if (p.lastActive && p.lastActive.slice(0, 10) === today) snapshot.activeToday++;

  snapshot.players[p.username] = {
    rank:            p.rank,
    level:           p.level,
    score:           p.score,
    runeCount:       p.runeCount,
    multiplier:      p.multiplier,
    ruyuiNftCount:   p.ruyuiNftCount,
    isOnline:        p.isOnline,
    guildPassHolder: p.guildPassHolder,
    wallet:          p.wallet,
    activeSince:     p.activeSince,
    lastActive:      p.lastActive,
  };

  // Keep players meta (wallet/activeSince never change; lastActive = latest known)
  if (!state.players[p.username]) {
    state.players[p.username] = { wallet: p.wallet, activeSince: p.activeSince };
  }
  state.players[p.username].lastActive = p.lastActive;
}

// Top farmers vs previous snapshot
if (prevSnapshot) {
  const deltas = [];
  for (const [username, data] of Object.entries(snapshot.players)) {
    const prev = prevSnapshot.players[username];
    if (!prev) continue;
    const delta = data.runeCount - prev.runeCount;
    if (delta > 0) deltas.push({ username, delta, runeCount: data.runeCount });
  }
  deltas.sort((a, b) => b.delta - a.delta);
  snapshot.topFarmers = deltas.slice(0, 10).map(d => ({
    username: d.username, runesGained: d.delta, runeCount: d.runeCount,
  }));
  console.log(`Top farmer: ${snapshot.topFarmers[0]?.username} +${snapshot.topFarmers[0]?.runesGained?.toLocaleString()} runes`);
} else {
  snapshot.topFarmers = [];
  console.log('No previous snapshot, skipping top farmers');
}

// Write individual snapshot file
fs.writeFileSync(path.join(SNAPS_DIR, `${today}.json`), JSON.stringify(snapshot));
console.log(`Written docs/snapshots/${today}.json`);

// Update state.json index (add today if not already present, keep sorted)
if (!state.snapshots.includes(today)) {
  state.snapshots.push(today);
  state.snapshots.sort();
}
// Keep index to last 365 entries
if (state.snapshots.length > 365) state.snapshots = state.snapshots.slice(-365);

fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
console.log(`state.json updated — ${state.snapshots.length} snapshots indexed, online: ${snapshot.online}, activeToday: ${snapshot.activeToday}`);

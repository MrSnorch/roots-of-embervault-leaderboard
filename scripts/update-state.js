const fs = require('fs');
const path = require('path');

const RAW_PATH = '/tmp/leaderboard_raw.json';
const STATE_PATH = path.join(__dirname, '../docs/state.json');

const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

// Load raw fetch
const raw = JSON.parse(fs.readFileSync(RAW_PATH, 'utf8'));
if (!raw.success || !Array.isArray(raw.data)) {
  console.error('Invalid API response');
  process.exit(1);
}

// Load existing state or init
let state = { snapshots: {}, players: {} };
if (fs.existsSync(STATE_PATH)) {
  state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
}

// Find previous snapshot for delta calculation
const prevKeys = Object.keys(state.snapshots).sort();
const prevKey = prevKeys.length > 0 ? prevKeys[prevKeys.length - 1] : null;
const prevSnapshot = prevKey ? state.snapshots[prevKey] : null;

// Build today's snapshot — store ALL fields from API
const snapshot = {
  ts: new Date().toISOString(),
  online: 0,
  activeToday: 0,
  players: {}
};

for (const p of raw.data) {
  if (p.isOnline) snapshot.online++;

  // Count players whose lastActive falls on today's date
  if (p.lastActive && p.lastActive.slice(0, 10) === today) {
    snapshot.activeToday++;
  }

  // Store every field the API returns
  snapshot.players[p.username] = {
    rank:            p.rank,
    level:           p.level,
    score:           p.score,
    runeCount:       p.runeCount,
    multiplier:      p.multiplier,
    ruyuiNftCount:   p.ruyuiNftCount,
    isOnline:        p.isOnline,
    guildPassHolder: p.guildPassHolder,
    // previously only stored in players meta — now in every snapshot
    wallet:          p.wallet,
    activeSince:     p.activeSince,
    lastActive:      p.lastActive,
  };

  // Keep players meta for quick lookup (wallet, activeSince never change)
  if (!state.players[p.username]) {
    state.players[p.username] = { wallet: p.wallet, activeSince: p.activeSince };
  }
  // lastActive in meta = latest known value (for fallback / current-state queries)
  state.players[p.username].lastActive = p.lastActive;
}

// Compute top farmers (rune delta vs previous snapshot)
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
    username:    d.username,
    runesGained: d.delta,
    runeCount:   d.runeCount,
  }));
  console.log(`Top farmer: ${snapshot.topFarmers[0]?.username} +${snapshot.topFarmers[0]?.runesGained?.toLocaleString()} runes`);
} else {
  snapshot.topFarmers = [];
  console.log('No previous snapshot, skipping top farmers');
}

state.snapshots[today] = snapshot;

// Keep last 365 days only
const keys = Object.keys(state.snapshots).sort();
if (keys.length > 365) {
  for (const old of keys.slice(0, keys.length - 365)) {
    delete state.snapshots[old];
  }
}

fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
console.log(`Snapshot saved for ${today}, online: ${snapshot.online}, activeToday: ${snapshot.activeToday}`);

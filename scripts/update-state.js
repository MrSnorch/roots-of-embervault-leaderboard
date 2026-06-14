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

// Build today's snapshot
const snapshot = {
  ts: new Date().toISOString(),
  online: 0,
  players: {}
};

for (const p of raw.data) {
  if (p.isOnline) snapshot.online++;
  snapshot.players[p.username] = {
    rank: p.rank,
    level: p.level,
    score: p.score,
    runeCount: p.runeCount,
    multiplier: p.multiplier,
    ruyuiNftCount: p.ruyuiNftCount,
    isOnline: p.isOnline,
    guildPassHolder: p.guildPassHolder,
  };

  // Upsert player meta (static info that rarely changes)
  if (!state.players[p.username]) {
    state.players[p.username] = {
      wallet: p.wallet,
      activeSince: p.activeSince,
    };
  }
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
console.log(`Snapshot saved for ${today}, online: ${snapshot.online}`);

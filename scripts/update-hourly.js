const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const RAW_PATH   = '/tmp/leaderboard_raw.json';
const HOURLY_DIR = path.join(__dirname, '../docs/hourly');
const INDEX_PATH = path.join(HOURLY_DIR, 'index.json');
const RECENT_PATH = path.join(HOURLY_DIR, 'recent.json');
const RETENTION_DAYS = 30;
const RETENTION_HOURS = 24 * RETENTION_DAYS; // rolling window for both full snapshots and the aggregate cache

const now = new Date();
const hourKey = now.toISOString().slice(0, 13); // "2026-06-17T14"
const today = now.toISOString().slice(0, 10);

const raw = JSON.parse(fs.readFileSync(RAW_PATH, 'utf8'));
if (!raw.success || !Array.isArray(raw.data)) {
  console.error('Invalid API response');
  process.exit(1);
}

if (!fs.existsSync(HOURLY_DIR)) fs.mkdirSync(HOURLY_DIR, { recursive: true });

let online = 0;
let activeToday = 0;
const players = {};

for (const p of raw.data) {
  if (p.isOnline) online++;
  if (p.lastActive && p.lastActive.slice(0, 10) === today) activeToday++;

  // wallet/activeSince intentionally omitted: static per player, already kept
  // in docs/state.json's players map (maintained by update-state.js).
  players[p.username] = {
    rank:            p.rank,
    level:           p.level,
    score:           p.score,
    runeCount:       p.runeCount,
    multiplier:      p.multiplier,
    ruyuiNftCount:   p.ruyuiNftCount,
    isOnline:        p.isOnline,
    guildPassHolder: p.guildPassHolder,
    lastActive:      p.lastActive,
  };
}

const snapshot = { ts: now.toISOString(), online, activeToday, players };

// Full per-player snapshot, gzip-compressed, one file per hour (pruned after RETENTION_DAYS below).
const gz = zlib.gzipSync(Buffer.from(JSON.stringify(snapshot)));
fs.writeFileSync(path.join(HOURLY_DIR, `${hourKey}.json.gz`), gz);
console.log(`Written docs/hourly/${hourKey}.json.gz (${gz.length} bytes)`);

// Index of recorded hours, capped to the retention window (oldest get pruned below).
let index = [];
if (fs.existsSync(INDEX_PATH)) index = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));
if (!index.includes(hourKey)) {
  index.push(hourKey);
  index.sort();
}

// Prune full snapshots older than the retention window (ISO hour strings sort lexicographically).
const cutoff = new Date(now.getTime() - RETENTION_HOURS * 3600 * 1000).toISOString().slice(0, 13);
const stale = index.filter(h => h < cutoff);
for (const h of stale) {
  const f = path.join(HOURLY_DIR, `${h}.json.gz`);
  if (fs.existsSync(f)) fs.unlinkSync(f);
}
index = index.filter(h => h >= cutoff);
fs.writeFileSync(INDEX_PATH, JSON.stringify(index));

// Small rolling aggregate cache (online/activeToday only) so the dashboard
// can chart the full retention window without fetching hundreds of gzip files.
let recent = [];
if (fs.existsSync(RECENT_PATH)) recent = JSON.parse(fs.readFileSync(RECENT_PATH, 'utf8'));
recent = recent.filter(e => e.hour !== hourKey); // replace if this hour already ran
recent.push({ hour: hourKey, online, activeToday });
recent = recent.filter(e => e.hour >= cutoff); // same window as the full snapshots above
recent.sort((a, b) => a.hour.localeCompare(b.hour));
fs.writeFileSync(RECENT_PATH, JSON.stringify(recent));

console.log(`hourly/index.json: ${index.length} hours indexed (${stale.length} pruned), hourly/recent.json: ${recent.length} entries`);

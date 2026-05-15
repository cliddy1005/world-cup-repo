import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getAdminDb } from "./firebase-admin.mjs";
import { syncFootballData } from "./football-data-sync.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = Number(process.env.PORT || 3000);
const db = getAdminDb(process.env.FIREBASE_DATABASE_URL);

let lastSyncResult = null;
const syncRequestTimes = [];
const MAX_SYNC_CALLS_PER_MINUTE = Math.max(1, Number(process.env.MAX_SYNC_CALLS_PER_MINUTE || 10));
const LIVE_SYNC_MS = Math.max(10_000, Number(process.env.LIVE_SYNC_SECONDS || 10) * 1000);
const AUTO_SYNC_SECONDS = Number(process.env.AUTO_SYNC_SECONDS || 0);
const IDLE_SYNC_MS = AUTO_SYNC_SECONDS > 0 ? Math.max(60_000, AUTO_SYNC_SECONDS * 1000) : 0;

function pruneSyncRequestTimes(now = Date.now()) {
  const cutoff = now - 60_000;
  while (syncRequestTimes.length && syncRequestTimes[0] <= cutoff) {
    syncRequestTimes.shift();
  }
}

function enforceSyncBudget(force = false) {
  const now = Date.now();
  pruneSyncRequestTimes(now);
  if (syncRequestTimes.length >= MAX_SYNC_CALLS_PER_MINUTE) {
    const retryAfterMs = Math.max(1_000, 60_000 - (now - syncRequestTimes[0]));
    const err = new Error(`Sync limit reached. Try again in ${Math.ceil(retryAfterMs / 1000)}s.`);
    err.status = force ? 503 : 429;
    err.retryAfterMs = retryAfterMs;
    throw err;
  }
  syncRequestTimes.push(now);
}

async function guardedSync(force = false) {
  enforceSyncBudget(force);
  lastSyncResult = await syncFootballData({ db, token: process.env.FOOTBALL_DATA_TOKEN });
  return lastSyncResult;
}

app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "docs")));

app.get("/api/health", (req, res) => {
  pruneSyncRequestTimes();
  res.json({
    ok: true,
    lastSyncAt: lastSyncResult?.syncedAt || null,
    lastSyncResult,
    syncCallsLastMinute: syncRequestTimes.length,
    maxSyncCallsPerMinute: MAX_SYNC_CALLS_PER_MINUTE
  });
});

app.post("/api/sync", async (req, res) => {
  try {
    const result = await guardedSync(false);
    res.json(result);
  } catch (err) {
    if (err.retryAfterMs) {
      res.set("Retry-After", String(Math.ceil(err.retryAfterMs / 1000)));
    }
    res.status(err.status || 500).json({ ok: false, error: err.message });
  }
});

let autoSyncTimer = null;

function scheduleNextAutoSync(delayMs) {
  if (autoSyncTimer) clearTimeout(autoSyncTimer);
  autoSyncTimer = setTimeout(runAutoSyncLoop, delayMs);
}

async function runAutoSyncLoop() {
  try {
    const result = await guardedSync(true);
    const nextDelayMs = result?.liveMatchCount > 0 ? LIVE_SYNC_MS : IDLE_SYNC_MS;
    console.log(
      `Auto-sync ok: ${result.matchCount} matches, ${result.liveMatchCount} live. Next sync in ${Math.round(nextDelayMs / 1000)}s.`
    );
    scheduleNextAutoSync(nextDelayMs);
  } catch (err) {
    const retryMs = err.retryAfterMs || LIVE_SYNC_MS;
    console.error("Auto-sync failed:", err.message);
    scheduleNextAutoSync(retryMs);
  }
}

if (IDLE_SYNC_MS > 0) {
  console.log(
    `Auto-sync enabled. Idle interval ${Math.round(IDLE_SYNC_MS / 1000)}s, live interval ${Math.round(LIVE_SYNC_MS / 1000)}s, budget ${MAX_SYNC_CALLS_PER_MINUTE} calls/minute.`
  );
  runAutoSyncLoop().catch(err => console.error("Initial auto-sync failed:", err.message));
}

const server = app.listen(port, () => {
  console.log(`WC Pool app running on http://localhost:${port}`);
});

server.on("error", err => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `Port ${port} is already in use. Stop the existing process or set PORT to another value, for example PORT=3001.`
    );
    process.exit(1);
  }
  throw err;
});

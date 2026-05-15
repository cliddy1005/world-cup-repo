# World Cup Pool — football-data.org + Firebase

This package contains a full single-page World Cup pool app plus a small Node backend that syncs fixtures/results from football-data.org into Firebase Realtime Database.

The browser app **does not call football-data.org directly**. This keeps your API token private and keeps you under the football-data.org free-tier rate limit.

## What is included

```txt
public/index.html              Frontend app
server/server.mjs              Express server, static hosting, `/api/sync`
server/sync-once.mjs           Manual one-shot sync command
server/football-data-sync.mjs  football-data.org mapper/sync logic
server/firebase-admin.mjs      Firebase Admin setup
firebase-database.rules.json   Realtime Database rules for pools/predictions
.env.example                   Environment variable template
package.json                   Node scripts/dependencies
```

## Features

- Firebase Auth sign-in/sign-up.
- Multiple pools with invite codes.
- Pick 4 teams per participant.
- Random outright-winner assignment.
- Leaderboard with team points, prediction points, and outright bonus.
- Daily score prediction game.
- Prediction scoring:
  - Correct result: `+5`
  - Exact score: `+10` extra
  - Exact score total: `+15`
- Daily prediction leaderboard.
- H2H view when players' teams face each other.
- Fixtures/results from football-data.org via backend sync.
- Full-screen goal animation when Firebase score values increase.
- Admin sync button, included in the backend rolling per-minute request budget.
- Admin animation test button.

## Important security note

Do **not** put your football-data.org API token in `public/index.html`.

Use `.env` locally or hosting-provider secrets in production.

Since the token was pasted into chat earlier, consider regenerating it in football-data.org after testing.

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create `.env`

Copy the example file:

```bash
cp .env.example .env
```

Edit `.env`:

```bash
FOOTBALL_DATA_TOKEN=your_real_token_here
FIREBASE_DATABASE_URL=https://wc-pool-2026-default-rtdb.europe-west1.firebasedatabase.app
PORT=3000
AUTO_SYNC_SECONDS=0
LIVE_SYNC_SECONDS=10
MAX_SYNC_CALLS_PER_MINUTE=10
```

`AUTO_SYNC_SECONDS=0` disables automatic polling.

If you want live games to refresh every 10 seconds while staying inside a 10-calls-per-minute budget, use:

```bash
AUTO_SYNC_SECONDS=60
LIVE_SYNC_SECONDS=10
MAX_SYNC_CALLS_PER_MINUTE=10
```

How this works:

- When there are no live matches, the backend syncs every `AUTO_SYNC_SECONDS`.
- When at least one synced match is live, the backend switches to `LIVE_SYNC_SECONDS`.
- The backend enforces a rolling `MAX_SYNC_CALLS_PER_MINUTE` limit across both auto-sync and manual `Sync Now` clicks.
- `LIVE_SYNC_SECONDS` has a minimum of 10 seconds and `AUTO_SYNC_SECONDS` has a minimum of 60 seconds.

### 3. Add Firebase Admin credentials

Download a Firebase service account JSON from Firebase Console and run:

```bash
export GOOGLE_APPLICATION_CREDENTIALS="/absolute/path/to/firebase-service-account.json"
```

On Windows PowerShell:

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS="C:\path\to\firebase-service-account.json"
```

### 4. Start the app

```bash
npm start
```

Open:

```txt
http://localhost:3000
```


## Firebase Realtime Database rules

This package includes:

```txt
firebase-database.rules.json
```

Apply those rules in:

```txt
Firebase Console → Realtime Database → Rules
```

The important fix is that the browser no longer reads `/predictions` globally. It now listens only to:

```txt
predictions/{activePoolId}
```

Users can only read predictions for pools they belong to, and can only write their own prediction rows.

The backend uses Firebase Admin, so it bypasses these rules when writing `fixtures`, `knockout`, and `meta/footballData`.

### First admin bootstrap

Because only admins can create pools or promote other admins, manually add your own Firebase Auth UID once:

```txt
admins/{YOUR_UID}: true
```

After that, use the Admin screen inside the app.

## Syncing fixtures/results

### Manual sync from command line

```bash
npm run sync
```

### Manual sync from the app

Sign in as an admin and open the Admin tab, then press **Sync Now**.

The backend endpoint participates in the rolling request budget:

```txt
POST /api/sync
```

With `LIVE_SYNC_SECONDS=10`, auto-sync uses 6 calls/minute during live games, leaving headroom for a few manual syncs while still staying within a `MAX_SYNC_CALLS_PER_MINUTE=10` cap.

## Testing the goal animation

### Safe visual test

Go to Admin and click:

```txt
Test Goal Animation
```

This only displays the overlay and does not change scores.

### Firebase detection test

Create a temporary fixture in Firebase:

```txt
fixtures/test_goal_1
  id: "test_goal_1"
  h: "England"
  a: "Brazil"
  s: "Group"
  g: "B"
  md: 1
  dt: "2026-06-11T20:00:00Z"
  status: "IN_PLAY"
  hs: 0
  as: 0
  done: false
  live: true
```

Then change:

```txt
hs: 0
```

to:

```txt
hs: 1
```

Any open browser app should show the goal animation.

Delete `fixtures/test_goal_1` afterwards.

## Notes on football-data.org data

The backend sync writes normalised data into:

```txt
fixtures
knockout
meta/footballData
```

The frontend reads Firebase only. It does not need the football-data.org token.

## Production deployment

Recommended production architecture:

```txt
Node backend / Cloud Run / Render / Railway / VPS
  -> football-data.org
  -> Firebase Realtime Database

Static browser app
  -> Firebase Auth + Realtime Database
```

For a low-traffic private pool, running this Express app on a small VPS/Raspberry Pi is also fine.

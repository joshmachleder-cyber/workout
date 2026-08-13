# Workout

A personal hypertrophy training app. Generates a fresh session every day, tracks every lift, and rotates in new exercises so nothing goes stale.

Runs entirely in the browser. No backend, no API keys, no accounts, no cost.

---

## Deploy to GitHub Pages

1. Create a new **public** repo on GitHub (Pages requires public on a free account).
2. Upload every file in this folder. There are no subfolders, so just select all of them and drag.
3. Go to **Settings > Pages**.
4. Under "Build and deployment", set Source to **Deploy from a branch**, branch `main`, folder `/ (root)`. Save.
5. Wait a minute or two, then open `https://YOURNAME.github.io/REPONAME/`.

On your phone, open that URL in Safari or Chrome and choose **Add to Home Screen**. It installs as a full-screen app with an icon and works offline.

## Load your training history

Open the **History** tab and tap **Load my past workouts**. That loads your last three sessions (Legs Jun 25, Arms Jun 29, Chest Jul 2), so the app opens knowing:

- You are due for **Arms**
- Your right shoulder was **sore** last session, so pressing is filtered accordingly
- Real overload targets, for example Bulgarian split squats stepping from 47.5 lb to 50 lb

Skip the import if you would rather start clean.

---

## How it generates

**Rotation.** Chest, Arms, Legs, in order. The pointer follows what you last *completed*, not the calendar, so skipping days picks up where you left off instead of jumping ahead.

**Structure.** Each day has four block orders in `window.TEMPLATES` inside `data.js`. The generator never picks the same one twice in a row, so the session shape changes every time.

**Exercise selection.** Every movement is scored by how many sessions have passed since you last did it. Longest gap wins, with a small random tiebreak. Favorited exercises (♥ on any exercise card) get a scoring nudge. Avoided exercises (🚫) are hard-excluded until you undo it from Settings. New movements surface naturally, and a demo video link appears the first time an exercise comes up.

**Landing screen.** Before generating a new day, the app asks three quick questions: what equipment you have (Full Gym / Home / Bodyweight Only), how much time you have (30/45/60/75/90 min or no limit), and how you feel (Fresh / Tired / Rough). All three apply immediately to that day's generation.

**Time budget.** Picking a time limit first scales every exercise's sets down toward that budget (floor of 2 sets each). If it's still over after that, optional exercises get dropped entirely, last block first. Legs-day non-negotiables (split squats, the full leg press sequence, all four machines) are never dropped, only shrunk — so a very tight legs-day budget will still run a bit long, on purpose. The Today screen shows the estimated time next to your target.

**Equipment.** The three landing-screen presets cover the common cases. For finer control, the Settings tab has a toggle per equipment type (barbell, dumbbells, cables, machine, bands, ez-bar, bodyweight). Whatever you turn off, the generator filters out of the pool before picking — same hard-filter pattern as the shoulder gate, so a block shrinks rather than substituting something unavailable.

**Readiness.** Tired trims accessory/isolation volume about 20%. Rough trims further and drops finisher blocks outright. Legs-day non-negotiables never disappear, only their set counts shrink. It's recorded on the session so History shows it.

**Shoulder gating.** Every exercise is tagged `yes`, `caution`, or `no` for shoulder safety. Your most recent logged shoulder status filters the pool:

| Status | What gets through |
|---|---|
| `sore` | `yes` only, hard stop |
| `minor` | `yes` and `caution` |
| `good` | everything except `no` |

This is a hard filter. If a block cannot be filled with safe movements, the block shrinks. It never substitutes an unsafe pick to hit a target count.

**Progressive overload.** Every exercise note carries an explicit cue against your last logged numbers. Top of the rep range means add weight, 5 lb on compounds and 2.5 lb on isolation. Logging an actual RIR of 3+ (more in the tank than the target called for) triggers the same jump even if you didn't top the rep range. Otherwise the target is the same weight for 1 to 2 more reps.

**Rest timer.** Tapping a set bubble to mark it done starts a rest countdown at the bottom of the screen — 150s for heavy compounds, 90s for moderate work, 60s for high-rep isolation, based on the exercise's rep range. +30s and Skip buttons are right there.

**Non-negotiables on legs day.** Bulgarian split squats, the full leg press sequence (bilateral, then right, then left), and all four machines (leg extension, leg curl, hip adductor, hip abductor) appear every single session regardless of which variant is chosen.

---

## Files

```
index.html            Today screen: panels, set bubbles, session log
history.html          Session history, top loads, export and import
settings.html         Equipment toggles, avoided/favorited exercises, gist sync
app.js                Rotation, selection, shoulder/equipment gates, overload math, gist sync
data.js               Exercise library, day templates, and your past sessions
manifest.json, sw.js  PWA install and offline support
icon-192.png, icon-512.png
```

Every file sits at the top level. There are no folders. If you ever re-upload, drag all of these in together.

## Adding exercises

Open `data.js` on github.com, click the pencil icon to edit, and append to the right day array inside `window.EXERCISES`:

```json
{
  "id": "unique-slug",
  "name": "Exercise Name",
  "slot": "incline",
  "equipment": "dumbbells",
  "shoulderSafe": "yes",
  "sets": 4,
  "repRange": "8-10",
  "rir": "1-2",
  "cue": "Form cue shown in the panel.",
  "video": "https://..."
}
```

`slot` has to match a slot used by that day's templates. More exercises per slot means more variety before anything repeats.

## Data and backups

History lives in `localStorage`, which is per browser and per device. Use **Export history** on the History tab for backups, and **Import** to move between devices manually.

Erasing browser data for the site erases your history, so export occasionally.

## Syncing between devices

The Settings tab can sync your history through a private GitHub Gist, no server involved:

1. Create a [personal access token](https://github.com/settings/tokens) with just the `gist` scope.
2. Paste it into Settings and tap **Push history to gist**. It creates a private gist and remembers its ID.
3. On your other device, open Settings, paste the same token and gist ID, and tap **Pull history from gist**.

The token and gist ID live in their own `localStorage` key, separate from your history, so they're never bundled into an exported/imported backup file. Pulling always overwrites what's on that device, so push from your most-current device first.

## Later: live AI generation

The generator is one function, `generateSession()` in `app.js`. To swap the rules engine for a Claude API call that writes sessions fresh each day, replace that function with a fetch to a small serverless proxy holding your key. GitHub Pages cannot hold a key, since it serves static files only and the repo is public, so the proxy has to live on Cloudflare Workers, Netlify, or Vercel. The rest of the app is unchanged as long as the returned shape matches.

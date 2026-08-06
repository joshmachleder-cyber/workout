# Workout

A personal hypertrophy training app. Generates a fresh session every day, tracks every lift, and rotates in new exercises so nothing goes stale.

Runs entirely in the browser. No backend, no API keys, no accounts, no cost.

---

## Deploy to GitHub Pages

1. Create a new **public** repo on GitHub (Pages requires public on a free account).
2. Upload every file in this folder, keeping the `data/` folder intact.
3. Go to **Settings > Pages**.
4. Under "Build and deployment", set Source to **Deploy from a branch**, branch `main`, folder `/ (root)`. Save.
5. Wait a minute or two, then open `https://YOURNAME.github.io/REPONAME/`.

On your phone, open that URL in Safari or Chrome and choose **Add to Home Screen**. It installs as a full-screen app with an icon and works offline.

## Load your training history

Open the **History** tab, tap **Import history**, and select `data/seed.json`. That loads your last three sessions (Legs Jun 25, Arms Jun 29, Chest Jul 2), so the app opens knowing:

- You are due for **Arms**
- Your right shoulder was **sore** last session, so pressing is filtered accordingly
- Real overload targets, for example Bulgarian split squats stepping from 47.5 lb to 50 lb

Skip the import if you would rather start clean.

---

## How it generates

**Rotation.** Chest, Arms, Legs, in order. The pointer follows what you last *completed*, not the calendar, so skipping days picks up where you left off instead of jumping ahead.

**Structure.** Each day has four block orders in `data/templates.json`. The generator never picks the same one twice in a row, so the session shape changes every time.

**Exercise selection.** Every movement is scored by how many sessions have passed since you last did it. Longest gap wins, with a small random tiebreak. New movements surface naturally, and a demo video link appears the first time an exercise comes up.

**Shoulder gating.** Every exercise is tagged `yes`, `caution`, or `no` for shoulder safety. Your most recent logged shoulder status filters the pool:

| Status | What gets through |
|---|---|
| `sore` | `yes` only, hard stop |
| `minor` | `yes` and `caution` |
| `good` | everything except `no` |

This is a hard filter. If a block cannot be filled with safe movements, the block shrinks. It never substitutes an unsafe pick to hit a target count.

**Progressive overload.** Every exercise note carries an explicit cue against your last logged numbers. Top of the rep range means add weight, 5 lb on compounds and 2.5 lb on isolation. Otherwise the target is the same weight for 1 to 2 more reps.

**Non-negotiables on legs day.** Bulgarian split squats, the full leg press sequence (bilateral, then right, then left), and all four machines (leg extension, leg curl, hip adductor, hip abductor) appear every single session regardless of which variant is chosen.

---

## Files

```
index.html            Today screen: panels, set bubbles, session log
history.html          Session history, top loads, export and import
app.js                Rotation, selection, shoulder gate, overload math
data/exercises.json   Exercise library, tagged by slot and shoulder safety
data/templates.json   Day templates and block orderings
data/seed.json        Your existing training history
manifest.json, sw.js  PWA install and offline support
```

## Adding exercises

Append to the right day array in `data/exercises.json`:

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

History lives in `localStorage`, which is per browser and per device. Phone and laptop will not share data. Use **Export history** on the History tab for backups, and **Import** to move between devices.

Erasing browser data for the site erases your history, so export occasionally.

## Later: live AI generation

The generator is one function, `generateSession()` in `app.js`. To swap the rules engine for a Claude API call that writes sessions fresh each day, replace that function with a fetch to a small serverless proxy holding your key. GitHub Pages cannot hold a key, since it serves static files only and the repo is public, so the proxy has to live on Cloudflare Workers, Netlify, or Vercel. The rest of the app is unchanged as long as the returned shape matches.

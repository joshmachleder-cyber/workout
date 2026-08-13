/* =========================================================
   Josh's Workout App - rules engine
   No backend, no keys. Everything runs in the browser.
   ========================================================= */

const STORE_KEY = 'josh_workout_v1';

/* ---------- storage ---------- */

const DEFAULT_STATE = {
  sessions: [],          // completed sessions, newest last
  pointer: null,         // last completed day type
  lastVariant: {},       // { chest: 'chest-A', arms: 'arms-C', legs: 'legs-B' }
  seenVideos: [],        // exercise ids already shown a video for
  current: null,         // today's generated session, in progress
  equipment: {           // what's available today. false = filtered out of the pool.
    barbell: true, dumbbells: true, cables: true, machine: true,
    bands: true, 'ez-bar': true, bodyweight: true
  },
  preferences: { favorites: [], avoided: [] } // exercise ids
};

// GitHub token/gist id live in their own key so they never ride along
// inside exportData()/importData() or get pasted into a shared file.
const GIST_CONFIG_KEY = 'josh_workout_gist_config';
const GIST_FILENAME = 'workout-history.json';

const READINESS_LEVELS = {
  fresh: { setScale: 1,    skipFinisher: false, label: 'Fresh' },
  tired: { setScale: 0.8,  skipFinisher: false, label: 'Tired: volume trimmed' },
  rough: { setScale: 0.65, skipFinisher: true,  label: 'Rough: light session' }
};

// Quick one-tap equipment contexts for the landing screen. Settings still
// exposes every type individually for fine-tuning beyond these three.
const EQUIPMENT_PRESETS = {
  full:    { label: 'Full Gym',       equipment: { barbell: true,  dumbbells: true, cables: true,  machine: true,  bands: true, 'ez-bar': true,  bodyweight: true } },
  home:    { label: 'Home / Limited', equipment: { barbell: false, dumbbells: true, cables: false, machine: false, bands: true, 'ez-bar': false, bodyweight: true } },
  minimal: { label: 'Bodyweight Only',equipment: { barbell: false, dumbbells: false,cables: false, machine: false, bands: true, 'ez-bar': false, bodyweight: true } }
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    return Object.assign(structuredClone(DEFAULT_STATE), JSON.parse(raw));
  } catch (e) {
    console.warn('State load failed, starting fresh', e);
    return structuredClone(DEFAULT_STATE);
  }
}

function saveState(state) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('Save failed', e);
    alert('Could not save. Storage may be full. Export your data.');
  }
}

/* ---------- rotation pointer ---------- */
/* Rule: rotation is chest -> arms -> legs. If a day is skipped,
   pick up where you left off rather than jumping to the calendar day. */

function nextDayType(state, templates) {
  const order = templates.rotationOrder;
  if (!state.pointer) {
    // no history: fall back to the calendar schedule
    const dow = String(new Date().getDay());
    return templates.weekSchedule[dow] || 'chest';
  }
  const i = order.indexOf(state.pointer);
  return order[(i + 1) % order.length];
}

/* ---------- history lookups ---------- */

function lastSessionOfType(state, dayType) {
  for (let i = state.sessions.length - 1; i >= 0; i--) {
    if (state.sessions[i].dayType === dayType) return state.sessions[i];
  }
  return null;
}

function lastPerformance(state, exerciseId) {
  for (let i = state.sessions.length - 1; i >= 0; i--) {
    const hit = (state.sessions[i].exercises || []).find(e => e.id === exerciseId);
    if (hit && (hit.loggedWeight || hit.loggedReps)) return hit;
  }
  return null;
}

// how many sessions back was this exercise last used? Infinity = never
function sessionsSinceUsed(state, exerciseId) {
  for (let i = state.sessions.length - 1; i >= 0; i--) {
    if ((state.sessions[i].exercises || []).some(e => e.id === exerciseId)) {
      return state.sessions.length - i;
    }
  }
  return Infinity;
}

/* ---------- shoulder gating ---------- */
/* Reads the most recent shoulder status. 'sore' drops every
   'no' and 'caution' movement out of the pool. */

function shoulderStatus(state) {
  for (let i = state.sessions.length - 1; i >= 0; i--) {
    const s = state.sessions[i].shoulder;
    if (s) return s;
  }
  return 'good';
}

function passesShoulderGate(ex, status) {
  const safety = ex.shoulderSafe || 'yes';

  // Always allowed: neutral grip, tucked elbows, no overhead load.
  if (safety === 'yes') return true;

  // Shoulder sore: safe movements only. No exceptions, no randomness.
  if (status === 'sore') return false;

  // Minor discomfort: caution movements allowed, never the 'no' tier.
  if (status === 'minor') return safety === 'caution';

  // All good: everything except explicitly flagged movements.
  return safety !== 'no';
}

/* ---------- equipment gating ---------- */
/* Same hard-filter pattern as the shoulder gate: if today's equipment
   can't fill a block, the block shrinks. No substituting. */

function passesEquipmentGate(ex, equipment) {
  if (!equipment) return true;
  return equipment[ex.equipment] !== false;
}

function isAvoided(ex, preferences) {
  return !!(preferences && preferences.avoided && preferences.avoided.includes(ex.id));
}

/* ---------- overload math ---------- */
/* Every note carries an explicit cue vs last session. */

function ratedTooEasy(loggedRIR) {
  return loggedRIR === '3' || loggedRIR === '4+';
}

function overloadCue(prev, ex) {
  if (!prev) {
    return 'First time logged. Set a baseline weight you can hold form on, then note it.';
  }
  const w = parseFloat(prev.loggedWeight);
  const reps = parseInt(prev.loggedReps, 10);
  const isBodyweight = ex.equipment === 'bodyweight' || !w || isNaN(w);
  const tooEasy = ratedTooEasy(prev.loggedRIR);

  if (isBodyweight) {
    const target = (reps || 12) + 2;
    if (tooEasy) {
      return `Last time: ${reps || '?'} reps at RIR ${prev.loggedRIR}, more left in the tank. Add difficulty (tempo, ROM, or a harder variation) instead of just more reps.`;
    }
    return `Last time: ${reps || '?'} reps. Target ${target} reps today.`;
  }

  // Compounds jump 5 lb, isolation jumps 2.5 lb
  const isCompound = ['compound-primary', 'compound-hinge', 'incline', 'flat', 'triceps-compound', 'biceps-primary'].includes(ex.slot);
  const jump = isCompound ? 5 : 2.5;
  const topOfRange = parseInt(String(ex.repRange).split('-')[1], 10) || 12;

  if (reps && reps >= topOfRange) {
    return `Last: ${w} lb x ${reps}. You topped the range, so add ${jump} lb to ${w + jump} lb and reset to the low end.`;
  }
  if (tooEasy) {
    return `Last: ${w} lb x ${reps || '?'} at RIR ${prev.loggedRIR}, that was too easy. Step to ${w + jump} lb even though you didn't top the rep range.`;
  }
  return `Last: ${w} lb x ${reps || '?'}. Target ${w} lb for +1 to 2 reps, or step to ${w + jump} lb.`;
}

/* ---------- selection ---------- */

function pickExercises(pool, count, state, used, status) {
  const preferences = state.preferences || { favorites: [], avoided: [] };

  // Shoulder gate, equipment gate, and avoided list are all hard filters.
  // If a block cannot be filled after them, it shrinks or drops. Nothing
  // ever falls back to an unsafe, unavailable, or avoided pick just to
  // hit the target count.
  const eligible = pool
    .filter(ex => !used.has(ex.id))
    .filter(ex => passesShoulderGate(ex, status))
    .filter(ex => passesEquipmentGate(ex, state.equipment))
    .filter(ex => !isAvoided(ex, preferences));

  if (!eligible.length) return [];

  // Freshness first: longest since last used wins, ties broken randomly.
  // Favorited exercises get a scoring nudge so they surface more often
  // without ever overriding the freshness/gating rules above.
  const scored = eligible.map(ex => ({
    ex,
    score: sessionsSinceUsed(state, ex.id) + Math.random() * 1.5
      + (preferences.favorites.includes(ex.id) ? 2 : 0)
  })).sort((a, b) => b.score - a.score);

  return scored.slice(0, count).map(s => s.ex);
}

function pickVariant(dayType, state, templates) {
  const variants = templates[dayType].variants;
  const last = state.lastVariant[dayType];
  const options = variants.filter(v => v.id !== last);
  return options[Math.floor(Math.random() * options.length)] || variants[0];
}

/* ---------- the generator ---------- */

function generateSession(state, library, templates, forcedDay, readiness) {
  const dayType = forcedDay || nextDayType(state, templates);
  const variant = pickVariant(dayType, state, templates);
  const status = shoulderStatus(state);
  const level = READINESS_LEVELS[readiness] || READINESS_LEVELS.fresh;
  const pool = library[dayType];
  const used = new Set();
  const blocks = [];

  for (const block of variant.blocks) {
    // Rough days drop finisher blocks outright. Non-negotiable blocks
    // (legs machines, split squats, leg press) are never skipped, only
    // scaled down below.
    if (level.skipFinisher && /finisher/i.test(block.slot)) continue;

    const slotPool = pool.filter(ex => ex.slot === block.slot);
    const picks = pickExercises(slotPool, block.pick, state, used, status);
    picks.forEach(p => used.add(p.id));

    if (!picks.length) continue;

    blocks.push({
      label: block.label,
      superset: !!block.superset,
      exercises: picks.map(ex => {
        const prev = lastPerformance(state, ex.id);
        const isNew = sessionsSinceUsed(state, ex.id) === Infinity;
        return {
          id: ex.id,
          name: ex.name,
          sets: Math.max(2, Math.round(ex.sets * level.setScale)),
          repRange: ex.repRange,
          rir: ex.rir,
          cue: ex.cue,
          video: ex.video,
          showVideo: isNew || !state.seenVideos.includes(ex.id),
          isNew,
          unilateralSplit: !!ex.unilateralSplit,
          overload: overloadCue(prev, ex),
          completed: [],
          loggedWeight: '',
          loggedReps: '',
          loggedRIR: ''
        };
      })
    });
  }

  return {
    date: new Date().toISOString().slice(0, 10),
    dayType,
    variantId: variant.id,
    variantName: variant.name,
    shoulderCarry: status,
    readiness: READINESS_LEVELS[readiness] ? readiness : 'fresh',
    blocks,
    exercises: blocks.flatMap(b => b.exercises)
  };
}

/* ---------- session completion ---------- */

function completeSession(state, log) {
  const s = state.current;
  if (!s) return state;

  s.rating = log.rating;
  s.shoulder = log.shoulder;
  s.energy = log.energy;
  s.notes = log.notes;
  s.completedAt = new Date().toISOString();

  state.sessions.push(s);
  state.pointer = s.dayType;
  state.lastVariant[s.dayType] = s.variantId;
  s.exercises.forEach(e => {
    if (!state.seenVideos.includes(e.id)) state.seenVideos.push(e.id);
  });
  state.current = null;

  saveState(state);
  return state;
}

/* ---------- preferences & equipment ---------- */

function toggleFavorite(state, id) {
  state.preferences = state.preferences || { favorites: [], avoided: [] };
  const i = state.preferences.favorites.indexOf(id);
  if (i >= 0) {
    state.preferences.favorites.splice(i, 1);
  } else {
    state.preferences.favorites.push(id);
    const ai = state.preferences.avoided.indexOf(id);
    if (ai >= 0) state.preferences.avoided.splice(ai, 1);
  }
  saveState(state);
  return state;
}

function toggleAvoided(state, id) {
  state.preferences = state.preferences || { favorites: [], avoided: [] };
  const i = state.preferences.avoided.indexOf(id);
  if (i >= 0) {
    state.preferences.avoided.splice(i, 1);
  } else {
    state.preferences.avoided.push(id);
    const fi = state.preferences.favorites.indexOf(id);
    if (fi >= 0) state.preferences.favorites.splice(fi, 1);
  }
  saveState(state);
  return state;
}

function setEquipment(state, type, enabled) {
  state.equipment = state.equipment || structuredClone(DEFAULT_STATE.equipment);
  state.equipment[type] = enabled;
  saveState(state);
  return state;
}

function setEquipmentPreset(state, key) {
  const preset = EQUIPMENT_PRESETS[key];
  if (!preset) return state;
  state.equipment = structuredClone(preset.equipment);
  saveState(state);
  return state;
}

// Which preset (if any) the current equipment state matches, for
// highlighting the right button on the landing screen. null = custom mix.
function matchingEquipmentPreset(state) {
  const current = state.equipment || DEFAULT_STATE.equipment;
  for (const key of Object.keys(EQUIPMENT_PRESETS)) {
    const preset = EQUIPMENT_PRESETS[key].equipment;
    if (Object.keys(preset).every(t => !!preset[t] === (current[t] !== false))) return key;
  }
  return null;
}

/* ---------- gist sync ---------- */
/* Token and gist id live outside the exportable state (see GIST_CONFIG_KEY
   above), so history exports/imports never carry a credential. */

function loadGistConfig() {
  try {
    const raw = localStorage.getItem(GIST_CONFIG_KEY);
    return raw ? Object.assign({ token: '', gistId: '', lastSync: null }, JSON.parse(raw)) : { token: '', gistId: '', lastSync: null };
  } catch (e) {
    return { token: '', gistId: '', lastSync: null };
  }
}

function saveGistConfig(cfg) {
  localStorage.setItem(GIST_CONFIG_KEY, JSON.stringify(cfg));
}

async function pushToGist(state) {
  const cfg = loadGistConfig();
  if (!cfg.token) throw new Error('No GitHub token saved. Add one in Settings.');

  const body = {
    description: 'Workout app history sync',
    public: false,
    files: { [GIST_FILENAME]: { content: JSON.stringify(state, null, 2) } }
  };

  const url = cfg.gistId ? `https://api.github.com/gists/${cfg.gistId}` : 'https://api.github.com/gists';
  const res = await fetch(url, {
    method: cfg.gistId ? 'PATCH' : 'POST',
    headers: {
      'Authorization': `token ${cfg.token}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Gist push failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  cfg.gistId = data.id;
  cfg.lastSync = new Date().toISOString();
  saveGistConfig(cfg);
  return cfg;
}

async function pullFromGist() {
  const cfg = loadGistConfig();
  if (!cfg.token) throw new Error('No GitHub token saved. Add one in Settings.');
  if (!cfg.gistId) throw new Error('No gist id saved yet. Push once first, or paste an existing gist id.');

  const res = await fetch(`https://api.github.com/gists/${cfg.gistId}`, {
    headers: { 'Authorization': `token ${cfg.token}`, 'Accept': 'application/vnd.github+json' }
  });
  if (!res.ok) throw new Error(`Gist pull failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const file = data.files[GIST_FILENAME];
  if (!file) throw new Error(`Gist has no ${GIST_FILENAME} file.`);
  const state = JSON.parse(file.content);
  saveState(state);
  cfg.lastSync = new Date().toISOString();
  saveGistConfig(cfg);
  return state;
}

/* ---------- export / import ---------- */

function exportData(state) {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `workout-history-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importData(file, onDone) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!Array.isArray(parsed.sessions)) throw new Error('Not a valid history file');
      saveState(parsed);
      onDone(parsed);
    } catch (e) {
      alert('Import failed: ' + e.message);
    }
  };
  reader.readAsText(file);
}

/* ---------- stats for the history screen ---------- */

function computeStats(state) {
  const byExercise = {};
  state.sessions.forEach(s => {
    (s.exercises || []).forEach(e => {
      const w = parseFloat(e.loggedWeight);
      if (!w || isNaN(w)) return;
      if (!byExercise[e.id]) byExercise[e.id] = { name: e.name, best: 0, history: [] };
      byExercise[e.id].history.push({ date: s.date, weight: w, reps: e.loggedReps });
      if (w > byExercise[e.id].best) byExercise[e.id].best = w;
    });
  });
  return {
    totalSessions: state.sessions.length,
    byDay: state.sessions.reduce((acc, s) => {
      acc[s.dayType] = (acc[s.dayType] || 0) + 1;
      return acc;
    }, {}),
    avgRating: state.sessions.length
      ? (state.sessions.reduce((a, s) => a + (Number(s.rating) || 0), 0) / state.sessions.length).toFixed(1)
      : '0',
    byExercise
  };
}

window.WorkoutEngine = {
  loadState, saveState, generateSession, completeSession,
  exportData, importData, computeStats, nextDayType,
  lastSessionOfType, shoulderStatus,
  toggleFavorite, toggleAvoided, setEquipment,
  setEquipmentPreset, matchingEquipmentPreset,
  loadGistConfig, saveGistConfig, pushToGist, pullFromGist,
  READINESS_LEVELS, EQUIPMENT_PRESETS
};

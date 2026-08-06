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
  current: null          // today's generated session, in progress
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

/* ---------- overload math ---------- */
/* Every note carries an explicit cue vs last session. */

function overloadCue(prev, ex) {
  if (!prev) {
    return 'First time logged. Set a baseline weight you can hold form on, then note it.';
  }
  const w = parseFloat(prev.loggedWeight);
  const reps = parseInt(prev.loggedReps, 10);
  const isBodyweight = ex.equipment === 'bodyweight' || !w || isNaN(w);

  if (isBodyweight) {
    const target = (reps || 12) + 2;
    return `Last time: ${reps || '?'} reps. Target ${target} reps today.`;
  }

  // Compounds jump 5 lb, isolation jumps 2.5 lb
  const isCompound = ['compound-primary', 'compound-hinge', 'incline', 'flat', 'triceps-compound', 'biceps-primary'].includes(ex.slot);
  const jump = isCompound ? 5 : 2.5;
  const topOfRange = parseInt(String(ex.repRange).split('-')[1], 10) || 12;

  if (reps && reps >= topOfRange) {
    return `Last: ${w} lb x ${reps}. You topped the range, so add ${jump} lb to ${w + jump} lb and reset to the low end.`;
  }
  return `Last: ${w} lb x ${reps || '?'}. Target ${w} lb for +1 to 2 reps, or step to ${w + jump} lb.`;
}

/* ---------- selection ---------- */

function pickExercises(pool, count, state, used, status) {
  // The shoulder gate is a hard filter. If a block cannot be filled with
  // safe movements, the block shrinks or drops. It never falls back to
  // an unsafe pick just to hit the target count.
  const eligible = pool
    .filter(ex => !used.has(ex.id))
    .filter(ex => passesShoulderGate(ex, status));

  if (!eligible.length) return [];

  // Freshness first: longest since last used wins, ties broken randomly.
  const scored = eligible.map(ex => ({
    ex,
    score: sessionsSinceUsed(state, ex.id) + Math.random() * 1.5
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

function generateSession(state, library, templates, forcedDay) {
  const dayType = forcedDay || nextDayType(state, templates);
  const variant = pickVariant(dayType, state, templates);
  const status = shoulderStatus(state);
  const pool = library[dayType];
  const used = new Set();
  const blocks = [];

  for (const block of variant.blocks) {
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
          sets: ex.sets,
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
          loggedReps: ''
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
  lastSessionOfType, shoulderStatus
};

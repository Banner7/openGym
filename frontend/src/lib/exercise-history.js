import { metricEntriesForExercise, metricRowsForEntry, bestWeightForEntry, completedRepsOf, modeOf, workoutAt } from './history.js'
import { completedVolumeOf, isSideSet } from './workout-model.js'
import { bestSetOf } from './onerm.js'
import { beatsWeight, cardioMetrics, isBandAssisted, bandsOf, bandName, compareBandSets } from './exercises.js'
import { currentDbLoad, historyAs, volumeFactor, workoutAs } from './dumbbells.js'

// One exercise's past, read back for the history sheet (issue #43): a chart series and the
// last few sessions, derived in a single pass over the log so the sheet can memoise the
// result and never rescan on a re-render.
//
// The chart plots ONE number per session, chosen the way Stats does it:
//   reps   — the heaviest completed work set (metric 'weight'); an exercise never loaded
//            (pull-ups, push-ups) plots its best rep count instead (metric 'reps'), because
//            that is the thing improving
//   time   — the longest completed hold, in seconds (metric 'sec')
//   cardio — the minutes logged that session (metric 'min')
// The mode is the one the exercise was logged in most recently; a session logged in another
// mode still appears in the list (its sets are labelled by their own target) but gets no point
// and no value, so the curve never mixes seconds with kilos.
//
// Warm-up rows are excluded from every number here, as everywhere else.

export const HISTORY_SESSIONS = 10

// Volume of the exercise in one session: main set plus its drops/bursts, reps mode only —
// there is no honest tonnage for a hold or a run.
// A dumbbell entry logged per bell counts both bells (lib/dumbbells.js volumeFactor).
const entryVolume = (rows, en) => isBandAssisted(en) ? 0 : rows.reduce((v, s) => v + completedVolumeOf(s), 0) * volumeFactor(en)

export function exerciseHistory(S, exId, { limit = HISTORY_SESSIONS } = {}) {
  // Dumbbell weights are read in the exercise's current meaning (lib/dumbbells.js), so the curve,
  // the best and the sessions compare like with like after a switch between each and total.
  const workouts = historyAs(S, exId, currentDbLoad(S, exId))?.workouts || []
  // Chronological pairs of (workout, entry); the sort covers backfilled sessions, which are
  // inserted by date rather than appended.
  const logged = []
  workouts.forEach(w => {
    // A combined session can contain the same exercise more than once. Keep one dated
    // snapshot, but read every completed occurrence that shares the session's latest mode.
    const entries = metricEntriesForExercise(w, exId)
    if (!entries.length) return
    const mode = entries.at(-1).mode
    const sameMode = entries.filter(item => item.mode === mode)
    const rows = sameMode.flatMap(item => item.rows)
    const en = { ...sameMode.at(-1).entry, sets: rows }
    if (rows.length) logged.push({ w, en, mode, rows })
  })
  logged.sort((a, b) => workoutAt(a.w) - workoutAt(b.w))

  const empty = { mode: modeOf({ id: exId }), metric: 'weight', best: 0, prId: null, total: 0, sessions: [], points: [], e1rmPoints: [] }
  if (!logged.length) return empty

  const mode = logged[logged.length - 1].mode
  if (mode === 'reps' && (isBandAssisted(logged.at(-1).en) || logged.at(-1).rows.some(s => s.band || s.sides?.L?.band || s.sides?.R?.band))) {
    const bands = bandsOf(S)
    let bestSet = null, prId = null
    const points = [], sessions = []
    for (const { w, en, mode: m, rows } of logged) {
      const set = m === 'reps' ? bestBandSetForEntry(en, S) : null
      const value = set ? bands.length - bands.indexOf(set.band) : null
      const label = set ? bandName(set.band) : null
      if (set && compareBandSets(set, bestSet, S) > 0) { bestSet = set; prId = w.id }
      if (value != null) points.push({ t: workoutAt(w), d: w.d, y: value, note: label + ' · ' + set.r, band: set.band, sets: rows, target: en.target })
      sessions.push({ id: w.id, d: w.d, t: workoutAt(w), mode: m, target: en.target, sets: rows, value, label, volume: null, e1rm: null })
    }
    return { mode, metric: 'band', best: bestSet ? bands.length - bands.indexOf(bestSet.band) : 0,
      bestLabel: bestSet ? bandName(bestSet.band) + ' × ' + bestSet.r : null, prId, total: sessions.length,
      sessions: sessions.slice(-limit).reverse().map(s => ({ ...s, pr: s.id === prId })), points, e1rmPoints: [] }
  }
  const repsOnly = mode === 'reps' && !logged.some(l => l.mode === 'reps' && bestWeightForEntry(l.en) > 0)
  const primary = cardioMetrics({ ...logged.at(-1).en.target, id: exId })[0]
  const cardioMetric = ['floors', 'm'].includes(primary) ? primary : 'min'
  const metric = mode === 'cardio' ? cardioMetric : mode === 'time' ? 'sec' : repsOnly ? 'reps' : 'weight'
  const valueOf = ({ en, rows }) => {
    if (['min', 'floors', 'm'].includes(metric)) return rows.reduce((a, s) => a + (Number(s[metric]) || 0), 0)
    if (metric === 'sec') return Math.max(0, ...rows.map(s => Number(s.sec) || 0))
    if (metric === 'reps') return Math.max(0, ...rows.map(completedRepsOf))
    return bestWeightForEntry(en)
  }

  let best = 0, prId = null
  const sessions = [], points = [], e1rmPoints = []
  logged.forEach(({ w, en, mode: m, rows }) => {
    const same = m === mode
    const value = same ? valueOf({ en, rows }) : null
    const e1rm = m === 'reps' ? (bestSetOf(en)?.est ?? null) : null
    const t = workoutAt(w)
    // "PR" goes on the session that first reached the all-time best, not on every session
    // that later matched it — one marker says where the record was set.
    if (value != null && value > best) { best = value; prId = w.id }
    if (value != null && value > 0) points.push({ t, d: w.d, y: value, e1rm })
    if (e1rm != null) e1rmPoints.push({ t, d: w.d, y: e1rm })
    sessions.push({
      id: w.id, d: w.d, t, mode: m, target: en.target || null, sets: rows, value, e1rm,
      volume: m === 'reps' ? entryVolume(rows, en) : null,
    })
  })
  // The "first reached" rule only holds for records above zero: a bodyweight session with
  // no weight logged is not a PR of anything.
  if (best <= 0) prId = null

  return {
    mode, metric, best, prId, total: sessions.length,
    sessions: sessions.slice(-limit).reverse().map(s => ({ ...s, pr: s.id === prId })),
    points, e1rmPoints,
  }
}

/**
 * The best set ever logged of an exercise, for the "Best set" reference on the workout card
 * (#173) — the answer to "last time was a bad day, what can I actually do". It is the heaviest
 * completed work set, and of equally heavy ones the one with the most reps: the same "heaviest"
 * the Best chip and a PR mean, which on an assistance machine is the least help. A timed exercise
 * compares holds, then their load; cardio compares minutes, then speed. An exercise never loaded
 * (pull-ups) comes down to its reps that way.
 *
 * Unlike "Last time" this looks across every routine: a record belongs to the exercise, not to
 * the slot it was set in. Only sets logged in `mode` count, so a hold is never measured against
 * a rep set. A tie keeps the first time it was reached, as the PR marker does.
 * `as` reads dumbbell weights in that meaning (lib/dumbbells.js): the session's own, so a past
 * "40 total" is held against today's sets as the "20 each" it was.
 * Returns { d, set, target } or null.
 */
export function bestSetFor(S, exId, mode = modeOf({ id: exId }), as) {
  const bandMode = isBandAssisted(exId) || (S?.workouts || []).some(w => w.entries?.some(e => e.id === exId && (isBandAssisted(e) || e.sets?.some(s => s.band || s.sides?.L?.band || s.sides?.R?.band))))
  const keys = (s, cfg) => {
    const primary = cardioMetrics({ ...cfg, id: exId })[0]
    const field = ['floors', 'm'].includes(primary) ? primary : 'min'
    return mode === 'cardio' ? [Number(s[field]) || 0, field === 'min' ? Number(s.speed) || 0 : -(Number(s.min) || 0)]
      : mode === 'time' ? [Number(s.sec) || 0, Number(s.w) || 0]
        : [Number(s.w) || 0, Number(s.r) || 0]
  }
  const better = (a, b, cfg) => {
    if (bandMode && mode === 'reps') return compareBandSets(a, b, S) > 0
    const [a1, a2] = keys(a, cfg), [b1, b2] = keys(b, cfg)
    if (a1 !== b1) return mode === 'reps' ? beatsWeight(exId, a1, b1) : a1 > b1
    return a2 > b2
  }
  // One pass over the history as it is stored, with no copy and no sort: this runs on every
  // render of every exercise card while the line shows the best set, and every stepper tap
  // re-renders them all, so sorting a long imported history each time was the cost of a tap.
  // Stored order is not always the order things happened in (a moved session keeps its place
  // until it is filed again), so a tie is settled by the start time, not by which came first
  // in the array; within one session the set logged first keeps it.
  let best = null
  for (const stored of S?.workouts || []) {
    const w = as ? workoutAs(stored, exId, as) : stored
    let t = null
    for (const en of w.entries || []) {
      if (en.id !== exId) continue
      for (const set of metricRowsForEntry(en, mode)) {
        if (bandMode && mode === 'reps') {
          const candidate = bestBandSetForEntry({ ...en, sets: [set] }, S)
          if (!candidate) continue
          t ??= workoutAt(w)
          if (!best || better(candidate, best.set) || (!better(best.set, candidate) && t < best.t)) best = { d: w.d, set: candidate, target: en.target || null, t }
          continue
        }
        t ??= workoutAt(w)
        if (!best || better(set, best.set, en.target) || (!better(best.set, set, en.target) && t < best.t)) best = { d: w.d, set, target: en.target || null, t }
      }
    }
  }
  return best && { d: best.d, set: best.set, target: best.target }
}

export function bestBandSetForEntry(entry, S) {
  let best = null
  for (const row of metricRowsForEntry(entry, 'reps')) {
    const sides = isSideSet(row) ? [row.sides.L, row.sides.R] : [row]
    for (const set of sides) {
      if (!set.done || bandsOf(S).indexOf(set.band) < 0) continue
      if (!best || compareBandSets(set, best, S) > 0) best = set
    }
  }
  return best
}

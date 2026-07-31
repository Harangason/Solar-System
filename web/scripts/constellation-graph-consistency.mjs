import assert from 'node:assert/strict'

import {
  buildTemporalCandidateGraph,
  constellationSearchBudget,
  constellationSearchWindow,
  dijkstraTemporalDistances,
  selectDiverseGraphCandidates,
  selectTemporallyDiverseCandidates,
  temporalRefinementNeighbors,
} from '../src/constellationGraph.ts'

const dayMs = 86_400_000
const candidates = [
  { timestamp: 0, score: 2, label: 'a' },
  { timestamp: 10 * dayMs, score: 9, label: 'peak-a' },
  { timestamp: 20 * dayMs, score: 3, label: 'b' },
  { timestamp: 200 * dayMs, score: 8, label: 'peak-b' },
  { timestamp: 210 * dayMs, score: 2, label: 'c' },
]
const graph = buildTemporalCandidateGraph(candidates, 1)
const distances = dijkstraTemporalDistances(graph, 0)
assert.equal(distances.get(20 * dayMs), 20)
assert.equal(distances.get(210 * dayMs), 210)

const selected = selectDiverseGraphCandidates(graph, 2, 100)
assert.deepEqual(selected.map((candidate) => candidate.label), ['peak-a', 'peak-b'])

const rankedSolverCandidates = [
  { timestamp: 100 * dayMs, quality: 10, label: 'basin-a-best' },
  { timestamp: 102 * dayMs, quality: 9, label: 'basin-a-local' },
  { timestamp: 500 * dayMs, quality: 8, label: 'basin-b-best' },
  { timestamp: 900 * dayMs, quality: 7, label: 'basin-c-best' },
]
assert.deepEqual(
  selectTemporallyDiverseCandidates(
    rankedSolverCandidates,
    (candidate) => candidate.timestamp,
    3,
    180,
  ).map((candidate) => candidate.label),
  ['basin-a-best', 'basin-b-best', 'basin-c-best'],
)

assert.deepEqual(
  temporalRefinementNeighbors(100 * dayMs, 0, 20),
  [-170 * dayMs, 10 * dayMs, 190 * dayMs, 370 * dayMs],
)
assert.deepEqual(
  temporalRefinementNeighbors(100 * dayMs, 2, 20),
  [80 * dayMs, 120 * dayMs],
)

const earthWindow = constellationSearchWindow([365.25])
assert.ok(earthWindow.searchEndDay >= 20 * 365)
const jupiterWindow = constellationSearchWindow([365.25, 4332.59])
assert.ok(jupiterWindow.searchEndDay >= 2 * 4332.59)
assert.ok(jupiterWindow.searchEndDay > 2920)
assert.ok(jupiterWindow.broadStepDays <= 14)
const jupiterSampleCount = Math.floor(
  (jupiterWindow.searchEndDay - jupiterWindow.searchStartDay) / jupiterWindow.broadStepDays,
) + 1
assert.ok(jupiterSampleCount >= 2400)

const smallBudget = constellationSearchBudget(1000, 1)
const complexBudget = constellationSearchBudget(4000, 3)
assert.ok(smallBudget.geometricShortlistLimit >= 24)
assert.ok(complexBudget.geometricShortlistLimit > smallBudget.geometricShortlistLimit)
assert.ok(complexBudget.preflightSolverBudget > complexBudget.geometricShortlistLimit)
assert.ok(complexBudget.fullValidationBudget >= 12)

console.log('constellation graph consistency: ok')

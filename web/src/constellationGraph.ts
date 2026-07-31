export interface TemporalGraphCandidate {
  timestamp: number
  score: number
}

export interface TemporalGraph<T extends TemporalGraphCandidate> {
  nodes: T[]
  neighbors: Map<number, Array<{ timestamp: number; costDays: number }>>
}

const DAY_MS = 86_400_000
const YEAR_DAYS = 365.25

export interface ConstellationSearchWindow {
  searchStartDay: number
  searchEndDay: number
  broadStepDays: number
  longestRelevantPeriodDays: number
  targetBroadSamples: number
}

export interface ConstellationSearchBudget {
  geometricShortlistLimit: number
  preflightSolverBudget: number
  fullValidationBudget: number
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value))
}

export function constellationSearchWindow(
  orbitalPeriodsDays: number[],
  routeSectionCount = 1,
): ConstellationSearchWindow {
  const relevantPeriods = orbitalPeriodsDays.filter((periodDays) => periodDays > 0)
  const longestRelevantPeriodDays = Math.max(YEAR_DAYS, ...relevantPeriods)
  const searchStartDay = -Math.min(730, Math.ceil(longestRelevantPeriodDays / 2))
  const searchEndDay = Math.min(
    Math.ceil(60 * YEAR_DAYS),
    Math.max(Math.ceil(20 * YEAR_DAYS), Math.ceil(longestRelevantPeriodDays * 2.15)),
  )
  const targetBroadSamples = clamp(
    1_800 + relevantPeriods.length * 600 + Math.max(1, routeSectionCount) * 500,
    2_400,
    12_000,
  )
  const searchSpanDays = searchEndDay - searchStartDay
  const broadStepDays = clamp(Math.round(searchSpanDays / targetBroadSamples), 1, 14)
  return {
    searchStartDay,
    searchEndDay,
    broadStepDays,
    longestRelevantPeriodDays,
    targetBroadSamples,
  }
}

export function constellationSearchBudget(
  geometricNodeCount: number,
  routeSectionCount: number,
): ConstellationSearchBudget {
  const routeComplexity = Math.max(1, routeSectionCount)
  const geometricShortlistLimit = clamp(
    Math.ceil(Math.sqrt(Math.max(1, geometricNodeCount)) * 0.7) + routeComplexity * 4,
    24,
    72,
  )
  const preflightSolverBudget = clamp(
    geometricShortlistLimit * 2 + routeComplexity * 12,
    72,
    192,
  )
  const fullValidationBudget = clamp(
    Math.ceil(geometricShortlistLimit / 3) + routeComplexity * 2,
    12,
    32,
  )
  return { geometricShortlistLimit, preflightSolverBudget, fullValidationBudget }
}

export function buildTemporalCandidateGraph<T extends TemporalGraphCandidate>(
  candidates: T[],
  neighborSpan = 2,
): TemporalGraph<T> {
  const bestByTimestamp = new Map<number, T>()
  for (const candidate of candidates) {
    const current = bestByTimestamp.get(candidate.timestamp)
    if (!current || candidate.score > current.score) bestByTimestamp.set(candidate.timestamp, candidate)
  }
  const nodes = [...bestByTimestamp.values()].sort((left, right) => left.timestamp - right.timestamp)
  const neighbors = new Map<number, Array<{ timestamp: number; costDays: number }>>()
  for (const node of nodes) neighbors.set(node.timestamp, [])

  for (let index = 0; index < nodes.length; index += 1) {
    for (let offset = 1; offset <= neighborSpan; offset += 1) {
      const other = nodes[index + offset]
      if (!other) break
      const costDays = Math.abs(other.timestamp - nodes[index].timestamp) / DAY_MS
      neighbors.get(nodes[index].timestamp)?.push({ timestamp: other.timestamp, costDays })
      neighbors.get(other.timestamp)?.push({ timestamp: nodes[index].timestamp, costDays })
    }
  }
  return { nodes, neighbors }
}

export function dijkstraTemporalDistances<T extends TemporalGraphCandidate>(
  graph: TemporalGraph<T>,
  startTimestamp: number,
): Map<number, number> {
  const distances = new Map(graph.nodes.map((node) => [node.timestamp, Number.POSITIVE_INFINITY]))
  if (!distances.has(startTimestamp)) return distances
  distances.set(startTimestamp, 0)
  const pending = new Set(distances.keys())

  while (pending.size > 0) {
    let current: number | null = null
    let currentDistance = Number.POSITIVE_INFINITY
    for (const timestamp of pending) {
      const distance = distances.get(timestamp) ?? Number.POSITIVE_INFINITY
      if (distance < currentDistance) {
        current = timestamp
        currentDistance = distance
      }
    }
    if (current === null || !Number.isFinite(currentDistance)) break
    pending.delete(current)
    for (const edge of graph.neighbors.get(current) ?? []) {
      if (!pending.has(edge.timestamp)) continue
      const nextDistance = currentDistance + edge.costDays
      if (nextDistance < (distances.get(edge.timestamp) ?? Number.POSITIVE_INFINITY)) {
        distances.set(edge.timestamp, nextDistance)
      }
    }
  }
  return distances
}

export function selectDiverseGraphCandidates<T extends TemporalGraphCandidate>(
  graph: TemporalGraph<T>,
  limit: number,
  minimumSeparationDays: number,
): T[] {
  if (limit <= 0) return []
  const nodeByTimestamp = new Map(graph.nodes.map((node) => [node.timestamp, node]))
  const localPeaks = graph.nodes.filter((node) => (
    (graph.neighbors.get(node.timestamp) ?? []).every((edge) => (
      node.score >= (nodeByTimestamp.get(edge.timestamp)?.score ?? Number.NEGATIVE_INFINITY)
    ))
  ))
  const ranked = (localPeaks.length > 0 ? localPeaks : graph.nodes)
    .sort((left, right) => right.score - left.score)
  const selected: T[] = []
  const minimumSeparationMs = minimumSeparationDays * DAY_MS

  for (const candidate of ranked) {
    if (
      selected.every((other) => (
        Math.abs(other.timestamp - candidate.timestamp) >= minimumSeparationMs
      ))
    ) {
      selected.push(candidate)
    }
    if (selected.length >= limit) break
  }

  if (selected.length < limit) {
    for (const candidate of graph.nodes.sort((left, right) => right.score - left.score)) {
      if (!selected.some((item) => item.timestamp === candidate.timestamp)) selected.push(candidate)
      if (selected.length >= limit) break
    }
  }
  return selected
}

export function temporalRefinementNeighbors(
  timestamp: number,
  refinementLevel: number,
  broadStepDays: number,
): number[] {
  const refinementSteps = [
    Math.max(90, broadStepDays * 4),
    Math.max(30, broadStepDays * 2),
    Math.max(7, broadStepDays),
    1,
  ]
  const stepDays = refinementSteps[
    Math.min(refinementLevel, refinementSteps.length - 1)
  ]
  if (refinementLevel === 0) {
    const longStepDays = Math.max(270, broadStepDays * 12)
    return [
      timestamp - longStepDays * DAY_MS,
      timestamp - stepDays * DAY_MS,
      timestamp + stepDays * DAY_MS,
      timestamp + longStepDays * DAY_MS,
    ]
  }
  return [
    timestamp - stepDays * DAY_MS,
    timestamp + stepDays * DAY_MS,
  ]
}

export function selectTemporallyDiverseCandidates<T>(
  rankedCandidates: T[],
  timestampOf: (candidate: T) => number,
  limit: number,
  minimumSeparationDays: number,
): T[] {
  if (limit <= 0) return []
  const minimumSeparationMs = minimumSeparationDays * DAY_MS
  const selected: T[] = []
  for (const candidate of rankedCandidates) {
    const timestamp = timestampOf(candidate)
    if (selected.every((other) => (
      Math.abs(timestampOf(other) - timestamp) >= minimumSeparationMs
    ))) {
      selected.push(candidate)
    }
    if (selected.length >= limit) return selected
  }
  for (const candidate of rankedCandidates) {
    if (!selected.includes(candidate)) selected.push(candidate)
    if (selected.length >= limit) break
  }
  return selected
}

import type { MissionConfig, MissionResult } from './types'
import type { WaypointRouteResult } from './components/PlannedWaypointRoute'
import type { DirectSolarRouteResult } from './components/DirectSolarRoute'

export interface LaunchOptimizationResult {
  optimizedStartDate: string
  optimizedEncounterDay: number
  optimizedEncounterDate: string
  optimizedSearchWindowDays: number
  confidenceThresholdPct: number
  minimumConfidencePct: number
  converged: boolean
  plausible: boolean
  geometryPlausible: boolean
  stopReason: 'plausible-route-found' | 'solar-energy-boundary-unreachable-with-configured-burn' | 'search-bounds-exhausted-without-plausible-route'
  requestedPlan: {
    startDate: string
    encounterDay: number
    encounterDate: string
    validation: LaunchOptimizationResult['fullValidationCandidates'][number] | null
    usedOnlyAsSearchSeed: boolean
    isConstraint: boolean
  }
  planComparison: {
    startDateChanged: boolean
    startDateDeltaDays: number
    encounterDayChanged: boolean
    encounterDayDelta: number
    searchWindowChanged: boolean
    optimizedSearchWindowDays: number
    requestedPlanPlausible: boolean
    optimizedPlanPlausible: boolean
    optimizedGeometryPlausible: boolean
  }
  iterations: number
  evaluations: number
  confidenceByParameter: {
    launchEpoch: number
    encounterEpoch: number
    requiredDeltaV: number
    targetAlignment: number
    flybyTurnAngle: number
    speedGain: number
    solarExitSpeed: number
    forwardBackwardClosure: number
  }
  bestCandidate: {
    startDate: string
    encounterDay: number
    score: number
    requiredInjectionDeltaVKmS: number
    targetAlignmentDeg: number
    turnAngleDeg: number
    speedGainKmS: number
    targetCorrectionDeltaVKmS: number
    geometryFeasible: boolean
    solarEnergyReachable: boolean
    feasible: boolean
  }
  searchStrategy: {
    direction: 'bidirectional'
    centerStartDate: string
    minimumHorizonDays: number
    maximumHorizonDays: number
    exploredHorizonDays: number
    optimizedHorizonDays: number
    encounterBoundsDays: [number, number]
    refinementStepsDays: number[]
    refinementPasses: number
    stagePassCounts: number[]
    empiricalSeedRunIds: string[]
    empiricalSeedCount: number
  }
  solarEnergyFeasibility: {
    desiredExitSpeedKmS: number
    maximumExitSpeedWithAvailableBurnKmS: number
    availableOberthDeltaVKmS: number
    minimumOberthDeltaVForDesiredSpeedKmS: number
    additionalDeltaVRequiredKmS: number
    energeticallyReachable: boolean
    constraintKind: 'propulsion-delta-v'
    electricalPowerDeficit: false
    model: string
  }
  model: string
  bidirectionalSearch: {
    method: string
    desiredSolarExitSpeedKmS: number
    solarEntry: WaypointRouteResult['solarBoundary']
    jupiterMatch: NonNullable<WaypointRouteResult['transitionDiagnostics']>['bidirectionalMatch']
    postFlybyTargetProgressMonotonic: boolean
    minimumTargetProgressRateKmS?: number
  }
  fullValidationCandidates: Array<{
    rank: number
    role: 'requested-plan' | 'optimized-candidate'
    startDate: string
    encounterDay: number
    plausible: boolean
    geometryPlausible?: boolean
    solarEnergyReachable?: boolean
    rejectionReasons: string[]
    requiredInjectionDeltaVKmS?: number
    targetCorrectionDeltaVKmS?: number
    burnToLambertDirectionDeg?: number
  }>
  audit: {
    runId: string
    createdAtUtc: string
    logFile: string
    documentation: string
  }
  mission: MissionResult
  route: WaypointRouteResult
  alternatives: {
    recommended: 'gravityAssist' | 'directSolar'
    recommendationFeasible: boolean
    gravityAssist: {
      startDate: string
      encounterDay: number
      feasible: boolean
      qualityScore: number
      route: WaypointRouteResult
    }
    directSolar: {
      startDate: string
      feasible: boolean
      qualityScore: number
      candidate: {
        startDate: string
        requiredVectorDeltaVKmS: number
        availableDeltaVKmS: number
        angularChangeDeg: number
        feasible: boolean
      }
      mission: MissionResult
      route: DirectSolarRouteResult
    }
  }
}

interface OptimizationRequest {
  mission: MissionConfig
  waypointId: string
  encounterDay: number
  flybyAltitudeKm: number
  flybyMode: 'acceleration' | 'observation'
  flybyAimpoint?: {
    enabled: boolean
    clockAngleDeg: number
    screenRadiusNorm: number
    role: 'entry' | 'periapsis' | 'exit' | 'periapsis_point'
    altitudeKm: number
  }
  targetRightAscensionDeg: number
  targetDeclinationDeg: number
  desiredSolarExitSpeedKmS: number
  searchStartDate: string
  searchWindowDays: number
  confidenceThresholdPct: number
  maxIterations: number
  maxFullValidations?: number
}

export async function requestLaunchOptimization(values: OptimizationRequest) {
  const response = await fetch('/api/mission/optimize-launch-window', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(values),
  })
  const payload = await response.json() as LaunchOptimizationResult | { error?: string }
  if (!response.ok || 'error' in payload) {
    throw new Error('error' in payload && payload.error ? payload.error : `HTTP ${response.status}`)
  }
  return payload as LaunchOptimizationResult
}

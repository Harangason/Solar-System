import type { MissionConfig, MissionResult } from './types'
import { activityRequestHeaders } from './activityLog'
import { DEFAULT_PROPULSION_MODULES } from './propulsionModels'

export const AU_KM = 149_597_870.7

export const DEFAULT_MISSION_CONFIG: MissionConfig = {
  startDate: new Date().toISOString().slice(0, 10),
  parkingOrbitAltitudeKm: 400,
  payloadMassKg: 120,
  carrierMassKg: 1_200,
  heatshieldMassKg: 450,
  propellantMassKg: 7_200,
  targetPerihelionAu: 0.05,
  oberthDeltaVKmS: 8,
  burnDurationSeconds: 240,
  engineIspSeconds: 450,
  separationDeltaVKmS: 0.005,
  launchStageEnabled: true,
  carrierEnabled: true,
  heatshieldEnabled: true,
  kickStageEnabled: true,
  missionYears: 10,
  electricSailEnabled: true,
  tetherCount: 80,
  instrumentedTetherCount: 16,
  tetherLengthKm: 30,
  tetherVoltageKv: 20,
  spinRateRpm: 1,
  endMassesEnabled: true,
  fiberCommunicationEnabled: true,
  sensorNodesEnabled: true,
  sailAccelerationMmS2: 0.1,
  heatshieldLimitWm2: 600_000,
  carrierDisposal: 'safe_orbit',
  nBodyEnabled: true,
  kalmanEnabled: true,
  navigationCycleHours: 24,
  positionMeasurementNoiseKm: 25,
  velocityMeasurementNoiseKmS: 0.005,
  propulsionModules: DEFAULT_PROPULSION_MODULES.map((module) => ({ ...module, parameters: { ...module.parameters } })),
  theoreticalPropulsionMode: false,
}

export function validateMissionConfig(config: MissionConfig) {
  const errors: string[] = []
  const sunRadiusAu = 696_340 / AU_KM
  if (config.targetPerihelionAu <= sunRadiusAu) errors.push('Perihel liegt innerhalb der Sonne.')
  if (config.targetPerihelionAu >= 1) errors.push('Perihel muss kleiner als 1 AE sein.')
  if (config.instrumentedTetherCount > config.tetherCount) errors.push('Instrumentierte Tethers dürfen die Gesamtzahl nicht überschreiten.')
  if (config.tetherCount < 1 || config.tetherLengthKm <= 0) errors.push('Tether-Anzahl und -Länge müssen positiv sein.')
  if ([config.payloadMassKg, config.carrierMassKg, config.heatshieldMassKg, config.propellantMassKg].some((mass) => mass <= 0)) errors.push('Alle Massen müssen positiv sein.')
  if (config.parkingOrbitAltitudeKm <= 100) errors.push('Die Parkbahnhöhe muss über 100 km liegen.')
  if (config.oberthDeltaVKmS < 0 || config.missionYears < 1) errors.push('Delta-v und Missionsdauer sind ungültig.')
  if (config.navigationCycleHours <= 0) errors.push('Der Navigationszyklus muss positiv sein.')
  if (config.positionMeasurementNoiseKm <= 0 || config.velocityMeasurementNoiseKmS <= 0) errors.push('Kalman-Messunsicherheiten müssen positiv sein.')
  const electric = config.propulsionModules.find((module) => module.type === 'electric_sail')
  if (electric) {
    const total = Number(electric.parameters.totalTetherCount)
    const instrumented = Number(electric.parameters.instrumentedTetherCount)
    const progress = Number(electric.parameters.deploymentProgress)
    if (total <= 0 || Number(electric.parameters.tetherLengthKm) <= 0) errors.push('Electric Sail benötigt positive Tether-Anzahl und -Länge.')
    if (instrumented < 0 || instrumented > total) errors.push('Zu viele instrumentierte Electric-Sail-Tethers.')
    if (progress < 0 || progress > 1) errors.push('Electric-Sail-Entfaltung muss zwischen 0 und 1 liegen.')
  }
  return errors
}

export async function requestMissionSimulation(config: MissionConfig, signal?: AbortSignal) {
  const response = await fetch('/api/mission/simulate', {
    method: 'POST',
    headers: activityRequestHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(config),
    signal,
  })
  const payload = await response.json() as MissionResult | { error?: string }
  if (!response.ok) {
    throw new Error('error' in payload && payload.error ? payload.error : `HTTP ${response.status}`)
  }
  return payload as MissionResult
}

import type { MissionConfig, PropulsionModule, PropulsionType, TechnologyReadiness } from './types'

function module(
  type: PropulsionType,
  name: string,
  readiness: TechnologyReadiness,
  enabled: boolean,
  visualMode: PropulsionModule['visualMode'],
  parameters: PropulsionModule['parameters'],
  dryMassKg = 0,
  propellantMassKg = 0,
): PropulsionModule {
  return {
    id: type, name, type, readiness, enabled, active: false,
    dryMassKg, propellantMassKg,
    powerRequiredW: Number(parameters.powerRequiredW ?? 0),
    directionMode: ['solar_sail', 'electric_sail', 'magnetic_sail'].includes(type) ? 'radial_out' : 'prograde',
    visualMode, visualEnabled: true, parameters, warnings: [],
  }
}

export const DEFAULT_PROPULSION_MODULES: PropulsionModule[] = [
  module('chemical', 'Chemischer Antrieb', 'operational', true, 'engine_plume', { thrustN: 800_000, specificImpulseS: 450 }, 400),
  module('solid_kick_stage', 'Feststoff-/Kick-Stufe', 'operational', true, 'burn_marker', { thrustN: 1_000_000, specificImpulseS: 450 }, 300, 7_200),
  module('solar_oberth', 'Solar-Oberth-Manöver', 'demonstrated', true, 'burn_marker', { targetPerihelionAU: 0.05, burnDeltaVKmS: 8, burnDurationS: 240, heatshieldRequired: true }),
  module('ion', 'Ionenantrieb', 'operational', false, 'engine_plume', { thrustN: 0.25, specificImpulseS: 4_000, powerRequiredW: 7_000, propellantType: 'xenon' }, 120, 120),
  module('hall', 'Hall-Antrieb', 'operational', false, 'engine_plume', { thrustN: 0.4, specificImpulseS: 2_000, powerRequiredW: 12_000, propellantType: 'krypton' }, 140, 180),
  module('nuclear_electric', 'Nuklear-elektrisch', 'demonstrated', false, 'none', { reactorPowerW: 200_000, electricEfficiency: 0.35, radiatorAreaM2: 180, thermalWasteW: 130_000 }, 1_200),
  module('nuclear_thermal', 'Nuklear-thermisch', 'experimental', false, 'engine_plume', { thrustN: 200_000, specificImpulseS: 900, burnDurationS: 600 }, 2_500, 2_000),
  module('solar_sail', 'Solarsegel', 'demonstrated', false, 'sail_surface', { sailAreaM2: 1_000, reflectivity: 1.8, deployed: true, deploymentProgress: 1, thermalLimitWm2: 100_000 }, 50),
  module('electric_sail', 'Electric Sail', 'experimental', true, 'electric_tethers', { totalTetherCount: 80, instrumentedTetherCount: 16, tetherLengthKm: 30, effectiveDiameterKm: 60, tetherVoltageKV: 20, spinRateRpm: 1, tetherMaterial: 'aluminium', deployed: false, charged: false, deploymentProgress: 0, showSensorTethers: true, showOpticalFibers: true, endMassKg: 0.5, electronGunPowerW: 700, simplifiedThrustMode: true }, 80),
  module('magnetic_sail', 'Magnet-/Plasmasegel', 'conceptual', false, 'magnetic_field', { loopRadiusKm: 50, magneticFieldStrengthT: 0.01, superconducting: true, powerRequiredW: 50_000, thrustN: 0.2 }, 500),
  module('fusion', 'Fusion Drive', 'conceptual', false, 'engine_plume', { reactorPowerW: 1e9, exhaustVelocityKmS: 10_000, thrustN: 2_000, specificImpulseS: 1_000_000, fusionMode: 'deuterium_helium3' }, 8_000, 5_000),
  module('antimatter', 'Antimaterie-Antrieb', 'speculative', false, 'engine_plume', { antimatterMassMg: 1, conversionEfficiency: 0.1, containmentPowerW: 1e6, thrustN: 5_000, specificImpulseS: 10_000_000 }, 3_000, 0.001),
  module('warp', 'Warp :-)', 'fictional', false, 'warp_bubble', { warpFactor: 1, bubbleRadiusKm: 1_000, exoticEnergyRequirement: 1e45, visualizationOnly: true }),
]

export interface PropulsionPreset {
  id: string
  name: string
  enabled: PropulsionType[]
  mission?: Partial<MissionConfig>
  electric?: Record<string, number | string | boolean>
  theoretical?: boolean
}

export const PROPULSION_PRESETS: PropulsionPreset[] = [
  { id: 'chemical', name: 'Klassische Chemie-Mission', enabled: ['chemical', 'solid_kick_stage'] },
  { id: 'voyager', name: 'Voyager-ähnliche Mission', enabled: ['chemical', 'solid_kick_stage'] },
  { id: 'oberth', name: 'Solar-Oberth + Kick-Stufe', enabled: ['chemical', 'solid_kick_stage', 'solar_oberth'] },
  { id: 'oberth-electric', name: 'Solar-Oberth + Electric Sail', enabled: ['chemical', 'solid_kick_stage', 'solar_oberth', 'electric_sail'] },
  { id: 'oberth-electric-ion', name: 'Oberth + Electric Sail + Ion', enabled: ['chemical', 'solid_kick_stage', 'solar_oberth', 'electric_sail', 'ion'] },
  { id: 'nuclear-electric', name: 'Nuklear-elektrischer Deep Space', enabled: ['chemical', 'solid_kick_stage', 'solar_oberth', 'ion', 'nuclear_electric'] },
  { id: 'solar-sail', name: 'Solarsegel-Demo', enabled: ['chemical', 'solid_kick_stage', 'solar_sail'] },
  { id: 'electric-demo', name: 'Electric-Sail-Demo', enabled: ['chemical', 'solid_kick_stage', 'electric_sail'], electric: { totalTetherCount: 64, instrumentedTetherCount: 12, tetherLengthKm: 20, tetherVoltageKV: 20, spinRateRpm: 0.5 } },
  { id: 'fusion', name: 'Fusion-Zukunftsszenario', enabled: ['chemical', 'solid_kick_stage', 'fusion'], theoretical: true },
  { id: 'warp', name: 'Warp :-) Visualisierung', enabled: ['warp'], theoretical: false },
]

export function applyPropulsionPreset(config: MissionConfig, preset: PropulsionPreset): MissionConfig {
  const modules = config.propulsionModules.map((item) => ({
    ...item,
    enabled: preset.enabled.includes(item.type),
    parameters: {
      ...item.parameters,
      ...(item.type === 'electric_sail' ? preset.electric : undefined),
    },
  }))
  const electric = modules.find((item) => item.type === 'electric_sail')
  return {
    ...config,
    ...preset.mission,
    propulsionModules: modules,
    theoreticalPropulsionMode: preset.theoretical ?? false,
    electricSailEnabled: Boolean(electric?.enabled),
    tetherCount: Number(electric?.parameters.totalTetherCount ?? config.tetherCount),
    instrumentedTetherCount: Number(electric?.parameters.instrumentedTetherCount ?? config.instrumentedTetherCount),
    tetherLengthKm: Number(electric?.parameters.tetherLengthKm ?? config.tetherLengthKm),
    tetherVoltageKv: Number(electric?.parameters.tetherVoltageKV ?? config.tetherVoltageKv),
    spinRateRpm: Number(electric?.parameters.spinRateRpm ?? config.spinRateRpm),
  }
}

export function applyPropulsionConfiguration(
  config: MissionConfig,
  propulsionModules: PropulsionModule[],
  theoreticalPropulsionMode: boolean,
): MissionConfig {
  const modules = propulsionModules.map((item) => ({
    ...item,
    parameters: { ...item.parameters },
    warnings: [...item.warnings],
  }))
  const electric = modules.find((item) => item.type === 'electric_sail')
  return {
    ...config,
    propulsionModules: modules,
    theoreticalPropulsionMode,
    electricSailEnabled: Boolean(electric?.enabled),
    tetherCount: Number(electric?.parameters.totalTetherCount ?? config.tetherCount),
    instrumentedTetherCount: Number(electric?.parameters.instrumentedTetherCount ?? config.instrumentedTetherCount),
    tetherLengthKm: Number(electric?.parameters.tetherLengthKm ?? config.tetherLengthKm),
    tetherVoltageKv: Number(electric?.parameters.tetherVoltageKV ?? config.tetherVoltageKv),
    spinRateRpm: Number(electric?.parameters.spinRateRpm ?? config.spinRateRpm),
  }
}


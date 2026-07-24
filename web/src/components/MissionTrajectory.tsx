import { Html, Line } from '@react-three/drei'
import { useMemo } from 'react'
import * as THREE from 'three'

import { AU_KM } from '../missionSimulation'
import { toScenePosition } from '../orbitalMath'
import type { MissionPhase, MissionResult, TrajectoryPoint, VisualConfig } from '../types'

const PHASE_COLORS: Record<MissionPhase, string> = {
  EARTH_PARKING_ORBIT: '#4e9cff',
  STAGE_SEPARATION: '#95a4b8',
  EARTH_SWING_ORBIT: '#52d68a',
  SUNDIVER_TRANSFER: '#ff9b42',
  SOLAR_APPROACH: '#ff713d',
  SOLAR_OBERTH_BURN: '#ff334f',
  PAYLOAD_SEPARATION: '#ad7cff',
  ELECTRIC_SAIL_DEPLOYMENT: '#cb7cff',
  ELECTRIC_SAIL_PROPULSION: '#49e7e0',
  DEEP_SPACE_CRUISE: '#55c9ff',
  MISSION_COMPLETE: '#f2f5ff',
}

interface MissionTrajectoryProps {
  result: MissionResult
  elapsedDays: number
  visual: VisualConfig
}

function scenePoint(point: TrajectoryPoint, orbitScale: number, inclinationScale: number) {
  return toScenePosition(new THREE.Vector3(
    point.positionKm[0] / AU_KM,
    point.positionKm[2] / AU_KM,
    point.positionKm[1] / AU_KM,
  ), orbitScale, inclinationScale)
}

export function MissionTrajectory({ result, elapsedDays, visual }: MissionTrajectoryProps) {
  const segments = useMemo(() => {
    const grouped: Array<{ phase: MissionPhase; points: THREE.Vector3[]; endDay: number }> = []
    for (const point of result.trajectory) {
      const current = grouped.at(-1)
      const converted = scenePoint(point, visual.orbitScale, visual.inclinationScale)
      if (!current || current.phase !== point.phase) {
        const previous = current?.points.at(-1)
        grouped.push({ phase: point.phase, points: previous ? [previous, converted] : [converted], endDay: point.elapsedDays })
      } else {
        current.points.push(converted)
        current.endDay = point.elapsedDays
      }
    }
    return grouped.filter((segment) => segment.points.length >= 2)
  }, [result, visual.inclinationScale, visual.orbitScale])

  const currentPoint = useMemo(() => {
    const points = result.trajectory
    let low = 0
    let high = points.length - 1
    while (low < high) {
      const middle = Math.ceil((low + high) / 2)
      if (points[middle].elapsedDays <= elapsedDays) low = middle
      else high = middle - 1
    }
    return points[low]
  }, [elapsedDays, result])
  const probePosition = scenePoint(currentPoint, visual.orbitScale, visual.inclinationScale)
  const parkingOrbit = useMemo(() => {
    const center = scenePoint(result.trajectory[0], visual.orbitScale, visual.inclinationScale)
    const radial = center.clone().normalize()
    const tangent = new THREE.Vector3(-radial.z, 0, radial.x).normalize()
    const normal = new THREE.Vector3(0, 1, 0)
    const displayRadius = 0.24
    return Array.from({ length: 65 }, (_, index) => center.clone()
      .addScaledVector(tangent, Math.cos(index / 64 * Math.PI * 2) * displayRadius)
      .addScaledVector(normal, Math.sin(index / 64 * Math.PI * 2) * displayRadius))
  }, [result, visual.inclinationScale, visual.orbitScale])
  const sailActive = ['ELECTRIC_SAIL_PROPULSION', 'DEEP_SPACE_CRUISE', 'MISSION_COMPLETE'].includes(currentPoint.phase)
  const propulsionModule = (type: string) => result.config.propulsionModules.find((module) => module.type === type && module.enabled && module.visualEnabled)
  const electricModule = propulsionModule('electric_sail')
  const solarSailModule = propulsionModule('solar_sail')
  const magneticSailModule = propulsionModule('magnetic_sail')
  const nuclearElectricModule = propulsionModule('nuclear_electric')
  const electricThruster = propulsionModule('ion') ?? propulsionModule('hall')
  const fusionModule = propulsionModule('fusion')
  const antimatterModule = propulsionModule('antimatter')
  const warpModule = propulsionModule('warp')
  const deploymentStart = result.events.find((event) => event.name === 'ELECTRIC_SAIL_DEPLOYMENT_STARTED')?.elapsedDays ?? 0
  const deploymentProgress = currentPoint.phase === 'ELECTRIC_SAIL_DEPLOYMENT'
    ? Math.min(1, Math.max(0.04, (elapsedDays - deploymentStart) / 4))
    : sailActive ? 1 : 0
  const tetherCount = Math.max(1, Number(electricModule?.parameters.totalTetherCount ?? result.config.tetherCount))
  const instrumentedTetherCount = Math.max(0, Number(electricModule?.parameters.instrumentedTetherCount ?? result.config.instrumentedTetherCount))
  const tetherLengthKm = Math.max(1, Number(electricModule?.parameters.tetherLengthKm ?? result.config.tetherLengthKm))
  const renderedTetherCount = Math.min(80, tetherCount)
  const tetherVisualRadius = (0.24 + Math.min(1.45, tetherLengthKm / 30 * 0.72)) * deploymentProgress
  const continuousPhase = ['ELECTRIC_SAIL_PROPULSION', 'DEEP_SPACE_CRUISE', 'MISSION_COMPLETE'].includes(currentPoint.phase)
  const velocity = new THREE.Vector3(
    currentPoint.velocityKmS[0],
    currentPoint.velocityKmS[2],
    currentPoint.velocityKmS[1],
  ).normalize().multiplyScalar(1.5)

  return (
    <group>
      {visual.showTrajectory && <Line points={parkingOrbit} color="#4e9cff" lineWidth={1.4} transparent opacity={0.86} />}
      {visual.showTrajectory && segments.filter((segment) => visual.showBurn || segment.phase !== 'SOLAR_OBERTH_BURN').map((segment, index) => (
        <Line
          key={`${segment.phase}-${index}`}
          points={segment.points}
          color={PHASE_COLORS[segment.phase]}
          lineWidth={segment.phase === 'SOLAR_OBERTH_BURN' ? 2.4 : 1.25}
          transparent
          opacity={segment.endDay <= elapsedDays ? 0.88 : 0.22}
        />
      ))}
      <group position={probePosition}>
        <mesh>
          <octahedronGeometry args={[Math.max(0.045, 0.018 * visual.probeScale), 1]} />
          <meshStandardMaterial color="#f4f8ff" emissive="#5bd7ff" emissiveIntensity={1.4} />
        </mesh>
        {visual.showStages && visual.showDetachedStages && currentPoint.phase === 'PAYLOAD_SEPARATION' && (
          <mesh position={[-0.18, 0, 0]}>
            <boxGeometry args={[0.11, 0.08, 0.08]} />
            <meshStandardMaterial color="#7f8794" />
          </mesh>
        )}
        {visual.showSail && electricModule && deploymentProgress > 0 && (
          <group rotation={[Math.PI / 2, 0, 0]}>
            {Array.from({ length: renderedTetherCount }, (_, index) => {
              const angle = index / renderedTetherCount * Math.PI * 2
              const endpoint: [number, number, number] = [Math.cos(angle) * tetherVisualRadius, Math.sin(angle) * tetherVisualRadius, 0]
              const instrumented = index < instrumentedTetherCount / tetherCount * renderedTetherCount
              return (
                <group key={index}>
                  <Line points={[[0, 0, 0], endpoint]} color={visual.highlightSensorTethers && instrumented ? '#ffcf5a' : '#71e6eb'} lineWidth={instrumented ? 1 : 0.55} transparent opacity={sailActive ? 0.9 : 0.58} />
                  <mesh position={endpoint}>
                    <sphereGeometry args={[instrumented ? 0.025 : 0.016, 8, 8]} />
                    <meshBasicMaterial color={instrumented ? '#ffd86f' : '#b7eaf0'} />
                  </mesh>
                  {instrumented && electricModule.parameters.showOpticalFibers && <Line points={[[0, 0, 0.008], [endpoint[0], endpoint[1], 0.008]]} color="#fff2b0" lineWidth={0.35} transparent opacity={0.5} />}
                </group>
              )
            })}
            {sailActive && <pointLight color="#57efff" intensity={1.8} distance={4} />}
          </group>
        )}
        {visual.showSail && solarSailModule && continuousPhase && (
          <mesh rotation={[Math.PI / 2, 0, Math.PI / 4]}>
            <planeGeometry args={[1.5, 1.5]} />
            <meshStandardMaterial color="#e9f1ff" emissive="#8ebcff" emissiveIntensity={0.35} metalness={0.75} roughness={0.18} side={THREE.DoubleSide} transparent opacity={0.78} />
          </mesh>
        )}
        {magneticSailModule && continuousPhase && (
          <group rotation={[Math.PI / 2, 0, 0]}>
            {[0.55, 0.85, 1.15].map((radius, index) => <mesh key={radius} rotation={[index * 0.7, index * 0.5, 0]}><torusGeometry args={[radius, 0.018, 8, 64]} /><meshBasicMaterial color="#b06cff" transparent opacity={0.45} /></mesh>)}
          </group>
        )}
        {nuclearElectricModule && continuousPhase && (
          <group>
            <mesh position={[-0.38, 0, 0]}><boxGeometry args={[0.5, 0.03, 0.22]} /><meshStandardMaterial color="#6f87a5" emissive="#294f80" emissiveIntensity={0.5} /></mesh>
            <mesh position={[0.38, 0, 0]}><boxGeometry args={[0.5, 0.03, 0.22]} /><meshStandardMaterial color="#6f87a5" emissive="#294f80" emissiveIntensity={0.5} /></mesh>
          </group>
        )}
        {electricThruster && continuousPhase && (
          <mesh position={[0, 0, 0.42]} rotation={[Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.09, 0.7, 18]} />
            <meshBasicMaterial color="#5a9fff" transparent opacity={0.55} />
          </mesh>
        )}
        {fusionModule && result.config.theoreticalPropulsionMode && continuousPhase && (
          <mesh position={[0, 0, 0.7]} rotation={[Math.PI / 2, 0, 0]}><coneGeometry args={[0.22, 1.4, 20]} /><meshBasicMaterial color="#ff63d7" transparent opacity={0.7} /></mesh>
        )}
        {antimatterModule && result.config.theoreticalPropulsionMode && continuousPhase && (
          <mesh><sphereGeometry args={[0.25, 20, 20]} /><meshBasicMaterial color="#ffecff" wireframe /><pointLight color="#ff5cff" intensity={4} distance={5} /></mesh>
        )}
        {warpModule && (
          <group>
            <mesh scale={[1.35, 0.85, 2.1]}><sphereGeometry args={[1, 32, 20]} /><meshBasicMaterial color="#9b6cff" wireframe transparent opacity={0.24} /></mesh>
            <Html center position={[0, 1.3, 0]}><span className="speculation-badge">HYPOTHETISCH · WARP VISUALISIERUNG</span></Html>
          </group>
        )}
        {visual.showVectors && (
          <Line points={[[0, 0, 0], velocity]} color="#62ff8d" lineWidth={1.5} />
        )}
        {visual.showForceVectors && (
          <Line points={[[0, 0, 0], probePosition.clone().normalize().multiplyScalar(1.1)]} color="#ff795f" lineWidth={1.2} />
        )}
        {visual.showLabels && (
          <Html center position={[0, 0.45, 0]}>
            <span className="planet-label">Sonde · {currentPoint.phase.replaceAll('_', ' ')}</span>
          </Html>
        )}
      </group>
    </group>
  )
}

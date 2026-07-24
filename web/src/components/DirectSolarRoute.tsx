import { Line } from '@react-three/drei'
import { useMemo } from 'react'
import * as THREE from 'three'

import { AU_KM } from '../missionSimulation'
import { toScenePosition } from '../orbitalMath'
import { DraggableInfoLabel } from './DraggableInfoLabel'

export interface DirectSolarRouteResult {
  startDate: string
  burnDay: number
  trajectory: Array<{ elapsedDays: number; positionKm: [number, number, number] }>
  segments: Array<{
    id: 'earth-to-oberth' | 'direct-solar-outbound'
    label: string
    startIndex: number
    endIndex: number
  }>
  targetDirection: [number, number, number]
  summary: {
    requiredVectorDeltaVKmS: number
    availableDeltaVKmS: number
    feasibleWithConfiguredBurn: boolean
    finalTargetAlignmentDeg: number
    targetEclipticLatitudeDeg: number
    optimizedBurnLongitudeDeg: number
    optimizedBurnLatitudeDeg: number
    shootingIterations: number
    model: string
  }
}

interface DirectSolarRouteProps {
  route: DirectSolarRouteResult
  orbitScale: number
  inclinationScale: number
  showNavigationGuide: boolean
  targetPosition?: THREE.Vector3
  onInfoDragChange?: (label: string, active: boolean) => void
}

export function DirectSolarRoute({ route, orbitScale, inclinationScale, showNavigationGuide, targetPosition, onInfoDragChange }: DirectSolarRouteProps) {
  const segments = useMemo(() => route.segments.map((segment) => ({
    ...segment,
    points: route.trajectory.slice(segment.startIndex, segment.endIndex + 1).map((point) => toScenePosition(
      new THREE.Vector3(point.positionKm[0] / AU_KM, point.positionKm[2] / AU_KM, point.positionKm[1] / AU_KM),
      orbitScale,
      inclinationScale,
    )),
  })), [inclinationScale, orbitScale, route])
  const burnPoint = segments[0]?.points.at(-1)

  return (
    <group>
      {segments.map((segment) => (
        <Line
          key={`direct-${segment.id}`}
          points={segment.points}
          color={segment.id === 'earth-to-oberth' ? '#ffad5c' : route.summary.feasibleWithConfiguredBurn ? '#ffe66d' : '#ff9f43'}
          lineWidth={segment.id === 'direct-solar-outbound' ? 2.6 : 1.3}
          transparent
          opacity={segment.id === 'direct-solar-outbound' ? 0.95 : 0.42}
        />
      ))}
      {showNavigationGuide && targetPosition && segments[0]?.points[0] && (
        <Line points={[segments[0].points[0], targetPosition]} color="#fff0a8" lineWidth={0.9} dashed dashSize={1.0} gapSize={0.55} transparent opacity={0.82} depthWrite={false} />
      )}
      {burnPoint && (
        <DraggableInfoLabel position={burnPoint} initialOffset={[-265, -118]} label="Alternative B" onDragChange={onInfoDragChange}>
          <span className="interstellar-label direct-route-label"><strong>Alternative B · direkt über Sonne</strong><small>Start {route.startDate} · Zielbreite {route.summary.targetEclipticLatitudeDeg.toFixed(1)}°</small><small>{route.summary.feasibleWithConfiguredBurn ? 'Δv ausreichend' : `benötigt ${route.summary.requiredVectorDeltaVKmS.toFixed(1)} km/s · verfügbar ${route.summary.availableDeltaVKmS.toFixed(1)} km/s`}</small></span>
        </DraggableInfoLabel>
      )}
    </group>
  )
}

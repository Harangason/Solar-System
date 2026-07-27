import { Html, Line, OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { useMemo, useState } from 'react'
import * as THREE from 'three'

import { corridorArcs, type EntryCorridorDefinition } from '../entryCorridorGeometry'
import { DraggableOverlayPanel } from './DraggableOverlayPanel'
import type { WaypointRouteResult } from './PlannedWaypointRoute'

interface FlybyFocusInsetProps {
  route: WaypointRouteResult
  elapsedDays: number
}

type FocusScale = 'soi' | 'periapsis'

const localFromPlanet = (positionKm: [number, number, number], scale: number) => new THREE.Vector3(
  positionKm[0] * scale,
  positionKm[2] * scale,
  positionKm[1] * scale,
)

function FlybyGeometry({ route, elapsedDays, scaleMode }: FlybyFocusInsetProps & { scaleMode: FocusScale }) {
  const geometry = route.flybyGeometry
  const focus = useMemo(() => {
    if (!geometry?.relativeTrajectory?.length || !geometry.sphereOfInfluenceRadiusKm) return null
    const periapsisRadius = geometry.periapsisRadiusKm
    const physicalLimit = scaleMode === 'soi' ? geometry.sphereOfInfluenceRadiusKm * 1.001 : periapsisRadius * 6
    const displayLimit = scaleMode === 'soi' ? 4.35 : 4.8
    const scale = displayLimit / physicalLimit

    const selected = geometry.relativeTrajectory.filter((state) => new THREE.Vector3(...state.positionKm).length() <= physicalLimit)
    if (selected.length < 2) return null
    const points = selected.map((state) => localFromPlanet(state.positionKm, scale))
    const periapsisIndex = selected.reduce((best, state, index) => (
      new THREE.Vector3(...state.positionKm).length() < new THREE.Vector3(...selected[best].positionKm).length() ? index : best
    ), 0)
    const currentIndex = selected.reduce((best, state, index) => (
      Math.abs(state.elapsedDays - elapsedDays) < Math.abs(selected[best].elapsedDays - elapsedDays) ? index : best
    ), 0)
    const withinTime = elapsedDays >= selected[0].elapsedDays && elapsedDays <= selected[selected.length - 1].elapsedDays

    const flybyPlaneNormal = geometry.flybyPlaneNormal
      ? new THREE.Vector3(geometry.flybyPlaneNormal[0], geometry.flybyPlaneNormal[2], geometry.flybyPlaneNormal[1]).normalize()
      : new THREE.Vector3(0, 0, 1)
    const orientation = new THREE.Quaternion().setFromUnitVectors(flybyPlaneNormal, new THREE.Vector3(0, 0, 1))

    const tangentEnd = (
      point: THREE.Vector3,
      state: { velocityKmS: [number, number, number] },
    ) => point.clone().add(
      new THREE.Vector3(state.velocityKmS[0], state.velocityKmS[2], state.velocityKmS[1]).normalize().multiplyScalar(0.9),
    )

    const aimpoint = geometry.aimpoint?.relativePositionKm
      ? localFromPlanet(geometry.aimpoint.relativePositionKm, scale)
      : null
    const aimpointHeightKm = geometry.aimpoint?.altitudeKm ?? (
      geometry.aimpoint?.relativePositionKm
        ? new THREE.Vector3(...geometry.aimpoint.relativePositionKm).length() - geometry.planetRadiusKm
        : 0.0
    )
    const entryCorridor = route.entryCorridor?.enabled
      ? route.entryCorridor
      : null
    const entryCorridorArcs = entryCorridor
      ? corridorArcs(
        entryCorridor as EntryCorridorDefinition,
        geometry.sphereOfInfluenceRadiusKm,
      ).map((arc) => arc.map((point) => localFromPlanet(
        [point.x, point.y, point.z],
        scale,
      )))
      : []
    const selectedCorridorEntry = entryCorridor?.actualEntryDirection
      ? localFromPlanet(entryCorridor.actualEntryDirection, geometry.sphereOfInfluenceRadiusKm * scale)
      : null

    return {
      points,
      selected,
      entry: points[0],
      periapsis: points[periapsisIndex],
      exit: points[points.length - 1],
      probe: withinTime ? points[currentIndex] : null,
      entryTangentEnd: tangentEnd(points[0], selected[0]),
      periapsisTangentEnd: tangentEnd(points[periapsisIndex], selected[periapsisIndex]),
      exitTangentEnd: tangentEnd(points[points.length - 1], selected[selected.length - 1]),
      planetRadius: geometry.planetRadiusKm * scale,
      orientation,
      aimpoint,
      aimpointHeightKm,
      aimpointRole: geometry.aimpoint?.role,
      aimpointWarning: geometry.aimpoint?.warning,
      entryCorridor,
      entryCorridorArcs,
      selectedCorridorEntry,
    }
  }, [elapsedDays, geometry, route.entryCorridor, scaleMode])

  if (!focus || !geometry) return null
  return (
    <group quaternion={focus.orientation}>
      <Line points={focus.points} color="#bfff67" lineWidth={3} transparent opacity={0.98} />
      <Line points={[focus.entry, focus.periapsis]} color="#67dcff" lineWidth={1.3} transparent opacity={0.68} />
      <Line points={[focus.periapsis, focus.exit]} color="#55ff8a" lineWidth={1.3} transparent opacity={0.68} />
      <Line points={[focus.entry, focus.entryTangentEnd]} color="#67dcff" lineWidth={1.3} transparent opacity={0.82} />
      <Line points={[focus.periapsis, focus.periapsisTangentEnd]} color="#fff09a" lineWidth={1.3} transparent opacity={0.82} />
      <Line points={[focus.exit, focus.exitTangentEnd]} color="#55ff8a" lineWidth={1.3} transparent opacity={0.82} />
      <mesh>
        <sphereGeometry args={[Math.max(focus.planetRadius, 0.012), 28, 28]} />
        <meshStandardMaterial color="#c78643" emissive="#482307" emissiveIntensity={0.3} roughness={0.78} />
      </mesh>
      {scaleMode === 'soi' && <>
        <Line points={[[-0.12, 0, 0], [0.12, 0, 0]]} color="#ffbf62" lineWidth={1.2} />
        <Line points={[[0, -0.12, 0], [0, 0.12, 0]]} color="#ffbf62" lineWidth={1.2} />
      </>}
      <mesh position={focus.entry}><sphereGeometry args={[0.065, 12, 12]} /><meshBasicMaterial color="#67dcff" /></mesh>
      <mesh position={focus.exit}><sphereGeometry args={[0.065, 12, 12]} /><meshBasicMaterial color="#55ff8a" /></mesh>
      <mesh position={focus.periapsis}><sphereGeometry args={[0.055, 12, 12]} /><meshBasicMaterial color="#fff09a" /></mesh>
      {focus.aimpoint && <mesh position={focus.aimpoint}><sphereGeometry args={[0.068, 16, 16]} /><meshStandardMaterial color="#ff7ff8" emissive="#ff7ff8" emissiveIntensity={0.65} /></mesh>}
      {focus.aimpoint && <Line points={[focus.exit, focus.aimpoint]} color="#ff89e2" lineWidth={1.1} dashed dashSize={0.5} gapSize={0.22} transparent opacity={0.78} />}
      <Html center position={focus.entry}><span className="flyby-focus-label">Eintrittskurve · {geometry.entryLatitudeDeg?.toFixed(1)}°</span></Html>
      <Html center position={focus.exit}><span className="flyby-focus-label">Austrittskurve</span></Html>
      <Html center position={focus.periapsis}><span className="flyby-focus-label">Periapsis-Hyperbel · {geometry.periapsisLatitudeDeg?.toFixed(1)}°</span></Html>
      {focus.aimpoint && (
        <Html center position={focus.aimpoint}>
          <span className="flyby-focus-label">
            Aimpoint {focus.aimpointRole ?? 'periapsis'} · h {Math.max(0, Math.round(focus.aimpointHeightKm)).toLocaleString('de-DE', { maximumFractionDigits: 0 })} km
          </span>
        </Html>
      )}
      {focus.aimpointWarning && <Html center position={[0, focus.planetRadius + 0.25, 0]}><span className="flyby-focus-label route-warning">{focus.aimpointWarning}</span></Html>}
      {scaleMode === 'soi' && focus.entryCorridorArcs.map((arc, index) => (
        <Line key={`entry-corridor-${index}`} points={arc} color="#ffda67" lineWidth={2.4} transparent opacity={0.96} depthWrite={false} />
      ))}
      {scaleMode === 'soi' && focus.selectedCorridorEntry && (
        <>
          <mesh position={focus.selectedCorridorEntry}>
            <sphereGeometry args={[0.085, 18, 18]} />
            <meshStandardMaterial color={focus.entryCorridor?.entryInsideCorridor ? '#ffffff' : '#ff425f'} emissive="#67dcff" emissiveIntensity={0.65} />
          </mesh>
          <Html center position={focus.selectedCorridorEntry.clone().multiplyScalar(1.04)}>
            <span className="flyby-focus-label">gewählter SOI-Eintritt</span>
          </Html>
        </>
      )}
      {focus.probe && <mesh position={focus.probe}><octahedronGeometry args={[0.11, 1]} /><meshStandardMaterial color="#fff4b0" emissive="#ff8d3a" emissiveIntensity={1.1} /></mesh>}
    </group>
  )
}

export function FlybyFocusInset({ route, elapsedDays }: FlybyFocusInsetProps) {
  const [scaleMode, setScaleMode] = useState<FocusScale>('periapsis')
  if (!route.flybyGeometry?.relativeTrajectory?.length) return null
  return (
    <DraggableOverlayPanel
      className="flyby-focus"
      ariaLabel="Linear skalierter planetenzentrierter Vorbeiflug"
      header={<>
        <div><strong>Flyby-Fokus · mitbewegtes System</strong><small>Physikalische Hyperbel · {route.flybyGeometry?.sampleCount ?? 0} Zustände · Tangenten farbig · linear und unverzerrt</small><small>{route.summary.targetInjectionApplied ? `Am SOI-Austritt folgt ein separater Zielimpuls Δv ${(route.summary.targetCorrectionDeltaVKmS ?? 0).toFixed(2)} km/s.` : 'Kein separater Zielimpuls am SOI-Austritt.'}</small></div>
        <nav aria-label="Flyby-Maßstab">
          <button type="button" className={scaleMode === 'soi' ? 'selected' : ''} onClick={() => setScaleMode('soi')}>SOI gesamt</button>
          <button type="button" className={scaleMode === 'periapsis' ? 'selected' : ''} onClick={() => setScaleMode('periapsis')}>Perizentrum</button>
        </nav>
      </>}
    >
      <div className="flyby-focus-canvas">
        <Canvas camera={{ position: [0, 1.3, 9.5], fov: 48, far: 120 }}>
          <color attach="background" args={['#020712']} />
          <ambientLight intensity={0.8} />
          <directionalLight position={[4, 6, 5]} intensity={1.1} />
          <FlybyGeometry route={route} elapsedDays={elapsedDays} scaleMode={scaleMode} />
          <OrbitControls makeDefault enablePan enableZoom minDistance={3} maxDistance={120} />
        </Canvas>
      </div>
    </DraggableOverlayPanel>
  )
}

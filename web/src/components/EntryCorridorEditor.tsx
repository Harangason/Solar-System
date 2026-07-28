import { Html, Line, OrbitControls } from '@react-three/drei'
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'

import {
  corridorArcs,
  corridorDirection,
  physicsToScene,
  sceneToPhysics,
  type EntryCorridorDefinition,
} from '../entryCorridorGeometry'
import { DraggableOverlayPanel } from './DraggableOverlayPanel'

interface EntryCorridorEditorProps {
  waypointName: string
  waypointColor: string
  definition: EntryCorridorDefinition
  onChange: (definition: EntryCorridorDefinition) => void
  onClose: () => void
}

type ZoomMode = 'overview' | 'corridor'
const SOI_RADIUS = 2.35

interface CorridorSceneProps {
  definition: EntryCorridorDefinition
  waypointColor: string
  zoomMode: ZoomMode
  onCenterChange: (centerDirection: [number, number, number]) => void
}

function CorridorCamera({ definition, zoomMode }: Pick<CorridorSceneProps, 'definition' | 'zoomMode'>) {
  const { camera } = useThree()
  const sceneCenter = useMemo(
    () => physicsToScene(new THREE.Vector3(...definition.centerDirection)).normalize(),
    [definition.centerDirection],
  )
  useEffect(() => {
    if (zoomMode === 'corridor') {
      camera.position.copy(sceneCenter).multiplyScalar(5.2)
      camera.lookAt(sceneCenter.clone().multiplyScalar(SOI_RADIUS))
    } else {
      camera.position.set(0, 0.6, 7.8)
      camera.lookAt(0, 0, 0)
    }
    camera.updateProjectionMatrix()
  }, [camera, sceneCenter, zoomMode])
  return null
}

function CorridorScene({
  definition,
  waypointColor,
  zoomMode,
  onCenterChange,
}: CorridorSceneProps) {
  const dragging = useRef<number | null>(null)
  const arcs = useMemo(
    () => corridorArcs(definition, SOI_RADIUS * 1.006).map(
      (arc) => arc.map(physicsToScene),
    ),
    [definition],
  )
  const gridArcs = useMemo(() => [
    ...[-0.5, 0, 0.5].map((factor) => {
      const horizontal = definition.horizontalHalfAngleDeg * factor
      return Array.from({ length: 41 }, (_, index) => physicsToScene(
        corridorDirection(
          definition,
          horizontal,
          -definition.verticalHalfAngleDeg + index / 40 * definition.verticalHalfAngleDeg * 2,
        ).multiplyScalar(SOI_RADIUS * 1.004),
      ))
    }),
    ...[-0.5, 0, 0.5].map((factor) => {
      const vertical = definition.verticalHalfAngleDeg * factor
      return Array.from({ length: 41 }, (_, index) => physicsToScene(
        corridorDirection(
          definition,
          -definition.horizontalHalfAngleDeg + index / 40 * definition.horizontalHalfAngleDeg * 2,
          vertical,
        ).multiplyScalar(SOI_RADIUS * 1.004),
      ))
    }),
  ], [definition])
  const center = useMemo(
    () => physicsToScene(new THREE.Vector3(...definition.centerDirection)).normalize().multiplyScalar(SOI_RADIUS * 1.018),
    [definition.centerDirection],
  )
  const orbitTarget = useMemo(
    () => zoomMode === 'corridor' ? center.clone().multiplyScalar(0.92) : new THREE.Vector3(),
    [center, zoomMode],
  )

  const updateCenter = (event: ThreeEvent<PointerEvent>) => {
    onCenterChange(sceneToPhysics(event.point))
  }
  const finishDrag = (event: ThreeEvent<PointerEvent>) => {
    if (dragging.current !== event.pointerId) return
    dragging.current = null
    const target = event.target as EventTarget & { releasePointerCapture?: (pointerId: number) => void }
    target.releasePointerCapture?.(event.pointerId)
  }

  return (
    <>
      <CorridorCamera definition={definition} zoomMode={zoomMode} />
      <mesh
        onPointerDown={(event) => {
          event.stopPropagation()
          dragging.current = event.pointerId
          updateCenter(event)
          const target = event.target as EventTarget & { setPointerCapture?: (pointerId: number) => void }
          target.setPointerCapture?.(event.pointerId)
        }}
        onPointerMove={(event) => {
          if (dragging.current === event.pointerId) updateCenter(event)
        }}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
      >
        <sphereGeometry args={[SOI_RADIUS, 56, 40]} />
        <meshStandardMaterial color={waypointColor} transparent opacity={0.1} roughness={0.85} depthWrite={false} />
      </mesh>
      <mesh>
        <sphereGeometry args={[SOI_RADIUS * 1.001, 36, 24]} />
        <meshBasicMaterial color="#42617b" wireframe transparent opacity={0.25} depthWrite={false} />
      </mesh>
      {gridArcs.map((arc, index) => (
        <Line key={`grid-${index}`} points={arc} color="#67dcff" lineWidth={0.8} transparent opacity={0.32} depthWrite={false} />
      ))}
      {arcs.map((arc, index) => (
        <Line key={`boundary-${index}`} points={arc} color="#ffda67" lineWidth={2.8} transparent opacity={0.98} depthWrite={false} />
      ))}
      <mesh position={center}>
        <sphereGeometry args={[0.075, 18, 18]} />
        <meshStandardMaterial color="#ffffff" emissive="#67dcff" emissiveIntensity={0.8} />
      </mesh>
      <Line points={[[0, 0, 0], center]} color="#8be8ff" lineWidth={1} dashed dashSize={0.12} gapSize={0.08} />
      <Html center position={center.clone().multiplyScalar(1.06)}>
        <span className="flyby-focus-label">Zielbereich</span>
      </Html>
      <OrbitControls
        makeDefault
        enablePan
        enableZoom
        minDistance={1.2}
        maxDistance={18}
        target={orbitTarget}
      />
    </>
  )
}

export function EntryCorridorEditor({
  waypointName,
  waypointColor,
  definition,
  onChange,
  onClose,
}: EntryCorridorEditorProps) {
  const [zoomMode, setZoomMode] = useState<ZoomMode>('corridor')
  const centerAngles = useMemo(() => {
    const [x, y, z] = definition.centerDirection
    return {
      longitudeDeg: THREE.MathUtils.radToDeg(Math.atan2(y, x)),
      latitudeDeg: THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(z, -1, 1))),
    }
  }, [definition.centerDirection])
  const updateNumber = (
    key: 'horizontalHalfAngleDeg' | 'verticalHalfAngleDeg' | 'rotationDeg',
    value: number,
  ) => {
    if (!Number.isFinite(value)) return
    const bounded = key === 'rotationDeg' ? value : THREE.MathUtils.clamp(value, 0.1, 80)
    onChange({ ...definition, [key]: bounded })
  }
  const updateCenterAngles = (longitudeDeg: number, latitudeDeg: number) => {
    if (!Number.isFinite(longitudeDeg) || !Number.isFinite(latitudeDeg)) return
    const longitude = THREE.MathUtils.degToRad(longitudeDeg)
    const latitude = THREE.MathUtils.degToRad(THREE.MathUtils.clamp(latitudeDeg, -90, 90))
    const cosineLatitude = Math.cos(latitude)
    onChange({
      ...definition,
      centerDirection: [
        cosineLatitude * Math.cos(longitude),
        cosineLatitude * Math.sin(longitude),
        Math.sin(latitude),
      ],
    })
  }

  return (
    <DraggableOverlayPanel
      className="entry-corridor-editor"
      ariaLabel={`Eintrittskorridor für ${waypointName} bearbeiten`}
      header={<>
        <div>
          <strong>{waypointName} · SOI-Eintrittskorridor</strong>
          <small>Gelbe Bögen begrenzen den Zielbereich; auf die SOI klicken oder ziehen verschiebt ihn.</small>
        </div>
        <nav aria-label="Korridoransicht">
          <button type="button" className={zoomMode === 'overview' ? 'selected' : ''} onClick={() => setZoomMode('overview')}>SOI gesamt</button>
          <button type="button" className={zoomMode === 'corridor' ? 'selected' : ''} onClick={() => setZoomMode('corridor')}>Korridor-Zoom</button>
          <button type="button" onClick={onClose}>Fertig</button>
        </nav>
      </>}
    >
      <div className="entry-corridor-canvas">
        <Canvas camera={{ position: [0, 0.6, 7.8], fov: 46, near: 0.02, far: 80 }}>
          <color attach="background" args={['#020712']} />
          <ambientLight intensity={0.85} />
          <directionalLight position={[5, 7, 6]} intensity={1.15} />
          <CorridorScene
            definition={definition}
            waypointColor={waypointColor}
            zoomMode={zoomMode}
            onCenterChange={(centerDirection) => onChange({ ...definition, centerDirection })}
          />
        </Canvas>
      </div>
      <div className="entry-corridor-controls">
        <label>
          <span>Mittelpunkt-Länge</span>
          <input type="number" min="-180" max="180" step="1" value={centerAngles.longitudeDeg.toFixed(2)} onChange={(event) => updateCenterAngles(event.target.valueAsNumber, centerAngles.latitudeDeg)} />
          <output>°</output>
        </label>
        <label>
          <span>Mittelpunkt-Breite</span>
          <input type="number" min="-90" max="90" step="1" value={centerAngles.latitudeDeg.toFixed(2)} onChange={(event) => updateCenterAngles(centerAngles.longitudeDeg, event.target.valueAsNumber)} />
          <output>°</output>
        </label>
        <label>
          <span>Horizontaler Halbwinkel</span>
          <input type="range" min="0.5" max="60" step="0.5" value={definition.horizontalHalfAngleDeg} onChange={(event) => updateNumber('horizontalHalfAngleDeg', event.target.valueAsNumber)} />
          <output>{definition.horizontalHalfAngleDeg.toFixed(1)}°</output>
        </label>
        <label>
          <span>Vertikaler Halbwinkel</span>
          <input type="range" min="0.5" max="60" step="0.5" value={definition.verticalHalfAngleDeg} onChange={(event) => updateNumber('verticalHalfAngleDeg', event.target.valueAsNumber)} />
          <output>{definition.verticalHalfAngleDeg.toFixed(1)}°</output>
        </label>
        <label>
          <span>Bogendrehung</span>
          <input type="range" min="-180" max="180" step="1" value={definition.rotationDeg} onChange={(event) => updateNumber('rotationDeg', event.target.valueAsNumber)} />
          <output>{definition.rotationDeg.toFixed(0)}°</output>
        </label>
      </div>
    </DraggableOverlayPanel>
  )
}

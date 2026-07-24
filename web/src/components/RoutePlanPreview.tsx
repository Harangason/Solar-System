import { Html, Line, useTexture } from '@react-three/drei'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import {
  circleEuler,
  circleLocalPoints,
  circleWorldEdge,
  circleWorldNormal,
  circleWorldPoints,
  axisDragPlaneNormal,
  rayAxisPlaneScalar,
  rotatedEulerFromDrag,
  sceneTuple,
  sceneVector,
  type SceneTuple,
} from '../routeSketchGeometry'
import { updateSketchLineEndpoint } from '../routeSketchState'

export type RouteDrawTool = 'move' | 'route-point' | 'line' | 'radius'
export type RouteTransformMode = 'translate' | 'rotate'
export type { SceneTuple } from '../routeSketchGeometry'
export type RouteSketchSelection = {
  kind: 'node' | 'line-start' | 'line-end' | 'circle' | 'circle-radius'
  id: string
} | null

export interface RouteSketchNode {
  id: string
  label: string
  position: SceneTuple
  locked: boolean
  anchor: 'earth' | 'sun' | 'waypoint' | 'target' | 'control'
}

export interface RouteSketchLine {
  id: string
  start: SceneTuple
  end: SceneTuple
}

export interface RouteSketchCircle {
  id: string
  center: SceneTuple
  radius: number
  rotation: SceneTuple
  label: string
}

export interface RouteSketch {
  nodes: RouteSketchNode[]
  lines: RouteSketchLine[]
  circles: RouteSketchCircle[]
}

interface RoutePlanPreviewProps {
  earth: THREE.Vector3
  sun: THREE.Vector3
  waypoint: THREE.Vector3
  target: THREE.Vector3
  waypointId: string
  waypointName: string
  waypointColor: string
  waypointRadius: number
  encounterDay: number
  encounterDate: string
  confirmed: boolean
  sketch: RouteSketch
  drawTool: RouteDrawTool
  transformMode: RouteTransformMode
  selection: RouteSketchSelection
  editable: boolean
  onSketchChange: (sketch: RouteSketch, recordHistory?: boolean) => void
  onSelectionChange: (selection: RouteSketchSelection) => void
  onEditingChange: (editing: boolean) => void
  requestedPlan?: {
    earth: THREE.Vector3
    waypoint: THREE.Vector3
    startDate: string
    encounterDay: number
    encounterDate: string
  }
}

function tuple(vector: THREE.Vector3): SceneTuple {
  return sceneTuple(vector)
}

function vector(point: SceneTuple) {
  return sceneVector(point)
}

function sketchId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function createRouteSketch(values: {
  earth: THREE.Vector3
  sun: THREE.Vector3
  waypoint: THREE.Vector3
  target: THREE.Vector3
  waypointName: string
  waypointRadius: number
}): RouteSketch {
  return {
    nodes: [
      { id: 'anchor-earth', label: 'Erde · Start', position: tuple(values.earth), locked: true, anchor: 'earth' },
      { id: 'anchor-sun', label: 'Sonne / Oberth', position: tuple(values.sun), locked: true, anchor: 'sun' },
      { id: 'anchor-waypoint', label: `${values.waypointName} · Begegnung`, position: tuple(values.waypoint), locked: true, anchor: 'waypoint' },
      { id: 'anchor-target', label: 'Interstellares Ziel', position: tuple(values.target), locked: true, anchor: 'target' },
    ],
    lines: [],
    circles: [
      { id: 'radius-sun', center: tuple(values.sun), radius: 1.25, rotation: [0, 0, 0], label: 'Sonnen-Nahbereich' },
      { id: 'radius-waypoint', center: tuple(values.waypoint), radius: Math.max(values.waypointRadius * 4, 0.45), rotation: [0, 0, 0], label: `${values.waypointName}-Anflugradius` },
    ],
  }
}

function pointOnPlane(event: ThreeEvent<PointerEvent>, planeY: number) {
  const result = new THREE.Vector3()
  return event.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY), result)
}

const WORLD_AXES = [
  { id: 'x', direction: new THREE.Vector3(1, 0, 0), color: '#ff5a67' },
  { id: 'y', direction: new THREE.Vector3(0, 1, 0), color: '#72ff8f' },
  { id: 'z', direction: new THREE.Vector3(0, 0, 1), color: '#68a8ff' },
] as const

interface TranslationGizmoProps {
  position: THREE.Vector3
  localRotation?: THREE.Euler
  xAxisOnly?: boolean
  onMove: (position: THREE.Vector3) => void
  onEditingChange: (editing: boolean) => void
}

function TranslationGizmo({ position, localRotation, xAxisOnly = false, onMove, onEditingChange }: TranslationGizmoProps) {
  const groupRef = useRef<THREE.Group>(null)
  const { camera } = useThree()
  const dragRef = useRef<{
    pointerId: number
    axis: THREE.Vector3
    planeNormal: THREE.Vector3
    startScalar: number
    startPosition: THREE.Vector3
  } | null>(null)
  const rotationQuaternion = useMemo(() => new THREE.Quaternion().setFromEuler(localRotation ?? new THREE.Euler()), [localRotation?.x, localRotation?.y, localRotation?.z])
  const axes = useMemo(() => (xAxisOnly ? WORLD_AXES.slice(0, 1) : WORLD_AXES).map((axis) => ({
    ...axis,
    direction: axis.direction.clone().applyQuaternion(rotationQuaternion).normalize(),
  })), [rotationQuaternion, xAxisOnly])

  useFrame(() => {
    const group = groupRef.current
    if (!group) return
    group.scale.setScalar(Math.max(0.28, camera.position.distanceTo(position) * 0.021))
  })

  const finishDrag = (event: ThreeEvent<PointerEvent>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.stopPropagation()
    dragRef.current = null
    onEditingChange(false)
    const target = event.target as EventTarget & { releasePointerCapture?: (pointerId: number) => void }
    target.releasePointerCapture?.(event.pointerId)
  }

  return (
    <group ref={groupRef} position={position} renderOrder={1000}>
      {axes.map((axis) => {
        const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.direction)
        return <group
          key={axis.id}
          quaternion={quaternion}
          onPointerDown={(event) => {
            event.stopPropagation()
            const planeNormal = axisDragPlaneNormal(axis.direction, camera.position.clone().sub(position))
            const startScalar = rayAxisPlaneScalar(event.ray, position, axis.direction, planeNormal)
            if (startScalar === null) return
            dragRef.current = {
              pointerId: event.pointerId,
              axis: axis.direction.clone(),
              planeNormal,
              startScalar,
              startPosition: position.clone(),
            }
            onEditingChange(true)
            const target = event.target as EventTarget & { setPointerCapture?: (pointerId: number) => void }
            target.setPointerCapture?.(event.pointerId)
          }}
          onPointerMove={(event) => {
            const drag = dragRef.current
            if (!drag || drag.pointerId !== event.pointerId) return
            event.stopPropagation()
            const scalar = rayAxisPlaneScalar(event.ray, drag.startPosition, drag.axis, drag.planeNormal)
            if (scalar === null) return
            onMove(drag.startPosition.clone().addScaledVector(drag.axis, scalar - drag.startScalar))
          }}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
        >
          <Line points={[[0, 0, 0], [0, 1.35, 0]]} color={axis.color} lineWidth={4} depthTest={false} renderOrder={1001} />
          <mesh position={[0, 1.48, 0]} renderOrder={1002}>
            <coneGeometry args={[0.13, 0.32, 18]} />
            <meshBasicMaterial color={axis.color} depthTest={false} />
          </mesh>
          <mesh
            position={[0, 0.75, 0]}
            renderOrder={1003}
          >
            <cylinderGeometry args={[0.2, 0.2, 1.5, 10]} />
            <meshBasicMaterial transparent opacity={0.025} depthTest={false} colorWrite={false} />
          </mesh>
        </group>
      })}
    </group>
  )
}

interface RotationGizmoProps {
  position: THREE.Vector3
  rotation: THREE.Euler
  onRotate: (rotation: THREE.Euler) => void
  onEditingChange: (editing: boolean) => void
}

function RotationGizmo({ position, rotation, onRotate, onEditingChange }: RotationGizmoProps) {
  const groupRef = useRef<THREE.Group>(null)
  const { camera } = useThree()
  const dragRef = useRef<{
    pointerId: number
    axisWorld: THREE.Vector3
    startVector: THREE.Vector3
    startQuaternion: THREE.Quaternion
  } | null>(null)

  useFrame(() => {
    const group = groupRef.current
    if (!group) return
    group.scale.setScalar(Math.max(0.3, camera.position.distanceTo(position) * 0.023))
  })

  const pointOnRotationPlane = (ray: THREE.Ray, axisWorld: THREE.Vector3) => {
    const point = new THREE.Vector3()
    return ray.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(axisWorld, position), point)
  }

  const finishDrag = (event: ThreeEvent<PointerEvent>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.stopPropagation()
    dragRef.current = null
    onEditingChange(false)
    const target = event.target as EventTarget & { releasePointerCapture?: (pointerId: number) => void }
    target.releasePointerCapture?.(event.pointerId)
  }

  const ringRotations: Record<string, [number, number, number]> = {
    x: [0, Math.PI / 2, 0],
    y: [-Math.PI / 2, 0, 0],
    z: [0, 0, 0],
  }

  return (
    <group ref={groupRef} position={position} rotation={rotation} renderOrder={1000}>
      {WORLD_AXES.map((axis) => <mesh
        key={axis.id}
        rotation={ringRotations[axis.id]}
        renderOrder={1002}
        onPointerDown={(event) => {
          event.stopPropagation()
          const startQuaternion = new THREE.Quaternion().setFromEuler(rotation)
          const axisWorld = axis.direction.clone().applyQuaternion(startQuaternion).normalize()
          const point = pointOnRotationPlane(event.ray, axisWorld)
          if (!point) return
          const startVector = point.sub(position).normalize()
          if (startVector.lengthSq() < 0.5) return
          dragRef.current = { pointerId: event.pointerId, axisWorld, startVector, startQuaternion }
          onEditingChange(true)
          const target = event.target as EventTarget & { setPointerCapture?: (pointerId: number) => void }
          target.setPointerCapture?.(event.pointerId)
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current
          if (!drag || drag.pointerId !== event.pointerId) return
          event.stopPropagation()
          const point = pointOnRotationPlane(event.ray, drag.axisWorld)
          if (!point) return
          const currentVector = point.sub(position).normalize()
          onRotate(rotatedEulerFromDrag(drag.startQuaternion, drag.axisWorld, drag.startVector, currentVector))
        }}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
      >
        <torusGeometry args={[1.15, 0.13, 14, 96]} />
        <meshBasicMaterial color={axis.color} transparent opacity={0.82} depthTest={false} />
      </mesh>)}
    </group>
  )
}

interface SketchHandleProps {
  position: THREE.Vector3
  color: string
  label?: string
  size?: number
  locked?: boolean
  selected?: boolean
  transformRotation?: THREE.Euler
  radiusAxisOnly?: boolean
  onSelect?: () => void
  onMove?: (position: THREE.Vector3) => void
  onRemove?: () => void
  onEditingChange: (editing: boolean) => void
}

function SketchHandle({
  position,
  color,
  label,
  size = 0.16,
  locked = false,
  selected = false,
  transformRotation,
  radiusAxisOnly = false,
  onSelect,
  onMove,
  onRemove,
  onEditingChange,
}: SketchHandleProps) {
  const marker = (
    <group>
      <mesh
        onPointerDown={(event) => {
          event.stopPropagation()
          if (!locked) onSelect?.()
        }}
        onDoubleClick={(event) => {
          if (locked || !onRemove) return
          event.stopPropagation()
          onRemove()
        }}
      >
        {locked ? <octahedronGeometry args={[size, 1]} /> : <sphereGeometry args={[size, 18, 18]} />}
        <meshBasicMaterial color={selected ? '#ffffff' : color} transparent opacity={locked ? 0.96 : 0.9} depthWrite={false} />
      </mesh>
      {selected && <mesh>
        <sphereGeometry args={[size * 1.55, 16, 16]} />
        <meshBasicMaterial color={color} wireframe transparent opacity={0.75} depthWrite={false} />
      </mesh>}
      {label && <Html center position={[0, size + 0.28, 0]}><span className={`route-sketch-label ${locked ? 'locked' : ''}`}>{locked ? '🔒 ' : ''}{label}</span></Html>}
    </group>
  )

  return (
    <group>
      <group position={position}>{marker}</group>
      {selected && !locked && onMove && <TranslationGizmo
        position={position}
        localRotation={transformRotation}
        xAxisOnly={radiusAxisOnly}
        onMove={onMove}
        onEditingChange={onEditingChange}
      />}
    </group>
  )
}

interface SketchCircleProps {
  circle: RouteSketchCircle
  editable: boolean
  selectedKind: 'circle' | 'circle-radius' | null
  transformMode: RouteTransformMode
  onSelect: (kind: 'circle' | 'circle-radius') => void
  onChange: (circle: RouteSketchCircle) => void
  onRemove: () => void
  onEditingChange: (editing: boolean) => void
}

function SketchCircle({
  circle,
  editable,
  selectedKind,
  transformMode,
  onSelect,
  onChange,
  onRemove,
  onEditingChange,
}: SketchCircleProps) {
  const center = vector(circle.center)
  const rotation = circleEuler(circle.rotation ?? [0, 0, 0])
  const edge = circleWorldEdge(circle)
  const normal = circleWorldNormal(circle.rotation ?? [0, 0, 0])
  const normalLength = Math.max(0.35, Math.min(circle.radius * 0.62, 2.2))
  const circleSelected = selectedKind === 'circle'
  const radiusSelected = selectedKind === 'circle-radius'

  const selectCircle = (event: ThreeEvent<PointerEvent>) => {
    if (!editable) return
    event.stopPropagation()
    onSelect('circle')
  }

  const removeCircle = (event: ThreeEvent<MouseEvent>) => {
    if (!editable) return
    event.stopPropagation()
    onRemove()
  }

  return (
    <group>
      <group position={center} rotation={rotation} onPointerDown={selectCircle} onDoubleClick={removeCircle}>
        <Line
          points={circleLocalPoints(circle.radius)}
          color={circleSelected ? '#ffffff' : '#caa8ff'}
          lineWidth={circleSelected ? 2.4 : 1.35}
          dashed
          dashSize={0.25}
          gapSize={0.18}
          transparent
          opacity={0.94}
          depthWrite={false}
        />
        <Line
          points={[[0, -normalLength, 0], [0, normalLength, 0]]}
          color={circleSelected ? '#72ff8f' : '#9b7dc9'}
          lineWidth={circleSelected ? 1.8 : 0.9}
          transparent
          opacity={circleSelected ? 0.95 : 0.48}
          depthWrite={false}
        />
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[circle.radius, 64]} />
          <meshBasicMaterial color="#caa8ff" transparent opacity={circleSelected ? 0.11 : 0.035} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
        <mesh>
          <sphereGeometry args={[0.12, 18, 18]} />
          <meshBasicMaterial color={circleSelected ? '#ffffff' : '#caa8ff'} transparent opacity={0.96} depthWrite={false} />
        </mesh>
      </group>

      {circleSelected && editable && transformMode === 'translate' && <TranslationGizmo
        position={center}
        onMove={(position) => onChange({ ...circle, center: tuple(position) })}
        onEditingChange={onEditingChange}
      />}
      {circleSelected && editable && transformMode === 'rotate' && <RotationGizmo
        position={center}
        rotation={rotation}
        onRotate={(nextRotation) => onChange({ ...circle, rotation: [nextRotation.x, nextRotation.y, nextRotation.z] })}
        onEditingChange={onEditingChange}
      />}

      <Html center position={center.clone().addScaledVector(normal, circle.radius + 0.3)}>
        <span className="route-sketch-label radius">{circle.label} · r {circle.radius.toFixed(2)} · X {(THREE.MathUtils.radToDeg(circle.rotation?.[0] ?? 0)).toFixed(0)}° · Y {(THREE.MathUtils.radToDeg(circle.rotation?.[1] ?? 0)).toFixed(0)}° · Z {(THREE.MathUtils.radToDeg(circle.rotation?.[2] ?? 0)).toFixed(0)}°</span>
      </Html>
      {editable && <SketchHandle
        position={edge}
        transformRotation={rotation}
        radiusAxisOnly
        color="#f0d5ff"
        size={0.13}
        selected={radiusSelected}
        onSelect={() => onSelect('circle-radius')}
        onEditingChange={onEditingChange}
        onMove={(position) => onChange({ ...circle, radius: Math.max(0.05, position.distanceTo(center)) })}
        onRemove={onRemove}
      />}
    </group>
  )
}

function routeSections(nodes: RouteSketchNode[]) {
  const sections: RouteSketchNode[][] = []
  let current: RouteSketchNode[] = []
  nodes.forEach((node) => {
    current.push(node)
    if (node.locked && current.length > 1) {
      sections.push(current)
      current = [node]
    }
  })
  return sections
}

function sectionPoints(nodes: RouteSketchNode[]) {
  const points = nodes.map((node) => vector(node.position))
  if (points.length < 3) return points
  return new THREE.CatmullRomCurve3(points, false, 'centripetal').getPoints(Math.max(32, points.length * 28))
}

function circlePoints(circle: RouteSketchCircle) {
  return circleWorldPoints(circle)
}

export function RoutePlanPreview({
  earth,
  sun,
  waypoint,
  target,
  waypointId,
  waypointName,
  waypointColor,
  waypointRadius,
  encounterDay,
  encounterDate,
  confirmed,
  sketch,
  drawTool,
  transformMode,
  selection,
  editable,
  onSketchChange,
  onSelectionChange,
  onEditingChange,
  requestedPlan,
}: RoutePlanPreviewProps) {
  const opacity = confirmed ? 0.62 : 0.94
  const [pendingStart, setPendingStart] = useState<THREE.Vector3 | null>(null)
  const [cursorPoint, setCursorPoint] = useState<THREE.Vector3 | null>(null)
  const [encounterHovered, setEncounterHovered] = useState(false)
  const waypointTexture = useTexture(`/assets/planets/${waypointId}.jpg`)
  const sections = useMemo(() => routeSections(sketch.nodes), [sketch.nodes])
  const sectionColors = ['#ffad5c', '#ffe66d', '#72ff8f']

  useEffect(() => {
    waypointTexture.colorSpace = THREE.SRGBColorSpace
    waypointTexture.anisotropy = 8
    waypointTexture.needsUpdate = true
  }, [waypointTexture])

  useEffect(() => {
    setPendingStart(null)
    setCursorPoint(null)
  }, [drawTool])

  const insertRoutePoint = (position: THREE.Vector3) => {
    let insertionIndex = 1
    let closestDistance = Number.POSITIVE_INFINITY
    sketch.nodes.slice(0, -1).forEach((node, index) => {
      const segment = new THREE.Line3(vector(node.position), vector(sketch.nodes[index + 1].position))
      const closest = segment.closestPointToPoint(position, true, new THREE.Vector3())
      const distance = closest.distanceToSquared(position)
      if (distance < closestDistance) {
        closestDistance = distance
        insertionIndex = index + 1
      }
    })
    const node: RouteSketchNode = {
      id: sketchId('route-point'),
      label: `Stützpunkt ${sketch.nodes.filter((candidate) => !candidate.locked).length + 1}`,
      position: tuple(position),
      locked: false,
      anchor: 'control',
    }
    onSketchChange({ ...sketch, nodes: [...sketch.nodes.slice(0, insertionIndex), node, ...sketch.nodes.slice(insertionIndex)] }, true)
    onSelectionChange({ kind: 'node', id: node.id })
  }

  const handlePlanePointerDown = (event: ThreeEvent<PointerEvent>) => {
    if (!editable) return
    if (drawTool === 'move') {
      onSelectionChange(null)
      return
    }
    event.stopPropagation()
    const position = pointOnPlane(event, 0)
    if (!position) return
    if (drawTool === 'route-point') {
      insertRoutePoint(position)
      return
    }
    if (!pendingStart) {
      setPendingStart(position.clone())
      return
    }
    if (drawTool === 'line') {
      const id = sketchId('guide-line')
      onSketchChange({
        ...sketch,
        lines: [...sketch.lines, { id, start: tuple(pendingStart), end: tuple(position) }],
      }, true)
      onSelectionChange({ kind: 'line-end', id })
    } else if (drawTool === 'radius') {
      const id = sketchId('guide-radius')
      onSketchChange({
        ...sketch,
        circles: [...sketch.circles, {
          id,
          center: tuple(pendingStart),
          radius: Math.max(0.08, pendingStart.distanceTo(position)),
          rotation: [0, 0, 0],
          label: `Radius ${sketch.circles.length + 1}`,
        }],
      }, true)
      onSelectionChange({ kind: 'circle', id })
    }
    setPendingStart(null)
  }

  const updateNode = (id: string, position: THREE.Vector3) => {
    onSketchChange({ ...sketch, nodes: sketch.nodes.map((node) => node.id === id ? { ...node, position: tuple(position) } : node) })
  }

  const encounterDisplayRadius = Math.max(waypointRadius, 0.24)

  return (
    <group>
      {editable && (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          onPointerDown={handlePlanePointerDown}
          onPointerMove={(event) => {
            if (!pendingStart) return
            const next = pointOnPlane(event, 0)
            if (next) setCursorPoint(next)
          }}
        >
          <planeGeometry args={[320, 320]} />
          <meshBasicMaterial transparent opacity={0} colorWrite={false} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      )}

      {sections.map((nodes, index) => (
        <Line
          key={`${nodes[0]?.id}-${nodes.at(-1)?.id}`}
          points={sectionPoints(nodes)}
          color={sectionColors[index] ?? '#72ff8f'}
          lineWidth={2.4}
          dashed={confirmed}
          dashSize={0.55}
          gapSize={0.28}
          transparent
          opacity={opacity}
          depthWrite={false}
        />
      ))}

      {sketch.lines.map((guide) => {
        const lineSelected = selection?.id === guide.id && (selection.kind === 'line-start' || selection.kind === 'line-end')
        return <group key={guide.id}>
          <Line points={[vector(guide.start), vector(guide.end)]} color={lineSelected ? '#ffffff' : '#8be8ff'} lineWidth={lineSelected ? 2.2 : 1.35} dashed dashSize={0.35} gapSize={0.22} transparent opacity={0.9} depthWrite={false} />
          {editable && <>
            <SketchHandle position={vector(guide.start)} color="#8be8ff" size={0.11} selected={selection?.kind === 'line-start' && selection.id === guide.id} onSelect={() => onSelectionChange({ kind: 'line-start', id: guide.id })} onEditingChange={onEditingChange} onMove={(position) => onSketchChange(updateSketchLineEndpoint(sketch, guide.id, 'start', tuple(position)))} />
            <SketchHandle position={vector(guide.end)} color="#8be8ff" size={0.11} selected={selection?.kind === 'line-end' && selection.id === guide.id} onSelect={() => onSelectionChange({ kind: 'line-end', id: guide.id })} onEditingChange={onEditingChange} onMove={(position) => onSketchChange(updateSketchLineEndpoint(sketch, guide.id, 'end', tuple(position)))} onRemove={() => onSketchChange({ ...sketch, lines: sketch.lines.filter((line) => line.id !== guide.id) }, true)} />
          </>}
        </group>
      })}

      {sketch.circles.map((circle) => <SketchCircle
        key={circle.id}
        circle={circle}
        editable={editable}
        selectedKind={selection?.id === circle.id && (selection.kind === 'circle' || selection.kind === 'circle-radius') ? selection.kind : null}
        transformMode={transformMode}
        onSelect={(kind) => onSelectionChange({ kind, id: circle.id })}
        onChange={(nextCircle) => onSketchChange({ ...sketch, circles: sketch.circles.map((candidate) => candidate.id === circle.id ? nextCircle : candidate) })}
        onRemove={() => { onSketchChange({ ...sketch, circles: sketch.circles.filter((candidate) => candidate.id !== circle.id) }, true); onSelectionChange(null) }}
        onEditingChange={onEditingChange}
      />)}

      {pendingStart && cursorPoint && drawTool === 'line' && <Line points={[pendingStart, cursorPoint]} color="#8be8ff" lineWidth={1.2} dashed dashSize={0.25} gapSize={0.18} transparent opacity={0.8} />}
      {pendingStart && cursorPoint && drawTool === 'radius' && <Line points={circlePoints({ id: 'pending', center: tuple(pendingStart), radius: pendingStart.distanceTo(cursorPoint), rotation: [0, 0, 0], label: '' })} color="#caa8ff" lineWidth={1.1} transparent opacity={0.7} />}

      {editable && sketch.nodes.map((node) => (
        <SketchHandle
          key={node.id}
          position={vector(node.position)}
          color={node.locked ? '#ffe66d' : '#ffffff'}
          label={node.label}
          locked={node.locked}
          selected={selection?.kind === 'node' && selection.id === node.id}
          size={node.anchor === 'target' ? 0.2 : node.locked ? 0.15 : 0.18}
          onSelect={node.locked ? undefined : () => onSelectionChange({ kind: 'node', id: node.id })}
          onEditingChange={onEditingChange}
          onMove={node.locked ? undefined : (position) => updateNode(node.id, position)}
          onRemove={node.locked ? undefined : () => { onSketchChange({ ...sketch, nodes: sketch.nodes.filter((candidate) => candidate.id !== node.id) }, true); onSelectionChange(null) }}
        />
      ))}

      <group position={waypoint} onPointerEnter={() => setEncounterHovered(true)} onPointerLeave={() => setEncounterHovered(false)}>
        <mesh>
          <sphereGeometry args={[encounterDisplayRadius, 48, 48]} />
          <meshStandardMaterial map={waypointTexture} color="#ffffff" emissive={waypointColor} emissiveIntensity={0.08} roughness={0.9} />
        </mesh>
        <mesh>
          <sphereGeometry args={[encounterDisplayRadius * 1.08, 28, 28]} />
          <meshBasicMaterial color="#79e4ff" wireframe transparent opacity={0.35} depthWrite={false} />
        </mesh>
        {encounterHovered && <Html center position={[encounterDisplayRadius + 0.55, encounterDisplayRadius + 0.28, 0]}>
          <span className="encounter-anchor-tooltip">{waypointName} · {encounterDate} · Tag {encounterDay.toFixed(1)}</span>
        </Html>}
      </group>

      <Line points={[earth, target]} color="#79e4ff" lineWidth={1.05} dashed dashSize={0.28} gapSize={0.5} transparent opacity={0.42} depthWrite={false} />
      {requestedPlan && <>
        <Line points={[requestedPlan.earth, sun, requestedPlan.waypoint]} color="#ff667a" lineWidth={1.2} dashed dashSize={0.24} gapSize={0.5} transparent opacity={0.78} depthWrite={false} />
        <mesh position={requestedPlan.waypoint}>
          <sphereGeometry args={[0.18, 14, 14]} />
          <meshBasicMaterial color="#ff667a" transparent opacity={0.9} />
        </mesh>
        <Html center position={requestedPlan.waypoint.clone().add(new THREE.Vector3(0, 0.8, 0))}>
          <span className="dispersion-label">Ausgangsschätzung {requestedPlan.encounterDate} · Tag {requestedPlan.encounterDay.toFixed(1)}</span>
        </Html>
      </>}
      <Html center position={earth.clone().lerp(sun, 0.5)}><span className="dispersion-label">Erde → Sonne</span></Html>
      <Html center position={sun.clone().lerp(waypoint, 0.55)}><span className="dispersion-label">Sonne → {waypointName} · gebunden an {encounterDate}</span></Html>
      <Html center position={earth.clone().lerp(target, 0.2)}><span className="dispersion-label">Referenz Erde → Ziel</span></Html>
      {editable && drawTool !== 'move' && <Html center position={[0, 2.1, 0]}><span className="route-sketch-mode">Werkzeug: {drawTool === 'route-point' ? 'Stützpunkt setzen' : drawTool === 'line' ? pendingStart ? 'Linien-Endpunkt setzen' : 'Linien-Startpunkt setzen' : pendingStart ? 'Radius festlegen' : 'Kreismittelpunkt setzen'}</span></Html>}
    </group>
  )
}

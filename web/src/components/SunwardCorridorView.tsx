import { useMemo, useRef, type KeyboardEvent, type PointerEvent } from 'react'

import { corridorDirection, type EntryCorridorDefinition } from '../entryCorridorGeometry'
import {
  directionFromTargetPlane,
  projectToTargetPlane,
  targetAlignedBasis,
  type TargetPlanePoint,
  type Vector3Tuple,
} from '../targetAlignedProjection'

interface SunwardCorridorViewProps {
  targetName: string
  targetColor: string
  definition: EntryCorridorDefinition
  sunToTargetDirection: Vector3Tuple
  actualEntryDirection?: Vector3Tuple | null
  corridorRadiusRatio: number
  safetyRadiusRatio: number
  blocked: boolean
  sectionNumber: number
  onCenterDirectionChange: (direction: Vector3Tuple) => void
}

const WIDTH = 1000
const HEIGHT = 620
const CENTER_X = 500
const CENTER_Y = 310
const BODY_RADIUS = 160
const VIEW_RADIUS = 225

function screenPoint(point: TargetPlanePoint, radius: number) {
  return {
    x: CENTER_X + point.right * radius,
    y: CENTER_Y - point.up * radius,
  }
}

function corridorBoundary(definition: EntryCorridorDefinition) {
  const points: Vector3Tuple[] = []
  const steps = 14
  const horizontal = definition.horizontalHalfAngleDeg
  const vertical = definition.verticalHalfAngleDeg
  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps
    points.push(corridorDirection(definition, -horizontal + 2 * horizontal * t, -vertical).toArray() as Vector3Tuple)
  }
  for (let index = 1; index <= steps; index += 1) {
    const t = index / steps
    points.push(corridorDirection(definition, horizontal, -vertical + 2 * vertical * t).toArray() as Vector3Tuple)
  }
  for (let index = 1; index <= steps; index += 1) {
    const t = index / steps
    points.push(corridorDirection(definition, horizontal - 2 * horizontal * t, vertical).toArray() as Vector3Tuple)
  }
  for (let index = 1; index < steps; index += 1) {
    const t = index / steps
    points.push(corridorDirection(definition, -horizontal, vertical - 2 * vertical * t).toArray() as Vector3Tuple)
  }
  return points
}

export function SunwardCorridorView({
  targetName,
  targetColor,
  definition,
  sunToTargetDirection,
  actualEntryDirection,
  corridorRadiusRatio,
  safetyRadiusRatio,
  blocked,
  sectionNumber,
  onCenterDirectionChange,
}: SunwardCorridorViewProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const dragging = useRef(false)
  const basis = useMemo(
    () => targetAlignedBasis(sunToTargetDirection),
    [sunToTargetDirection[0], sunToTargetDirection[1], sunToTargetDirection[2]],
  )
  const projection = projectToTargetPlane(definition.centerDirection, basis)
  const corridorRadius = BODY_RADIUS * corridorRadiusRatio
  const displayScale = VIEW_RADIUS / Math.max(corridorRadius, BODY_RADIUS * safetyRadiusRatio, BODY_RADIUS)
  const displayCorridorRadius = corridorRadius * displayScale
  const displayBodyRadius = BODY_RADIUS * displayScale
  const displaySafetyRadius = BODY_RADIUS * safetyRadiusRatio * displayScale
  const center = screenPoint(projection, displayCorridorRadius)
  const actualProjection = actualEntryDirection
    ? projectToTargetPlane(actualEntryDirection, basis)
    : null
  const actualPoint = actualProjection
    ? screenPoint(actualProjection, displayCorridorRadius)
    : null
  const boundaryPath = useMemo(
    () => corridorBoundary(definition)
      .map((direction) => screenPoint(projectToTargetPlane(direction, basis), displayCorridorRadius))
      .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
      .join(' ') + ' Z',
    [
      basis,
      definition.centerDirection,
      definition.horizontalHalfAngleDeg,
      definition.rotationDeg,
      definition.verticalHalfAngleDeg,
      displayCorridorRadius,
    ],
  )
  const gradientId = `sunward-target-fill-${sectionNumber}`

  const setCenterFromPlane = (right: number, up: number) => {
    onCenterDirectionChange(directionFromTargetPlane(right, up, projection.depth, basis))
  }
  const updateCenterFromPointer = (event: PointerEvent<SVGElement>) => {
    const matrix = svgRef.current?.getScreenCTM()
    if (!matrix) return
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse())
    setCenterFromPlane(
      (point.x - CENTER_X) / displayCorridorRadius,
      -(point.y - CENTER_Y) / displayCorridorRadius,
    )
  }
  const moveCenterWithKeyboard = (event: KeyboardEvent<SVGCircleElement>) => {
    const step = event.shiftKey ? 0.04 : 0.015
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
    event.preventDefault()
    setCenterFromPlane(
      projection.right + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0),
      projection.up + (event.key === 'ArrowUp' ? step : event.key === 'ArrowDown' ? -step : 0),
    )
  }

  return (
    <svg
      ref={svgRef}
      className="planet-corridor-canvas sunward-corridor-view"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="xMidYMid meet"
      role="group"
      aria-label={`Blick von der Sonne auf den Zielkorridor von ${targetName}`}
      onPointerMove={(event) => {
        if (dragging.current) updateCenterFromPointer(event)
      }}
      onPointerUp={() => { dragging.current = false }}
      onPointerCancel={() => { dragging.current = false }}
    >
      <defs>
        <radialGradient id={gradientId} cx="38%" cy="32%">
          <stop offset="0%" stopColor={targetColor} />
          <stop offset="100%" stopColor="#111b2c" />
        </radialGradient>
      </defs>
      <rect width={WIDTH} height={HEIGHT} className="corridor-space" />
      <g className="corridor-coordinate-system" aria-hidden="true">
        <line x1="72" y1={CENTER_Y} x2={WIDTH - 72} y2={CENTER_Y} className="coordinate-axis reference-plane" />
        <line x1={CENTER_X} y1={HEIGHT - 44} x2={CENTER_X} y2="44" className="coordinate-axis" />
        <text x={WIDTH - 82} y={CENTER_Y - 13} textAnchor="end" className="coordinate-axis-label">+quer zur Sonne→Ziel-Achse</text>
        <text x={CENTER_X + 14} y="61" className="coordinate-axis-label">+hoch zur Sonne→Ziel-Achse</text>
      </g>
      <text x="28" y="34" className="sunward-view-title">Von der Sonne in Richtung {targetName}</text>
      <text x="28" y="56" className="corridor-safety-label">Blickachse = vollständiger räumlicher Sonne→Ziel-Vektor</text>
      <circle cx={CENTER_X} cy={CENTER_Y} r={displaySafetyRadius} className={`corridor-safety-envelope ${blocked ? 'blocked' : 'clear'}`} />
      <circle cx={CENTER_X} cy={CENTER_Y} r={displayCorridorRadius} className="sunward-corridor-sphere" />
      <circle cx={CENTER_X} cy={CENTER_Y} r={displayBodyRadius} fill={`url(#${gradientId})`} className="corridor-planet" />
      <text x={CENTER_X} y={CENTER_Y + 8} textAnchor="middle" className="corridor-planet-name">{targetName}</text>
      <g className="sunward-line-of-sight" aria-hidden="true">
        <circle cx={CENTER_X} cy={CENTER_Y} r="11" />
        <circle cx={CENTER_X} cy={CENTER_Y} r="3" />
      </g>
      <path d={boundaryPath} className={`sunward-corridor-patch${definition.enabled ? '' : ' disabled'}${blocked ? ' blocked' : ''}`} />
      <line x1={CENTER_X} y1={CENTER_Y} x2={center.x} y2={center.y} className="sunward-entry-radius" />
      <circle
        cx={center.x}
        cy={center.y}
        r="10"
        className="corridor-drag-handle sunward"
        role="button"
        tabIndex={0}
        aria-label="Zielkorridor in der Ansicht von der Sonne verschieben"
        onKeyDown={moveCenterWithKeyboard}
        onPointerDown={(event) => {
          event.stopPropagation()
          dragging.current = true
          event.currentTarget.setPointerCapture(event.pointerId)
          updateCenterFromPointer(event)
        }}
      />
      <text x={center.x + 14} y={center.y - 15} className="target-corridor-title">Zielkorridor</text>
      {actualPoint && actualProjection && (
        <g className={definition.enabled && !blocked ? 'sunward-actual-entry' : 'sunward-actual-entry warning'}>
          <line x1={CENTER_X} y1={CENTER_Y} x2={actualPoint.x} y2={actualPoint.y} />
          <circle cx={actualPoint.x} cy={actualPoint.y} r="7" />
          <text x={actualPoint.x + 13} y={actualPoint.y + 22}>berechneter Eintritt</text>
        </g>
      )}
      <g className="sunward-depth-state" transform="translate(742 472)">
        <rect width="232" height="116" rx="12" />
        <text x="14" y="24" className="corridor-legend-title">Räumliche Lage</text>
        <text x="14" y="49">quer {projection.right >= 0 ? '+' : ''}{projection.right.toFixed(3)}</text>
        <text x="14" y="70">hoch {projection.up >= 0 ? '+' : ''}{projection.up.toFixed(3)}</text>
        <text x="14" y="91">Tiefe {projection.depth >= 0 ? '+' : ''}{projection.depth.toFixed(3)}</text>
        <text x="14" y="108">{projection.depth < 0 ? 'sonnenzugewandte Seite' : 'sonnenabgewandte Seite'}</text>
      </g>
    </svg>
  )
}

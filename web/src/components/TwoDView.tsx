import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type PointerEvent,
  type SetStateAction,
} from 'react'
import * as THREE from 'three'

import { activityRequestHeaders, logActivity } from '../activityLog'
import type { EntryCorridorDefinition } from '../entryCorridorGeometry'
import { ROUTE_INTERSTELLAR_SYSTEMS } from '../interstellarTargets'
import { DEFAULT_MISSION_CONFIG } from '../missionSimulation'
import { createOrbitPoints, planetPositionAt, toScenePosition } from '../orbitalMath'
import {
  MAX_PARTIAL_ORBIT_ANGLE_DEG,
  type RouteBoundaryBehavior,
  type RouteSectionDefinition,
} from '../routeSections'
import type { MissionConfig, MoonCatalogue, SolarSystemData } from '../types'
import type { WaypointRouteResult } from './PlannedWaypointRoute'
import { PlanetCorridorPlanner } from './PlanetCorridorPlanner'
import { RouteSectionList } from './RouteSectionList'
import { TwoDPlanetDetails } from './TwoDPlanetDetails'

type Projection = 'corridor' | 'side' | 'top'
type OrbitalProjection = Exclude<Projection, 'corridor'>

interface TwoDViewProps {
  routeSections: RouteSectionDefinition[]
  onRouteSectionsChange: Dispatch<SetStateAction<RouteSectionDefinition[]>>
  activeRouteSectionId: string
  onActiveRouteSectionChange: (sectionId: string) => void
  plannedMissionDate: string | null
  onPlannedMissionDateChange: Dispatch<SetStateAction<string | null>>
  plannedRoute: WaypointRouteResult | null
  onPlannedRouteChange: Dispatch<SetStateAction<WaypointRouteResult | null>>
  missionConfig: MissionConfig | null
}

const EXTENT = 30
const SIDE_HALF_HEIGHT = EXTENT * 7 / 16
const SIDE_LABEL_Y = [-6.6, 6.5, -4.7, 4.6, -2.8, 2.7, -7.9, 7.8]
const INTERSTELLAR_PLOT_DISTANCE = EXTENT * 0.96

function project(position: THREE.Vector3, projection: OrbitalProjection): [number, number] {
  const [x, y, z] = [position.x, position.y, position.z]
  return [x, projection === 'top' ? -z : -y]
}

function pathFromPoints(points: THREE.Vector3[], projection: OrbitalProjection = 'top') {
  return points.map((point, index) => {
    const [x, y] = project(point, projection)
    return `${index === 0 ? 'M' : 'L'} ${x.toFixed(3)} ${y.toFixed(3)}`
  }).join(' ')
}

function linePath(start: PreviewPoint, end: PreviewPoint) {
  return `M ${start.x.toFixed(3)} ${start.y.toFixed(3)} L ${end.x.toFixed(3)} ${end.y.toFixed(3)}`
}

function routePassageRadius(targetId: string) {
  if (targetId === 'sun') return 0.95
  if (targetId === 'jupiter' || targetId === 'saturn') return 0.48
  return 0.34
}

function routeTurnCapacityDeg(targetId: string) {
  if (targetId === 'sun') return 150
  if (targetId === 'jupiter') return 82
  if (targetId === 'saturn') return 58
  if (targetId === 'venus' || targetId === 'earth') return 38
  if (targetId === 'mars') return 28
  return 18
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function positiveAngleDeg(angleDeg: number) {
  return ((angleDeg % 360) + 360) % 360
}

function signedPreviewAngleDeg(from: PreviewPoint, to: PreviewPoint) {
  return vectorAngle(from, to) * 180 / Math.PI
}

function angleBetweenVectors(a: PreviewPoint, b: PreviewPoint) {
  const length = Math.hypot(a.x, a.y) * Math.hypot(b.x, b.y)
  if (length <= 0.000001) return 180
  const cosine = Math.max(-1, Math.min(1, (a.x * b.x + a.y * b.y) / length))
  return Math.acos(cosine) * 180 / Math.PI
}

function routeVector(from: PreviewPoint, to: PreviewPoint): PreviewPoint {
  return { x: to.x - from.x, y: to.y - from.y }
}

function dateFromTimestamp(timestampMs: number) {
  return new Date(timestampMs).toISOString().slice(0, 10)
}

function routeVerticalBias(section: RouteSectionDefinition) {
  const [, , corridorZ] = section.corridor.centerDirection
  return corridorZ
}

function routeSectionUsesVerticalCorridor(section: RouteSectionDefinition) {
  return (
    section.corridor.enabled
    && (section.corridor.mainProjection ?? 'side') === 'side'
    && Math.abs(routeVerticalBias(section)) > 0.18
  )
}

function vectorAngle(from: PreviewPoint, to: PreviewPoint) {
  return Math.atan2(to.y - from.y, to.x - from.x)
}

function polarPoint(center: PreviewPoint, radius: number, angle: number): PreviewPoint {
  return {
    x: center.x + Math.cos(angle) * radius,
    y: center.y + Math.sin(angle) * radius,
  }
}

function shortestAngleDelta(from: number, to: number) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from))
}

function routePassagePath(
  section: RouteSectionDefinition,
  origin: PreviewPoint,
  target: PreviewPoint,
  nextTarget: PreviewPoint | null,
  projection: OrbitalProjection,
  approachCovered: boolean,
) {
  if (isInterstellarRouteObject(section.targetId)) return approachCovered ? '' : linePath(origin, target)
  if (projection === 'top' && routeSectionUsesVerticalCorridor(section)) {
    if (approachCovered) return nextTarget ? linePath(target, nextTarget) : ''
    return nextTarget
      ? `M ${origin.x.toFixed(3)} ${origin.y.toFixed(3)} L ${target.x.toFixed(3)} ${target.y.toFixed(3)} L ${nextTarget.x.toFixed(3)} ${nextTarget.y.toFixed(3)}`
      : linePath(origin, target)
  }
  if (projection === 'side' && routeSectionUsesVerticalCorridor(section)) {
    const sign = routeVerticalBias(section) >= 0 ? -1 : 1
    const departure = nextTarget ?? {
      x: target.x + (target.x - origin.x) / (Math.hypot(target.x - origin.x, target.y - origin.y) || 1) * 1.8,
      y: target.y + (target.y - origin.y) / (Math.hypot(target.x - origin.x, target.y - origin.y) || 1) * 1.8,
    }
    const radius = routePassageRadius(section.targetId)
    const travelsRight = departure.x > origin.x
    const entryOffset = travelsRight ? -radius : radius
    const exitOffset = -entryOffset
    const entry = {
      x: target.x + entryOffset,
      y: target.y,
    }
    const exit = {
      x: target.x + exitOffset,
      y: target.y,
    }
    const sweep = sign < 0
      ? (travelsRight ? 1 : 0)
      : (travelsRight ? 0 : 1)
    const start = approachCovered
      ? `M ${entry.x.toFixed(3)} ${entry.y.toFixed(3)}`
      : `M ${origin.x.toFixed(3)} ${origin.y.toFixed(3)} L ${entry.x.toFixed(3)} ${entry.y.toFixed(3)}`
    return `${start} A ${radius.toFixed(3)} ${radius.toFixed(3)} 0 0 ${sweep} ${exit.x.toFixed(3)} ${exit.y.toFixed(3)} L ${departure.x.toFixed(3)} ${departure.y.toFixed(3)}`
  }
  if (projection === 'side') {
    if (approachCovered) return nextTarget ? linePath(target, nextTarget) : ''
    return nextTarget
      ? `M ${origin.x.toFixed(3)} ${origin.y.toFixed(3)} L ${target.x.toFixed(3)} ${target.y.toFixed(3)} L ${nextTarget.x.toFixed(3)} ${nextTarget.y.toFixed(3)}`
      : linePath(origin, target)
  }
  const passage = section.passage
  const linkedExit = Boolean(nextTarget)
  if (passage.mode === 'direct') {
    if (approachCovered) return nextTarget ? linePath(target, nextTarget) : ''
    return nextTarget
      ? `M ${origin.x.toFixed(3)} ${origin.y.toFixed(3)} L ${target.x.toFixed(3)} ${target.y.toFixed(3)} L ${nextTarget.x.toFixed(3)} ${nextTarget.y.toFixed(3)}`
      : linePath(origin, target)
  }

  const radius = routePassageRadius(section.targetId)
  const directionSign = passage.orbitDirection === 'prograde' ? 1 : -1
  const inboundAngle = vectorAngle(origin, target)
  const entryAngle = inboundAngle - directionSign * Math.PI / 2
  const outboundAngle = nextTarget ? vectorAngle(target, nextTarget) : inboundAngle
  const tangentExitAngle = outboundAngle - directionSign * Math.PI / 2
  const requestedAngle = passage.mode === 'full-orbit'
    ? Math.PI * 2
    : passage.mode === 'partial-orbit'
      ? clamp(passage.orbitAngleDeg, 1, MAX_PARTIAL_ORBIT_ANGLE_DEG) * Math.PI / 180
      : Math.PI / 2
  const exitAngle = entryAngle + directionSign * requestedAngle
  const entry = polarPoint(target, radius, entryAngle)
  const exit = polarPoint(target, radius, exitAngle)
  const arcSpan = Math.abs(requestedAngle)
  const largeArc = arcSpan > Math.PI ? 1 : 0
  const sweep = directionSign > 0 ? 1 : 0
  const tangentMismatchDeg = Math.abs(shortestAngleDelta(exitAngle, tangentExitAngle)) * 180 / Math.PI
  const exitEnd = nextTarget ?? target
  const approachPath = approachCovered
    ? `M ${target.x.toFixed(3)} ${target.y.toFixed(3)} L ${entry.x.toFixed(3)} ${entry.y.toFixed(3)}`
    : `M ${origin.x.toFixed(3)} ${origin.y.toFixed(3)} L ${entry.x.toFixed(3)} ${entry.y.toFixed(3)}`

  if (passage.mode === 'full-orbit') {
    const mid = polarPoint(target, radius, entryAngle + directionSign * Math.PI)
    return [
      approachPath,
      `A ${radius.toFixed(3)} ${radius.toFixed(3)} 0 1 ${sweep} ${mid.x.toFixed(3)} ${mid.y.toFixed(3)}`,
      `A ${radius.toFixed(3)} ${radius.toFixed(3)} 0 1 ${sweep} ${entry.x.toFixed(3)} ${entry.y.toFixed(3)}`,
      linkedExit && tangentMismatchDeg < 4 ? `L ${exitEnd.x.toFixed(3)} ${exitEnd.y.toFixed(3)}` : '',
    ].filter(Boolean).join(' ')
  }

  if (passage.mode === 'partial-orbit' && requestedAngle >= Math.PI * 2) {
    return [
      approachPath,
      sampledArcPath(target, radius, entryAngle, exitAngle),
      linkedExit ? `L ${exitEnd.x.toFixed(3)} ${exitEnd.y.toFixed(3)}` : '',
    ].filter(Boolean).join(' ')
  }

  return [
    approachPath,
    `A ${radius.toFixed(3)} ${radius.toFixed(3)} 0 ${largeArc} ${sweep} ${exit.x.toFixed(3)} ${exit.y.toFixed(3)}`,
    linkedExit ? `L ${exitEnd.x.toFixed(3)} ${exitEnd.y.toFixed(3)}` : '',
  ].filter(Boolean).join(' ')
}

function routeScenePosition(positionKm: [number, number, number]) {
  return toScenePosition(
    new THREE.Vector3(
      positionKm[0] / 149_597_870.7,
      positionKm[2] / 149_597_870.7,
      positionKm[1] / 149_597_870.7,
    ),
  )
}

function routePlotPoint(
  objectId: string,
  projection: OrbitalProjection,
  orbitGeometry: Array<{ planet: SolarSystemData['planets'][number]; position: THREE.Vector3 }>,
  moonCatalogue: MoonCatalogue | null,
): PreviewPoint | null {
  if (objectId === 'sun') return { x: 0, y: 0 }
  const planetPosition = orbitGeometry.find(({ planet }) => planet.id === objectId)?.position
  if (planetPosition) {
    const [x, y] = project(planetPosition, projection)
    return { x, y }
  }
  const moon = moonCatalogue?.moons.find((item) => item.id === objectId)
  if (moon) {
    const parentPosition = orbitGeometry.find(({ planet }) => planet.id === moon.parentId)?.position
    if (parentPosition) {
      const [x, y] = project(parentPosition, projection)
      return { x, y }
    }
  }
  if (isInterstellarRouteObject(objectId)) {
    const direction = interstellarPreviewDirection(objectId, projection)
    if (direction) return scaleVector(direction, INTERSTELLAR_PLOT_DISTANCE)
  }
  return null
}

function plotRayEndpoint(origin: PreviewPoint, direction: PreviewPoint, projection: OrbitalProjection) {
  const horizontalLimit = EXTENT - 1.25
  const verticalLimit = (projection === 'top' ? EXTENT : SIDE_HALF_HEIGHT) - 1.25
  const intersections = [
    direction.x > 0.0001 ? (horizontalLimit - origin.x) / direction.x : Number.POSITIVE_INFINITY,
    direction.x < -0.0001 ? (-horizontalLimit - origin.x) / direction.x : Number.POSITIVE_INFINITY,
    direction.y > 0.0001 ? (verticalLimit - origin.y) / direction.y : Number.POSITIVE_INFINITY,
    direction.y < -0.0001 ? (-verticalLimit - origin.y) / direction.y : Number.POSITIVE_INFINITY,
  ].filter((distance) => distance > 0)
  const distance = Math.min(...intersections)
  return addPoint(origin, scaleVector(direction, Number.isFinite(distance) ? distance : 0))
}

export function TwoDView({
  routeSections,
  onRouteSectionsChange,
  activeRouteSectionId,
  onActiveRouteSectionChange,
  plannedMissionDate,
  onPlannedMissionDateChange,
  plannedRoute,
  onPlannedRouteChange,
  missionConfig,
}: TwoDViewProps) {
  const [data, setData] = useState<SolarSystemData | null>(null)
  const [moonCatalogue, setMoonCatalogue] = useState<MoonCatalogue | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [projection, setProjection] = useState<Projection>('corridor')
  const [selectedPlanetId, setSelectedPlanetId] = useState('earth')
  const [previewSectionId, setPreviewSectionId] = useState<string | null>(null)
  const [orbitZoom, setOrbitZoom] = useState(1)
  const [constellationSearchStatus, setConstellationSearchStatus] = useState('')
  const [constellationSearchRunning, setConstellationSearchRunning] = useState(false)
  const orbitPlotRef = useRef<HTMLDivElement>(null)
  const previousOrbitZoomRef = useRef(orbitZoom)
  const previousProjectionRef = useRef(projection)
  const orbitPanRef = useRef({
    active: false,
    moved: false,
    pointerId: -1,
    startX: 0,
    startY: 0,
    scrollLeft: 0,
    scrollTop: 0,
  })
  const todayTimestampMs = useMemo(() => Date.now(), [])

  useEffect(() => {
    const plot = orbitPlotRef.current
    const previousZoom = previousOrbitZoomRef.current
    const projectionChanged = previousProjectionRef.current !== projection
    previousOrbitZoomRef.current = orbitZoom
    previousProjectionRef.current = projection
    if (!plot) return

    if (projectionChanged) {
      plot.scrollLeft = (plot.scrollWidth - plot.clientWidth) / 2
      plot.scrollTop = (plot.scrollHeight - plot.clientHeight) / 2
      return
    }

    const centerX = (plot.scrollLeft + plot.clientWidth / 2) / previousZoom
    const centerY = (plot.scrollTop + plot.clientHeight / 2) / previousZoom
    plot.scrollLeft = centerX * orbitZoom - plot.clientWidth / 2
    plot.scrollTop = centerY * orbitZoom - plot.clientHeight / 2
  }, [orbitZoom, projection])

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      fetch('/api/solar-system', { signal: controller.signal }),
      fetch('/moons.json', { signal: controller.signal }),
    ])
      .then(async ([solarResponse, moonResponse]) => {
        if (!solarResponse.ok || !moonResponse.ok) {
          throw new Error(`Solardaten konnten nicht geladen werden (${solarResponse.status}/${moonResponse.status}).`)
        }
        return Promise.all([
          solarResponse.json() as Promise<SolarSystemData>,
          moonResponse.json() as Promise<MoonCatalogue>,
        ])
      })
      .then(([solarData, moons]) => {
        setData(solarData)
        setMoonCatalogue(moons)
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Solardaten konnten nicht geladen werden.')
      })
    return () => controller.abort()
  }, [])

  const activeDate = plannedMissionDate ?? new Date(todayTimestampMs).toISOString().slice(0, 10)
  const timestampMs = useMemo(
    () => new Date(`${activeDate}T00:00:00Z`).getTime(),
    [activeDate],
  )
  const epochLabel = `${plannedMissionDate ? 'Missionsstart' : 'Heute'} · ${new Date(timestampMs).toLocaleDateString('de-DE', { timeZone: 'UTC' })}`
  const orbitGeometry = useMemo(
    () => data?.planets.map((planet) => ({
      planet,
      orbit: createOrbitPoints(planet),
      position: planetPositionAt(planet, timestampMs),
    })) ?? [],
    [data, timestampMs],
  )
  const selectedPlanet = data?.planets.find((planet) => planet.id === selectedPlanetId) ?? data?.planets[0] ?? null
  const selectedMoons = useMemo(
    () => selectedPlanet && moonCatalogue
      ? moonCatalogue.moons.filter((moon) => moon.parentId === selectedPlanet.id)
      : [],
    [moonCatalogue, selectedPlanet],
  )
  const activeRouteSection = routeSections.find((section) => section.id === activeRouteSectionId) ?? routeSections[0]
  const previewSection = routeSections.find((section) => section.id === previewSectionId) ?? null
  const previewSectionIndex = previewSection ? routeSections.findIndex((section) => section.id === previewSection.id) : -1
  const previewPreviousSection = previewSectionIndex > 0 ? routeSections[previewSectionIndex - 1] ?? null : null
  const previewNextSection = previewSectionIndex >= 0 ? routeSections[previewSectionIndex + 1] ?? null : null
  const orbitalProjection: OrbitalProjection = projection === 'top' ? 'top' : 'side'
  const plannedRoutePoints = useMemo(
    () => plannedRoute?.trajectory.map((point) => routeScenePosition(point.positionKm)) ?? [],
    [plannedRoute],
  )
  const routeSketchSegments = useMemo(() => {
    if (!data || routeSections.length === 0) return []
    return routeSections.map((section, index) => {
      if (isInterstellarRouteObject(section.targetId)) return null
      const origin = routePlotPoint(section.originId, orbitalProjection, orbitGeometry, moonCatalogue)
      const target = routePlotPoint(section.targetId, orbitalProjection, orbitGeometry, moonCatalogue)
      if (!origin || !target) return null
      const nextSection = routeSections[index + 1]
      const nextSectionOwnsVerticalApproach = (
        orbitalProjection === 'side'
        && nextSection
        && routeSectionUsesVerticalCorridor(nextSection)
      )
      const nextTarget = nextSection?.originId === section.targetId && !nextSectionOwnsVerticalApproach
        ? routePlotPoint(nextSection.targetId, orbitalProjection, orbitGeometry, moonCatalogue)
        : null
      const previousSection = routeSections[index - 1]
      const approachCovered = (
        previousSection?.targetId === section.originId
        && !(orbitalProjection === 'side' && routeSectionUsesVerticalCorridor(section))
      )
      const path = routePassagePath(
        section,
        origin,
        target,
        nextTarget,
        orbitalProjection,
        approachCovered,
      )
      if (!path) return null
      return {
        id: section.id,
        index,
        path,
        origin,
        target,
        targetName: routeObjectName(section.targetId, data.planets, moonCatalogue?.moons ?? []),
        hasPassageArc: section.passage.mode !== 'direct',
        outOfPlane: routeSectionUsesVerticalCorridor(section) || section.passage.orbitAngleDeg > 360,
      }
    }).filter((segment): segment is NonNullable<typeof segment> => Boolean(segment))
  }, [data, moonCatalogue, orbitGeometry, orbitalProjection, routeSections])
  const interstellarDirectionMarker = useMemo(() => {
    if (!data) return null
    const terminalSection = [...routeSections].reverse().find((section) => (
      isInterstellarRouteObject(section.targetId)
    ))
    if (!terminalSection) return null
    const origin = routePlotPoint(
      terminalSection.originId,
      orbitalProjection,
      orbitGeometry,
      moonCatalogue,
    )
    const direction = interstellarPreviewDirection(terminalSection.targetId, orbitalProjection)
    if (!origin || !direction) return null
    return {
      origin,
      endpoint: plotRayEndpoint(origin, direction, orbitalProjection),
      direction,
      targetName: routeObjectName(
        terminalSection.targetId,
        data.planets,
        moonCatalogue?.moons ?? [],
      ),
    }
  }, [data, moonCatalogue, orbitGeometry, orbitalProjection, plannedRoute, routeSections])
  const viewBox = orbitalProjection === 'top'
    ? `${-EXTENT} ${-EXTENT} ${EXTENT * 2} ${EXTENT * 2}`
    : `${-EXTENT} ${-SIDE_HALF_HEIGHT} ${EXTENT * 2} ${SIDE_HALF_HEIGHT * 2}`

  const scoreRouteConstellation = (timestamp: number, sections = routeSections) => {
    if (!data || !moonCatalogue || sections.length === 0) return null
    const geometry = data.planets.map((planet) => ({
      planet,
      position: planetPositionAt(planet, timestamp),
    }))
    const points = sections.map((section, index) => {
      const origin = routePlotPoint(section.originId, 'top', geometry, moonCatalogue)
      const target = routePlotPoint(section.targetId, 'top', geometry, moonCatalogue)
      const nextSection = sections[index + 1]
      const nextTarget = nextSection?.originId === section.targetId
        ? routePlotPoint(nextSection.targetId, 'top', geometry, moonCatalogue)
        : null
      return origin && target ? { section, origin, target, nextTarget } : null
    })
    if (points.some((point) => point === null)) return null
    let score = 0
    let gravityRisk = 0
    let alignmentPenalty = 0
    for (const point of points) {
      if (!point) continue
      const inbound = routeVector(point.origin, point.target)
      const outbound = point.nextTarget ? routeVector(point.target, point.nextTarget) : null
      const interstellarTarget = isInterstellarRouteObject(point.section.targetId)
      if (outbound) {
        const turnAngle = angleBetweenVectors(inbound, outbound)
        const capacity = routeTurnCapacityDeg(point.section.targetId)
        const overCapacity = Math.max(0, turnAngle - capacity)
        gravityRisk += overCapacity
        score += Math.max(0, 80 - Math.abs(turnAngle - Math.min(52, capacity * 0.72)))
        score -= overCapacity * 4
      }
      if (interstellarTarget) {
        const desired = interstellarPreviewDirection(point.section.targetId, 'top')
        if (desired) {
          const alignment = angleBetweenVectors(routeVector(point.origin, point.target), desired)
          alignmentPenalty += alignment
          score += Math.max(0, 120 - alignment * 2)
        }
      }
      if (point.section.passage.mode !== 'direct') {
        const requested = point.section.passage.mode === 'full-orbit' ? 360 : point.section.passage.orbitAngleDeg
        const capacity = routeTurnCapacityDeg(point.section.targetId)
        const requestedPenalty = point.section.targetId === 'sun'
          ? Math.max(0, Math.abs((requested % 360) - (outbound ? angleBetweenVectors(inbound, outbound) : requested)) - 34)
          : Math.max(0, requested - capacity * 2.1)
        gravityRisk += requestedPenalty / 4
        score -= requestedPenalty
      }
    }
    return { score, gravityRisk, alignmentPenalty }
  }

  const optimizeSolarPassagesForDate = (timestamp: number) => {
    if (!data || !moonCatalogue) return { sections: routeSections, changes: 0, maxOrbitAngleDeg: 0 }
    const geometry = data.planets.map((planet) => ({
      planet,
      position: planetPositionAt(planet, timestamp),
    }))
    let changes = 0
    let maxOrbitAngleDeg = 0
    const sections = routeSections.map((section, index) => {
      const nextSection = routeSections[index + 1]
      if (section.targetId !== 'sun' || !nextSection || nextSection.originId !== 'sun') return section
      const origin = routePlotPoint(section.originId, 'top', geometry, moonCatalogue)
      const target = routePlotPoint(section.targetId, 'top', geometry, moonCatalogue)
      const nextTarget = routePlotPoint(nextSection.targetId, 'top', geometry, moonCatalogue)
      if (!origin || !target || !nextTarget) return section

      const inbound = routeVector(origin, target)
      const outbound = routeVector(target, nextTarget)
      const turnAngle = angleBetweenVectors(inbound, outbound)
      const inboundAngleDeg = signedPreviewAngleDeg(origin, target)
      const outboundAngleDeg = signedPreviewAngleDeg(target, nextTarget)
      const progradeEntryRadialDeg = inboundAngleDeg - 90
      const progradeExitRadialDeg = outboundAngleDeg - 90
      const retrogradeEntryRadialDeg = inboundAngleDeg + 90
      const retrogradeExitRadialDeg = outboundAngleDeg + 90
      const progradeDelta = positiveAngleDeg(progradeExitRadialDeg - progradeEntryRadialDeg)
      const retrogradeDelta = positiveAngleDeg(retrogradeEntryRadialDeg - retrogradeExitRadialDeg)
      const progradeOrbit = progradeDelta < 42 ? 360 + progradeDelta : progradeDelta
      const retrogradeOrbit = retrogradeDelta < 42 ? 360 + retrogradeDelta : retrogradeDelta
      const preferRetrograde = retrogradeOrbit < progradeOrbit - 18
      const orbitDirection = preferRetrograde ? 'retrograde' : 'prograde'
      const optimizedOrbitAngle = clamp(preferRetrograde ? retrogradeOrbit : progradeOrbit, 35, 540)
      const entryDirection = routeVector(target, origin)
      const entryLength = Math.hypot(entryDirection.x, entryDirection.y) || 1
      const centerDirection: [number, number, number] = [
        -entryDirection.x / entryLength,
        -entryDirection.y / entryLength,
        Math.abs(section.corridor.centerDirection[2]) > 0.18 ? section.corridor.centerDirection[2] : 0,
      ]
      const horizontalHalfAngleDeg = clamp(10 + Math.max(0, turnAngle - 70) * 0.11, 10, 24)
      const verticalHalfAngleDeg = clamp(6 + Math.max(0, turnAngle - 100) * 0.08, 6, 16)
      const mainProjection: EntryCorridorDefinition['mainProjection'] = Math.abs(centerDirection[2]) > 0.18 ? 'side' : 'top'

      maxOrbitAngleDeg = Math.max(maxOrbitAngleDeg, optimizedOrbitAngle)
      const currentOrbit = section.passage.mode === 'partial-orbit' ? section.passage.orbitAngleDeg : 0
      if (
        section.passage.mode !== 'partial-orbit'
        || Math.abs(currentOrbit - optimizedOrbitAngle) > 2
        || section.passage.orbitDirection !== orbitDirection
      ) {
        changes += 1
      }
      const optimizedSection: RouteSectionDefinition = {
        ...section,
        corridor: {
          ...section.corridor,
          enabled: true,
          centerDirection,
          horizontalHalfAngleDeg,
          verticalHalfAngleDeg,
          mainProjection,
        },
        passage: {
          ...section.passage,
          mode: 'partial-orbit',
          orbitAngleDeg: optimizedOrbitAngle,
          orbitDirection,
          entryBehavior: section.passage.entryBehavior === 'ballistic' ? 'tangential-prograde' : section.passage.entryBehavior,
          exitBehavior: 'tangential-accelerate',
        },
      }
      return optimizedSection
    })
    return { sections, changes, maxOrbitAngleDeg }
  }

  const findBestConstellation = async () => {
    if (!data || !moonCatalogue || constellationSearchRunning) return
    if (routeSections.length === 0) {
      setConstellationSearchStatus('Keine Route vorhanden.')
      return
    }
    setConstellationSearchRunning(true)
    const base = new Date(`${plannedMissionDate ?? activeDate}T00:00:00Z`).getTime()
    const candidates: Array<{
      timestamp: number
      score: number
      gravityRisk: number
      alignmentPenalty: number
      sections: RouteSectionDefinition[]
      solarChanges: number
      maxSolarOrbitAngleDeg: number
    }> = []
    const buildCandidate = (timestamp: number) => {
      const optimized = optimizeSolarPassagesForDate(timestamp)
      const result = scoreRouteConstellation(timestamp, optimized.sections)
      if (!result) return null
      const daysFromBase = Math.abs((timestamp - base) / 86_400_000)
      const timePenalty = Math.min(90, daysFromBase / 55)
      const solarPenalty = optimized.maxOrbitAngleDeg > 360 ? (optimized.maxOrbitAngleDeg - 360) / 3.8 : 0
      return {
        timestamp,
        ...result,
        score: result.score - solarPenalty - timePenalty,
        sections: optimized.sections,
        solarChanges: optimized.changes,
        maxSolarOrbitAngleDeg: optimized.maxOrbitAngleDeg,
      }
    }
    const evaluate = (timestamp: number) => {
      const candidate = buildCandidate(timestamp)
      if (candidate) candidates.push(candidate)
      return candidate
    }
    const searchRunId = crypto.randomUUID()
    logActivity({
      category: 'calculation',
      action: 'constellation-search-started',
      details: {
        searchRunId,
        route: routeSections.map((section) => `${section.originId}>${section.targetId}`).join('|'),
      },
      values: {
        baseDate: dateFromTimestamp(base),
        broadStepDays: 10,
        searchStartDay: -730,
        searchEndDay: 2920,
      },
    })
    try {
      for (let day = -730; day <= 2920; day += 10) evaluate(base + day * 86_400_000)
      const geometricShortlist = candidates
        .sort((left, right) => right.score - left.score)
        .filter((candidate, index, all) => (
          all.findIndex((other) => Math.abs(other.timestamp - candidate.timestamp) < 24 * 86_400_000) === index
        ))
        .slice(0, 4)
      if (geometricShortlist.length === 0) {
        setConstellationSearchStatus('Keine bewertbare Konstellation gefunden.')
        return
      }

      type SolvedCandidate = {
        candidate: typeof geometricShortlist[number]
        route: WaypointRouteResult
        quality: number
        targetCorrectionDeltaVKmS: number
        requiredInjectionDeltaVKmS: number
        availableInjectionDeltaVKmS: number
        targetAlignmentDeg: number
      }
      const solveCandidate = async (
        candidate: typeof geometricShortlist[number],
        fullCorridorCheck: boolean,
        stage: string,
        iteration: number,
      ): Promise<SolvedCandidate | null> => {
        const startDate = dateFromTimestamp(candidate.timestamp)
        const selectedSections = (
          candidate.sections[0]?.targetId === 'sun'
          && candidate.sections[1]?.originId === 'sun'
        )
          ? candidate.sections.slice(1)
          : candidate.sections
        const solverSections = fullCorridorCheck
          ? selectedSections
          : selectedSections.map((section) => ({
              ...section,
              corridor: { ...section.corridor, enabled: false },
            }))
        if (solverSections.length === 0) return null
        const response = await fetch('/api/route/simulate', {
          method: 'POST',
          headers: activityRequestHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            mission: { ...(missionConfig ?? DEFAULT_MISSION_CONFIG), startDate },
            waypointId: solverSections[0]?.targetId ?? 'earth',
            flybyAltitudeKm: 100_000,
            flybyMode: 'acceleration',
            routeSections: solverSections,
          }),
        })
        const payload = await response.json() as WaypointRouteResult | { error?: string }
        if (!response.ok || 'error' in payload) {
          const message = 'error' in payload && payload.error ? payload.error : `HTTP ${response.status}`
          const structural = /keine lokale Ephemeride|benötigt zuerst|kann nur der letzte|Mindestens ein 2D-Routenabschnitt|Endpunkt/.test(message)
          logActivity({
            category: 'calculation',
            action: 'constellation-candidate',
            status: structural ? 'error' : 'rejected',
            message,
            details: {
              searchRunId,
              stage,
              rejectionKind: structural ? 'structural' : 'constraint',
            },
            values: {
              iteration,
              startDate,
              geometricScore: candidate.score,
              fullCorridorCheck,
            },
          })
          if (structural) throw new Error(`Modellfehler in der Konstellationssuche: ${message}`)
          return null
        }
        const route = payload as WaypointRouteResult
        const targetCorrectionDeltaVKmS = route.summary.targetCorrectionDeltaVKmS ?? 0
        const requiredInjectionDeltaVKmS = route.summary.requiredInjectionDeltaVKmS
        const availableInjectionDeltaVKmS = route.summary.availableInjectionDeltaVKmS ?? requiredInjectionDeltaVKmS
        const targetAlignmentDeg = route.summary.actualTargetAlignmentDeg ?? route.summary.targetAlignmentDeg
        const corridorSatisfied = route.routeSections?.every((section) => section.corridor.entryInsideCorridor) ?? true
        const collisionFree = route.validation?.collisionFree !== false && route.highFidelityNBody?.collision !== true
        const propulsionMarginKmS = availableInjectionDeltaVKmS - requiredInjectionDeltaVKmS - targetCorrectionDeltaVKmS
        const quality = (
          (route.summary.feasibleWithConfiguredBurn ? 1_200 : 0)
          + (corridorSatisfied ? 260 : -700)
          + (collisionFree ? 180 : -5_000)
          + (route.highFidelityNBody?.converged ? 120 : 0)
          + Math.max(-600, propulsionMarginKmS * 90)
          - targetCorrectionDeltaVKmS * 55
          - targetAlignmentDeg * 7
          - Math.max(0, route.totalFlightDays - 365) * 0.035
          - (route.warnings?.length ?? 0) * 12
        )
        logActivity({
          category: 'calculation',
          action: 'constellation-candidate',
          status: route.summary.feasibleWithConfiguredBurn ? 'success' : 'rejected',
          details: {
            searchRunId,
            stage,
            rejectionKind: route.summary.feasibleWithConfiguredBurn ? '' : 'constraint',
          },
          values: {
            iteration,
            startDate,
            geometricScore: candidate.score,
            quality,
            feasible: route.summary.feasibleWithConfiguredBurn,
            corridorSatisfied,
            collisionFree,
            requiredInjectionDeltaVKmS,
            availableInjectionDeltaVKmS,
            targetCorrectionDeltaVKmS,
            targetAlignmentDeg,
          },
        })
        return {
          candidate,
          route,
          quality,
          targetCorrectionDeltaVKmS,
          requiredInjectionDeltaVKmS,
          availableInjectionDeltaVKmS,
          targetAlignmentDeg,
        }
      }

      const preflightCandidates: SolvedCandidate[] = []
      const solvedTimestamps = new Set<number>()
      let solverIteration = 0
      for (let index = 0; index < geometricShortlist.length; index += 1) {
        const candidate = geometricShortlist[index]
        const startDate = dateFromTimestamp(candidate.timestamp)
        setConstellationSearchStatus(`Dynamische Vorprüfung ${index + 1}/${geometricShortlist.length}: ${new Date(`${startDate}T00:00:00Z`).toLocaleDateString('de-DE', { timeZone: 'UTC' })}`)
        solverIteration += 1
        solvedTimestamps.add(candidate.timestamp)
        const solved = await solveCandidate(candidate, false, 'basin-preflight', solverIteration)
        if (solved) preflightCandidates.push(solved)
      }
      for (const stepDays of [3, 1]) {
        const currentBest = preflightCandidates.sort((left, right) => right.quality - left.quality)[0]
        if (!currentBest) break
        const neighbors = [-stepDays, stepDays]
          .map((offset) => buildCandidate(currentBest.candidate.timestamp + offset * 86_400_000))
          .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
          .filter((candidate) => !solvedTimestamps.has(candidate.timestamp))
        for (let index = 0; index < neighbors.length; index += 1) {
          const candidate = neighbors[index]
          const startDate = dateFromTimestamp(candidate.timestamp)
          setConstellationSearchStatus(
            `Iterative Nachsuche ±${stepDays} Tage ${index + 1}/${neighbors.length}: ${new Date(`${startDate}T00:00:00Z`).toLocaleDateString('de-DE', { timeZone: 'UTC' })}`,
          )
          solverIteration += 1
          solvedTimestamps.add(candidate.timestamp)
          const solved = await solveCandidate(candidate, false, `date-refinement-${stepDays}d`, solverIteration)
          if (solved) preflightCandidates.push(solved)
        }
      }
      const fullValidationShortlist = preflightCandidates
        .sort((left, right) => right.quality - left.quality)
        .slice(0, 2)
        .map((solved) => ({
          ...solved,
          candidate: {
            ...solved.candidate,
            sections: solved.candidate.sections.map((section) => {
               const calculated = solved.route.routeSections?.find((item) => item.id === section.id)
               if (!calculated) return section
               const centerDirection = calculated.entryDirection
               const calculatedTurnDeg = calculated.predictedPassiveTurnDeg ?? 0
               return {
                 ...section,
                 corridor: {
                   ...section.corridor,
                   enabled: true,
                   centerDirection,
                   mainProjection: (Math.abs(centerDirection[2]) > 0.18 ? 'side' : 'top') as EntryCorridorDefinition['mainProjection'],
                   blocked: false,
                   blockReasons: [],
                 },
                 passage: calculatedTurnDeg > 0.1 && !isInterstellarRouteObject(section.targetId)
                   ? {
                       ...section.passage,
                       mode: 'partial-orbit' as const,
                       orbitAngleDeg: clamp(calculatedTurnDeg, 1, 540),
                     }
                   : section.passage,
               }
            }),
          },
        }))
      const solvedCandidates: SolvedCandidate[] = []
      for (let index = 0; index < fullValidationShortlist.length; index += 1) {
        const candidate = fullValidationShortlist[index].candidate
        const startDate = dateFromTimestamp(candidate.timestamp)
        setConstellationSearchStatus(`Korridor-Vollprüfung ${index + 1}/${fullValidationShortlist.length}: ${new Date(`${startDate}T00:00:00Z`).toLocaleDateString('de-DE', { timeZone: 'UTC' })}`)
        solverIteration += 1
        const solved = await solveCandidate(candidate, true, 'corridor-full-validation', solverIteration)
        if (solved) solvedCandidates.push(solved)
      }
      const best = solvedCandidates.sort((left, right) => right.quality - left.quality)[0]
      if (!best) {
        setConstellationSearchStatus('Der Solver konnte keinen Kandidaten propagieren. Route und Eingaben bleiben erhalten.')
        logActivity({
          category: 'calculation',
          action: 'constellation-search-completed',
          status: 'rejected',
          message: 'Kein Kandidat konnte bis zur Korridor-Vollprüfung propagiert werden.',
          details: {
            searchRunId,
            resultKind: 'no-propagable-candidate',
          },
          values: {
            iterations: solverIteration,
            preflightCandidates: preflightCandidates.length,
            fullValidationCandidates: solvedCandidates.length,
          },
        })
        return
      }
      const bestDate = dateFromTimestamp(best.candidate.timestamp)
      onPlannedMissionDateChange(bestDate)
      onRouteSectionsChange(best.candidate.sections)
      onPlannedRouteChange(best.route)
      const deltaVDeficitKmS = Math.max(
        0,
        best.requiredInjectionDeltaVKmS
          + best.targetCorrectionDeltaVKmS
          - best.availableInjectionDeltaVKmS,
      )
      const solutionLabel = best.route.summary.feasibleWithConfiguredBurn
        ? 'Flugfähige Lösung'
        : 'Noch außerhalb des grünen Bereichs · bester geprüfter Vorschlag'
      const solarPassageLabel = best.candidate.maxSolarOrbitAngleDeg >= 360 ? 'Sonnenumrundung' : 'Sonnenpassage'
      setConstellationSearchStatus(
        `${solutionLabel} ${new Date(`${bestDate}T00:00:00Z`).toLocaleDateString('de-DE', { timeZone: 'UTC' })} - Start-Δv ${best.requiredInjectionDeltaVKmS.toFixed(2)} km/s - Zielkorrektur ${best.targetCorrectionDeltaVKmS.toFixed(2)} km/s - Zielrest ${best.targetAlignmentDeg.toFixed(1)}°${best.candidate.solarChanges > 0 ? ` - ${solarPassageLabel} ${best.candidate.maxSolarOrbitAngleDeg.toFixed(0)}°` : ''}${deltaVDeficitKmS > 0 ? ` - Δv-Defizit ${deltaVDeficitKmS.toFixed(2)} km/s` : ''}`,
      )
      logActivity({
        category: 'calculation',
        action: 'constellation-search-completed',
        status: best.route.summary.feasibleWithConfiguredBurn ? 'success' : 'rejected',
        details: {
          searchRunId,
          resultKind: best.route.summary.feasibleWithConfiguredBurn ? 'flight-ready' : 'best-effort',
        },
        values: {
          iterations: solverIteration,
          bestDate,
          quality: best.quality,
          deltaVDeficitKmS,
          targetAlignmentDeg: best.targetAlignmentDeg,
          feasible: best.route.summary.feasibleWithConfiguredBurn,
        },
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Konstellationssuche fehlgeschlagen.'
      setConstellationSearchStatus(message)
      logActivity({
        category: 'calculation',
        action: 'constellation-search-failed',
        status: 'error',
        message,
        details: { searchRunId },
      })
    } finally {
      setConstellationSearchRunning(false)
    }
  }

  if (error) return <div className="status-message">{error}</div>
  if (!data) return <div className="status-message">2D-Orbitalplaner wird geladen …</div>

  const updateActiveRouteSection = (update: (section: RouteSectionDefinition) => RouteSectionDefinition) => {
    onRouteSectionsChange((current) => current.map((section) => (
      section.id === activeRouteSectionId ? update(section) : section
    )))
  }
  const updateEntryCorridor: Dispatch<SetStateAction<EntryCorridorDefinition>> = (action) => {
    updateActiveRouteSection((section) => ({
      ...section,
      corridor: typeof action === 'function' ? action(section.corridor) : action,
    }))
  }
  const createSection = (section: RouteSectionDefinition) => {
    onRouteSectionsChange((current) => [...current, section])
    onActiveRouteSectionChange(section.id)
  }
  const updateSection = (updatedSection: RouteSectionDefinition) => {
    onRouteSectionsChange((current) => current.map((section) => (
      section.id === updatedSection.id ? updatedSection : section
    )))
    onActiveRouteSectionChange(updatedSection.id)
  }
  const deleteSection = (sectionId: string) => {
    const deletedIndex = routeSections.findIndex((section) => section.id === sectionId)
    const nextActiveId = routeSections[deletedIndex + 1]?.id ?? routeSections[deletedIndex - 1]?.id
    onRouteSectionsChange((current) => current.filter((section) => section.id !== sectionId))
    if (sectionId === activeRouteSectionId) onActiveRouteSectionChange(nextActiveId ?? '')
  }
  const moveSection = (sectionId: string, direction: -1 | 1) => {
    onRouteSectionsChange((current) => {
      const currentIndex = current.findIndex((section) => section.id === sectionId)
      const nextIndex = currentIndex + direction
      if (currentIndex < 0 || nextIndex < 0 || nextIndex >= current.length) return current
      const reordered = [...current]
      ;[reordered[currentIndex], reordered[nextIndex]] = [reordered[nextIndex], reordered[currentIndex]]
      return reordered
    })
  }
  const applyRouteIntent = (sectionId: string, intent: RoutePreviewIntent) => {
    onRouteSectionsChange((current) => current.map((section) => {
      if (section.id !== sectionId) return section
      const nextPassage = { ...section.passage }
      if (intent === 'asymptotic-entry') {
        nextPassage.entryBehavior = 'ballistic'
        nextPassage.exitBehavior = 'tangential-accelerate'
      }
      if (intent === 'tangential-entry') {
        nextPassage.mode = nextPassage.mode === 'direct' ? 'partial-orbit' : nextPassage.mode
        nextPassage.orbitAngleDeg = nextPassage.orbitAngleDeg > 0 ? nextPassage.orbitAngleDeg : 45
        nextPassage.entryBehavior = 'tangential-prograde'
      }
      if (intent === 'accelerated-exit') {
        nextPassage.exitBehavior = 'tangential-accelerate'
      }
      if (intent === 'braking-entry') {
        nextPassage.entryBehavior = 'tangential-retrograde'
      }
      return {
        ...section,
        passage: nextPassage,
      }
    }))
  }
  const beginOrbitPan = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    const plot = event.currentTarget
    orbitPanRef.current = {
      active: true,
      moved: false,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: plot.scrollLeft,
      scrollTop: plot.scrollTop,
    }
    plot.setPointerCapture(event.pointerId)
    plot.classList.add('panning')
  }
  const moveOrbitPan = (event: PointerEvent<HTMLDivElement>) => {
    const pan = orbitPanRef.current
    if (!pan.active || pan.pointerId !== event.pointerId) return
    const dx = event.clientX - pan.startX
    const dy = event.clientY - pan.startY
    if (Math.hypot(dx, dy) > 3) pan.moved = true
    event.currentTarget.scrollLeft = pan.scrollLeft - dx
    event.currentTarget.scrollTop = pan.scrollTop - dy
  }
  const endOrbitPan = (event: PointerEvent<HTMLDivElement>) => {
    const pan = orbitPanRef.current
    if (!pan.active || pan.pointerId !== event.pointerId) return
    orbitPanRef.current = { ...pan, active: false }
    event.currentTarget.classList.remove('panning')
    if (pan.moved) {
      logActivity({
        category: 'ui',
        action: 'orbit-pan',
        values: {
          scrollLeft: Math.round(event.currentTarget.scrollLeft),
          scrollTop: Math.round(event.currentTarget.scrollTop),
        },
        details: { projection },
      })
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  return (
    <section className="view-panel two-d-planner" aria-labelledby="two-d-title">
      <div className="view-heading">
        <div>
          <p className="eyebrow">Interaktiver Orbitalplaner</p>
          <h1 id="two-d-title">Das Sonnensystem in 2D</h1>
        </div>
        <p>Reale J2000-Ellipsen und Bahnneigungen zur Ekliptik. Beide Ansichten verwenden dieselbe Epoche und Planetenauswahl.</p>
      </div>

      <div className="two-d-actionbar" role="toolbar" aria-label="2D-Ansichten">
        <div className="two-d-view-tabs" role="group" aria-label="Projektion">
          <button type="button" className={projection === 'corridor' ? 'active' : ''} aria-pressed={projection === 'corridor'} onClick={() => setProjection('corridor')}>Zielkorridor</button>
          <button type="button" className={projection === 'side' ? 'active' : ''} aria-pressed={projection === 'side'} onClick={() => setProjection('side')}>Kantenansicht · Neigung</button>
          <button type="button" className={projection === 'top' ? 'active' : ''} aria-pressed={projection === 'top'} onClick={() => setProjection('top')}>Draufsicht · Bahnen</button>
        </div>
        <button
          type="button"
          className="best-constellation-button"
          disabled={!data || !moonCatalogue || routeSections.length === 0 || constellationSearchRunning}
          onClick={() => void findBestConstellation()}
        >
          {constellationSearchRunning ? 'Konstellationen werden geprüft …' : 'Beste mögliche Konstellation'}
        </button>
        {projection !== 'corridor' && (
          <>
            <div className="orbit-zoom-control">
              <span>Zoom</span>
              <button
                type="button"
                aria-label="Zoom verkleinern"
                onClick={() => setOrbitZoom((value) => Math.max(1, Number((value - 0.2).toFixed(1))))}
              >
                -
              </button>
              <input
                type="range"
                min="1"
                max="3"
                step="0.1"
                value={orbitZoom}
                onChange={(event) => setOrbitZoom(event.target.valueAsNumber)}
              />
              <button
                type="button"
                aria-label="Zoom vergrößern"
                onClick={() => setOrbitZoom((value) => Math.min(3, Number((value + 0.2).toFixed(1))))}
              >
                +
              </button>
              <output>{Math.round(orbitZoom * 100)}%</output>
            </div>
            <output className={plannedMissionDate ? 'mission-epoch' : ''}>{epochLabel}</output>
          </>
        )}
      </div>
      {constellationSearchStatus && <p className="constellation-search-status">{constellationSearchStatus}</p>}

      {projection === 'corridor'
        ? (
          <div className="route-section-planner">
            {activeRouteSection
              ? <PlanetCorridorPlanner
                  planets={data.planets}
                  moons={moonCatalogue?.moons ?? []}
                  sun={data.sun}
                  originId={activeRouteSection.originId}
                  onOriginChange={(originId) => updateActiveRouteSection((section) => ({ ...section, originId }))}
                  waypointId={activeRouteSection.targetId}
                  onWaypointChange={(targetId) => updateActiveRouteSection((section) => ({ ...section, targetId }))}
                  definition={activeRouteSection.corridor}
                  onDefinitionChange={updateEntryCorridor}
                  deltaVMinusKmS={activeRouteSection.deltaVMinusKmS}
                  deltaVPlusKmS={activeRouteSection.deltaVPlusKmS}
                  onDeltaVMinusChange={(deltaVMinusKmS) => updateActiveRouteSection((section) => ({ ...section, deltaVMinusKmS }))}
                  onDeltaVPlusChange={(deltaVPlusKmS) => updateActiveRouteSection((section) => ({ ...section, deltaVPlusKmS }))}
                  sectionNumber={routeSections.findIndex((section) => section.id === activeRouteSectionId) + 1}
                  onPreviewRoute={() => setPreviewSectionId(activeRouteSection.id)}
                  passageDirection={activeRouteSection.passage.orbitDirection}
                />
              : (
                <div className="route-project-empty" role="status">
                  <strong>Blanko-Projekt</strong>
                  <span>Noch keine Verbindung angelegt. Erstelle den ersten unabhängigen Routenabschnitt mit „+ Neu“.</span>
                </div>
              )}
            <RouteSectionList
              planets={data.planets}
              moons={moonCatalogue?.moons ?? []}
              sections={routeSections}
              activeSectionId={activeRouteSectionId}
              suggestedOriginId=""
              suggestedTargetId=""
              onCreate={createSection}
              onUpdate={updateSection}
              onEdit={onActiveRouteSectionChange}
              onDelete={deleteSection}
              onMove={moveSection}
            />
          </div>
        )
        : (
          <>
            <div className="two-d-orbit-workspace">
              <div
                ref={orbitPlotRef}
                className={`plot-frame orbital-plot ${projection}`}
                style={{ '--orbit-zoom-width': `${orbitZoom * 100}%` } as CSSProperties}
                onPointerDown={beginOrbitPan}
                onPointerMove={moveOrbitPan}
                onPointerUp={endOrbitPan}
                onPointerCancel={endOrbitPan}
                onPointerLeave={endOrbitPan}
              >
                <svg
                  viewBox={viewBox}
                  role="group"
                  aria-label={orbitalProjection === 'top' ? 'Draufsicht der tatsächlichen Planetenbahnen' : 'Kantenansicht der tatsächlichen Bahnneigungen'}
                >
                  <defs>
                    <marker id="interstellar-direction-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                      <path d="M 0 0 L 10 5 L 0 10 z" />
                    </marker>
                  </defs>
                  <rect x={-EXTENT} y={orbitalProjection === 'top' ? -EXTENT : -SIDE_HALF_HEIGHT} width={EXTENT * 2} height={orbitalProjection === 'top' ? EXTENT * 2 : SIDE_HALF_HEIGHT * 2} className="orbital-background" />
                  <line x1={-EXTENT} y1="0" x2={EXTENT} y2="0" className="ecliptic-line" />

                  {orbitalProjection === 'top' && orbitGeometry.map(({ planet, orbit }) => (
                    <path key={`orbit-${planet.id}`} d={pathFromPoints(orbit)} className="planet-orbit-path" style={{ stroke: planet.color }} />
                  ))}
                  {plannedRoutePoints.length > 1 && (
                    <path
                      d={pathFromPoints(plannedRoutePoints, orbitalProjection)}
                      className="planned-route-path-2d"
                    />
                  )}
                  {!plannedRoute && routeSketchSegments.length > 0 && (
                    <g className="route-sketch-layer-2d">
                      {routeSketchSegments.map((segment) => (
                        <g key={`route-sketch-${segment.id}`}>
                          <path
                            d={segment.path}
                            className={[
                              'route-sketch-path',
                              segment.hasPassageArc ? 'passage-arc' : '',
                              segment.outOfPlane ? 'out-of-plane' : '',
                            ].filter(Boolean).join(' ')}
                          />
                          <circle cx={segment.origin.x} cy={segment.origin.y} r=".16" className="route-sketch-node origin" />
                          <circle cx={segment.target.x} cy={segment.target.y} r=".18" className="route-sketch-node target" />
                        </g>
                      ))}
                    </g>
                  )}
                  {interstellarDirectionMarker && (
                    <g className={`interstellar-direction-marker ${plannedRoute ? 'nominal' : 'draft'}`}>
                      <line
                        x1={interstellarDirectionMarker.origin.x}
                        y1={interstellarDirectionMarker.origin.y}
                        x2={interstellarDirectionMarker.endpoint.x}
                        y2={interstellarDirectionMarker.endpoint.y}
                        markerEnd="url(#interstellar-direction-arrow)"
                      />
                      <text
                        x={interstellarDirectionMarker.endpoint.x + (interstellarDirectionMarker.direction.x >= 0 ? -.4 : .4)}
                        y={interstellarDirectionMarker.endpoint.y + (interstellarDirectionMarker.direction.y >= 0 ? -.45 : .65)}
                        textAnchor={interstellarDirectionMarker.direction.x >= 0 ? 'end' : 'start'}
                      >
                        Austritt → {interstellarDirectionMarker.targetName} · Richtung
                      </text>
                    </g>
                  )}

                  <circle cx="0" cy="0" r="0.45" className="two-d-sun" />
                  {orbitalProjection === 'top' && <text x="0.7" y="-0.65" className="orbital-label">Sonne · Ekliptik 0°</text>}

                  {orbitGeometry.map(({ planet, position }, index) => {
                    const [x, y] = project(position, orbitalProjection)
                    const isSelected = planet.id === selectedPlanet?.id
                    const labelY = SIDE_LABEL_Y[index] ?? y
                    const markerRadius = planet.id === 'jupiter' || planet.id === 'saturn' ? 0.3 : 0.2
                    const selectPlanet = () => setSelectedPlanetId(planet.id)
                    return (
                      <g
                        key={`planet-${planet.id}`}
                        className={`two-d-planet-target ${isSelected ? 'selected' : ''}`}
                        role="button"
                        tabIndex={0}
                        aria-label={`${planet.name} auswählen`}
                        aria-pressed={isSelected}
                        onClick={(event) => {
                          if (orbitPanRef.current.moved) {
                            event.preventDefault()
                            event.stopPropagation()
                            orbitPanRef.current.moved = false
                            return
                          }
                          selectPlanet()
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            selectPlanet()
                          }
                        }}
                      >
                        <circle cx={x} cy={y} r="0.62" className="planet-hit-target" />
                        {isSelected && <circle cx={x} cy={y} r={markerRadius + 0.24} className="planet-selection-ring" />}
                        <circle cx={x} cy={y} r={markerRadius} fill={planet.color} className="two-d-planet" />
                        {orbitalProjection === 'top' && <text x={x + 0.38} y={y - 0.35} className="orbital-label">{planet.name}</text>}
                        {orbitalProjection === 'side' && (
                          <>
                            <line x1={x} y1={y} x2={x} y2={labelY} className="planet-label-leader" />
                            <text x={x + 0.28} y={labelY} className="orbital-label side-label">
                              {planet.name} · {(planet.inclinationDeg ?? 0).toFixed(1)}°
                            </text>
                          </>
                        )}
                      </g>
                    )
                  })}
                  {plannedRoute?.routeSections?.map((section) => {
                    const periapsis = plannedRoutePoints[section.periapsisIndex]
                    if (!periapsis || section.sectionType === 'interstellar-asymptote') return null
                    const [periapsisX, periapsisY] = project(periapsis, orbitalProjection)
                    return (
                      <g key={`route-state-${section.id}`} className="planned-route-states-2d">
                        <circle cx={periapsisX} cy={periapsisY} r=".2" className="periapsis" />
                      </g>
                    )
                  })}
                </svg>
              </div>

              {selectedPlanet && (
                <TwoDPlanetDetails
                  planet={selectedPlanet}
                  moons={selectedMoons}
                  epochLabel={epochLabel}
                />
              )}
            </div>
            <p className="two-d-footnote">Kantenansicht: aktuelle Planetenpositionen gegen Ekliptikhöhe · Draufsicht: aktuelle Positionen auf realen J2000-Bahnen · beide synchron.</p>
          </>
        )}
      {previewSection && (
        <RoutePreviewDialog
          section={previewSection}
          previousSection={previewPreviousSection}
          nextSection={previewNextSection}
          planets={data.planets}
          moons={moonCatalogue?.moons ?? []}
          onClose={() => setPreviewSectionId(null)}
          onApply={(intent) => applyRouteIntent(previewSection.id, intent)}
        />
      )}
    </section>
  )
}

type RoutePreviewIntent = 'asymptotic-entry' | 'tangential-entry' | 'accelerated-exit' | 'braking-entry'

const BEHAVIOR_LABELS: Record<RouteBoundaryBehavior, string> = {
  ballistic: 'ballistisch / asymptotisch',
  'tangential-prograde': 'tangential prograd',
  'tangential-retrograde': 'tangential retrograd',
  'tangential-accelerate': 'tangential beschleunigen',
  radial: 'radial',
}

function routeObjectName(objectId: string, planets: SolarSystemData['planets'], moons: MoonCatalogue['moons']) {
  if (objectId === 'sun') return 'Sonne'
  return planets.find((planet) => planet.id === objectId)?.name
    ?? moons.find((moon) => moon.id === objectId)?.name
    ?? ROUTE_INTERSTELLAR_SYSTEMS.find((target) => target.id === objectId)?.name
    ?? objectId
}

function isInterstellarRouteObject(objectId: string) {
  return ROUTE_INTERSTELLAR_SYSTEMS.some((target) => target.id === objectId)
}

type PreviewPoint = { x: number; y: number }

function pointOnCircle(center: PreviewPoint, radius: number, angleRad: number): PreviewPoint {
  return {
    x: center.x + Math.cos(angleRad) * radius,
    y: center.y + Math.sin(angleRad) * radius,
  }
}

function previewEntryAngle(section: RouteSectionDefinition) {
  const [x, y, z] = section.corridor.centerDirection
  const projectedY = (section.corridor.mainProjection ?? 'side') === 'top' ? y : z
  const length = Math.hypot(x, projectedY)
  if (length <= 0.0001) return Math.PI
  return Math.atan2(projectedY, x) + Math.PI
}

function previewPointOnRay(center: PreviewPoint, angleRad: number, distance: number): PreviewPoint {
  return {
    x: center.x + Math.cos(angleRad) * distance,
    y: center.y + Math.sin(angleRad) * distance,
  }
}

function mixPoint(start: PreviewPoint, end: PreviewPoint, t: number): PreviewPoint {
  return {
    x: start.x + (end.x - start.x) * t,
    y: start.y + (end.y - start.y) * t,
  }
}

function normalControlPoint(start: PreviewPoint, end: PreviewPoint, t: number, offset: number): PreviewPoint {
  const base = mixPoint(start, end, t)
  const dx = end.x - start.x
  const dy = end.y - start.y
  const length = Math.hypot(dx, dy) || 1
  return {
    x: base.x - dy / length * offset,
    y: base.y + dx / length * offset,
  }
}

function scaleVector(vector: PreviewPoint, factor: number): PreviewPoint {
  return { x: vector.x * factor, y: vector.y * factor }
}

function addPoint(point: PreviewPoint, vector: PreviewPoint): PreviewPoint {
  return { x: point.x + vector.x, y: point.y + vector.y }
}

function radialVector(angleRad: number): PreviewPoint {
  return { x: Math.cos(angleRad), y: Math.sin(angleRad) }
}

function normalizePreviewVector(vector: PreviewPoint) {
  const length = Math.hypot(vector.x, vector.y) || 1
  return { x: vector.x / length, y: vector.y / length }
}

function clampPointToCanvas(point: PreviewPoint, margin = 68): PreviewPoint {
  return {
    x: Math.min(970 - margin, Math.max(margin, point.x)),
    y: Math.min(600 - margin, Math.max(margin, point.y)),
  }
}

function interstellarPreviewDirection(targetId: string, projection: EntryCorridorDefinition['mainProjection']): PreviewPoint | null {
  const target = ROUTE_INTERSTELLAR_SYSTEMS.find((item) => item.id === targetId)
  if (!target) return null
  const rightAscension = target.rightAscensionDeg * Math.PI / 180
  const declination = target.declinationDeg * Math.PI / 180
  const obliquity = 23.43928 * Math.PI / 180
  const equatorialX = Math.cos(declination) * Math.cos(rightAscension)
  const equatorialY = Math.cos(declination) * Math.sin(rightAscension)
  const equatorialZ = Math.sin(declination)
  const x = equatorialX
  const y = equatorialY * Math.cos(obliquity) + equatorialZ * Math.sin(obliquity)
  const z = -equatorialY * Math.sin(obliquity) + equatorialZ * Math.cos(obliquity)
  return normalizePreviewVector({ x, y: (projection ?? 'side') === 'top' ? -y : -z })
}

function nextTargetPreviewVector(section: RouteSectionDefinition, nextSection: RouteSectionDefinition | null) {
  if (!nextSection || nextSection.originId !== section.targetId) return normalizePreviewVector({ x: 1, y: 0 })
  if (nextSection.targetId === section.originId) return normalizePreviewVector({ x: -1, y: 0 })
  const stellarDirection = interstellarPreviewDirection(nextSection.targetId, section.corridor.mainProjection)
  if (stellarDirection) return stellarDirection
  const [x, y, z] = nextSection.corridor.centerDirection
  const projectedY = (section.corridor.mainProjection ?? 'side') === 'top' ? -y : -z
  const projected = normalizePreviewVector({ x, y: projectedY })
  return Math.hypot(projected.x, projected.y) > 0.0001 ? projected : normalizePreviewVector({ x: 1, y: 0 })
}

function tangentVector(angleRad: number, directionSign: number): PreviewPoint {
  return {
    x: -Math.sin(angleRad) * directionSign,
    y: Math.cos(angleRad) * directionSign,
  }
}

function sampledArcPath(center: PreviewPoint, radius: number, startAngle: number, endAngle: number) {
  const angleSpan = Math.abs(endAngle - startAngle)
  const steps = Math.max(8, Math.ceil(angleSpan / (Math.PI / 18)))
  return Array.from({ length: steps + 1 }, (_, index) => {
    const t = index / steps
    const point = pointOnCircle(center, radius, startAngle + (endAngle - startAngle) * t)
    return `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`
  }).join(' ')
}

function routePreviewGeometry(section: RouteSectionDefinition, nextSection: RouteSectionDefinition | null) {
  const center = { x: 635, y: 310 }
  const hasLinkedExit = nextSection?.originId === section.targetId
  const isInterstellarTarget = isInterstellarRouteObject(section.targetId)
  const radius = 160
  const corridorRadius = 190
  const maxCorridorRadius = 214
  const minCorridorRadius = 166
  const innerCorridorRadius = 158
  const entryAngle = previewEntryAngle(section)
  const isFullOrbit = section.passage.mode === 'full-orbit'
  const requestedOrbitDeg = isFullOrbit
    ? 360
    : section.passage.mode === 'partial-orbit'
      ? clamp(section.passage.orbitAngleDeg, 1, MAX_PARTIAL_ORBIT_ANGLE_DEG)
      : 0
  const directionSign = section.passage.orbitDirection === 'prograde' ? 1 : -1
  const directExitAngle = entryAngle
  const exitVector = nextTargetPreviewVector(section, nextSection)

  if (isInterstellarTarget) {
    const transitVector = normalizePreviewVector(scaleVector(radialVector(entryAngle), -1))
    const normalVector = { x: -transitVector.y, y: transitVector.x }
    const interstellarExitTarget = hasLinkedExit
      ? clampPointToCanvas(addPoint(center, scaleVector(exitVector, 348)))
      : clampPointToCanvas(addPoint(center, scaleVector(transitVector, 348)))
    const entry = addPoint(center, scaleVector(transitVector, -corridorRadius))
    const exit = addPoint(center, scaleVector(transitVector, corridorRadius))
    const entryInner = addPoint(center, scaleVector(transitVector, -innerCorridorRadius))
    const exitInner = addPoint(center, scaleVector(transitVector, innerCorridorRadius))
    const minStart = addPoint(entry, scaleVector(normalVector, -16))
    const minEnd = addPoint(exit, scaleVector(normalVector, -16))
    const maxStart = addPoint(entry, scaleVector(normalVector, 16))
    const maxEnd = addPoint(exit, scaleVector(normalVector, 16))
    const requestedExitAngle = Math.atan2(transitVector.y, transitVector.x)

    return {
      center,
      origin: { x: 105, y: center.y },
      exitTarget: interstellarExitTarget,
      hasLinkedExit,
      exitVector,
      exitAngleDeg: requestedExitAngle * 180 / Math.PI,
      requestedExitAngleDeg: requestedExitAngle * 180 / Math.PI,
      radius,
      entry,
      exit,
      entryInner,
      exitInner,
      entryPath: `M 105 ${center.y} L ${entry.x.toFixed(2)} ${entry.y.toFixed(2)}`,
      minBoundaryPath: `M ${minStart.x.toFixed(2)} ${minStart.y.toFixed(2)} L ${minEnd.x.toFixed(2)} ${minEnd.y.toFixed(2)}`,
      maxBoundaryPath: `M ${maxStart.x.toFixed(2)} ${maxStart.y.toFixed(2)} L ${maxEnd.x.toFixed(2)} ${maxEnd.y.toFixed(2)}`,
      passagePath: `M ${entry.x.toFixed(2)} ${entry.y.toFixed(2)} L ${exit.x.toFixed(2)} ${exit.y.toFixed(2)}`,
      exitPath: `M ${exit.x.toFixed(2)} ${exit.y.toFixed(2)} L ${interstellarExitTarget.x.toFixed(2)} ${interstellarExitTarget.y.toFixed(2)}`,
      corridorPath: `M ${minStart.x.toFixed(2)} ${minStart.y.toFixed(2)} L ${minEnd.x.toFixed(2)} ${minEnd.y.toFixed(2)} L ${maxEnd.x.toFixed(2)} ${maxEnd.y.toFixed(2)} L ${maxStart.x.toFixed(2)} ${maxStart.y.toFixed(2)} Z`,
    }
  }

  const linkedExitAngle = directionSign > 0
    ? Math.atan2(-exitVector.x, exitVector.y)
    : Math.atan2(exitVector.x, -exitVector.y)
  const requestedExitAngle = entryAngle + directionSign * (requestedOrbitDeg * Math.PI / 180)
  const exitAngle = section.passage.mode === 'direct' ? (hasLinkedExit ? linkedExitAngle : directExitAngle) : requestedExitAngle
  const corridorEndAngle = exitAngle
  const origin = { x: 105, y: center.y }
  const exitTarget = hasLinkedExit
    ? clampPointToCanvas(addPoint(center, scaleVector(exitVector, 348)))
    : { x: 925, y: center.y }
  const entry = pointOnCircle(center, corridorRadius, entryAngle)
  const exit = pointOnCircle(center, corridorRadius, exitAngle)
  const entryInner = pointOnCircle(center, innerCorridorRadius, entryAngle)
  const exitInner = pointOnCircle(center, innerCorridorRadius, exitAngle)
  const entryTangent = tangentVector(entryAngle, directionSign)
  const exitTangent = tangentVector(exitAngle, directionSign)
  const asymptoteLift = section.passage.entryBehavior.includes('tangential') ? 0 : 10
  const entryControlA = { x: origin.x + 210, y: center.y + asymptoteLift }
  const entryControlB = addPoint(entry, scaleVector(entryTangent, -132))
  const exitStart = exit
  const exitControlA = addPoint(exitStart, scaleVector(exitTangent, 132))
  const exitTargetUnit = normalizePreviewVector({ x: exitTarget.x - exitStart.x, y: exitTarget.y - exitStart.y })
  const exitControlB = addPoint(exitTarget, scaleVector(exitTargetUnit, -150))
  const optimumPath = section.passage.mode === 'direct'
    ? `M ${entry.x.toFixed(2)} ${entry.y.toFixed(2)} L ${exit.x.toFixed(2)} ${exit.y.toFixed(2)}`
    : sampledArcPath(center, corridorRadius, entryAngle, corridorEndAngle)
  const minBoundaryPath = sampledArcPath(center, minCorridorRadius, entryAngle, corridorEndAngle)
  const maxBoundaryPath = sampledArcPath(center, maxCorridorRadius, entryAngle, corridorEndAngle)
  const outerPath = maxBoundaryPath
  const innerPath = sampledArcPath(center, innerCorridorRadius, corridorEndAngle, entryAngle).replace(/^M/, 'L')
  return {
    center,
    origin,
    exitTarget,
    hasLinkedExit,
    exitVector,
    exitAngleDeg: exitAngle * 180 / Math.PI,
    requestedExitAngleDeg: requestedExitAngle * 180 / Math.PI,
    radius,
    entry,
    exit: exitStart,
    entryInner,
    exitInner,
    entryPath: `M ${origin.x} ${origin.y} C ${entryControlA.x} ${entryControlA.y}, ${entryControlB.x} ${entryControlB.y}, ${entry.x} ${entry.y}`,
    minBoundaryPath,
    maxBoundaryPath,
    passagePath: optimumPath,
    exitPath: `M ${exitStart.x} ${exitStart.y} C ${exitControlA.x} ${exitControlA.y}, ${exitControlB.x} ${exitControlB.y}, ${exitTarget.x} ${exitTarget.y}`,
    corridorPath: `${outerPath} ${innerPath} Z`,
  }
}

function RoutePreviewDialog({
  section,
  previousSection,
  nextSection,
  planets,
  moons,
  onClose,
  onApply,
}: {
  section: RouteSectionDefinition
  previousSection: RouteSectionDefinition | null
  nextSection: RouteSectionDefinition | null
  planets: SolarSystemData['planets']
  moons: MoonCatalogue['moons']
  onClose: () => void
  onApply: (intent: RoutePreviewIntent) => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [instruction, setInstruction] = useState('')

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return undefined
    dialog.showModal()
    return () => {
      if (dialog.open) dialog.close()
    }
  }, [])

  const originName = routeObjectName(section.originId, planets, moons)
  const targetName = routeObjectName(section.targetId, planets, moons)
  const hasRouteContext = Boolean(previousSection || nextSection)
  const exitName = nextSection?.originId === section.targetId
    ? routeObjectName(nextSection.targetId, planets, moons)
    : hasRouteContext
      ? 'Routenende'
      : 'freier Austritt'
  const preview = routePreviewGeometry(section, nextSection)
  const passageText = section.passage.mode === 'full-orbit'
    ? 'volle Umrundung'
    : section.passage.mode === 'partial-orbit'
      ? `Teilumrundung ${section.passage.orbitAngleDeg.toFixed(0)}°`
      : 'direkte Passage'
  const applyInstruction = () => {
    const normalized = instruction.toLocaleLowerCase('de-DE')
    if (normalized.includes('asym')) onApply('asymptotic-entry')
    if (normalized.includes('tangent')) onApply('tangential-entry')
    if (normalized.includes('beschleun') || normalized.includes('erhöh')) onApply('accelerated-exit')
    if (normalized.includes('brems') || normalized.includes('retro')) onApply('braking-entry')
  }

  return (
    <dialog
      ref={dialogRef}
      className="route-preview-dialog"
      aria-labelledby="route-preview-title"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
    >
      <header>
        <div>
          <small>Abschnittsvorschau · Quelle für 3D</small>
          <h2 id="route-preview-title">{originName} → {targetName}</h2>
        </div>
        <button type="button" className="wizard-close" aria-label="Vorschau schließen" onClick={onClose}>×</button>
      </header>
      <div className="route-preview-content">
        <svg viewBox="0 0 1000 620" className="route-preview-canvas editor-layout" role="img" aria-label="Vorschau vom Ursprung bis Austritt">
          <defs>
            <marker id="route-preview-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
              <path d="M 0 0 L 8 4 L 0 8 Z" />
            </marker>
          </defs>
          <g className="corridor-coordinate-system" aria-hidden="true">
            <line x1="42" y1={preview.center.y} x2="965" y2={preview.center.y} className="coordinate-axis reference-plane" markerEnd="url(#route-preview-arrow)" />
            <line x1={preview.center.x} y1="586" x2={preview.center.x} y2="34" className="coordinate-axis" markerEnd="url(#route-preview-arrow)" />
            <text x="954" y={preview.center.y - 13} textAnchor="end" className="coordinate-axis-label">+x · Arbeitsachse</text>
            <text x={preview.center.x + 14} y="52" className="coordinate-axis-label">+z / +y · Korridorprojektion</text>
          </g>
          <text x="24" y="30" className="preview-note">Logische Abschnittsskizze · nicht maßstabsgetreu</text>
          <text x="24" y="50" className="preview-note">Startreferenz bleibt fix; Loop zeigt lokale Passage am Zielkörper</text>
          <circle cx={preview.origin.x} cy={preview.origin.y} r="22" className="preview-origin" />
          <text x={preview.origin.x} y={preview.origin.y + 44} textAnchor="middle">{originName}</text>
          <circle cx={preview.center.x} cy={preview.center.y} r={preview.radius} className="preview-target" />
          <text x={preview.center.x} y={preview.center.y + 7} textAnchor="middle">{targetName}</text>
          <text x={preview.center.x} y={preview.center.y + preview.radius + 28} textAnchor="middle" className="preview-note">lokal um {targetName}</text>
          <path d={preview.corridorPath} className="preview-corridor" />
          <path d={preview.minBoundaryPath} className="preview-min-boundary" />
          <path d={preview.maxBoundaryPath} className="preview-max-boundary" />
          <path d={preview.entryPath} className="preview-entry-path" />
          <path d={preview.passagePath} className="preview-passage-path" />
          {preview.hasLinkedExit && (
            <line
              x1={preview.center.x}
              y1={preview.center.y}
              x2={preview.exitTarget.x}
              y2={preview.exitTarget.y}
              className="preview-target-heading"
              markerEnd="url(#route-preview-arrow)"
            />
          )}
          <path d={preview.exitPath} className="preview-exit-path" />
          <circle cx={preview.entry.x} cy={preview.entry.y} r="5" className="preview-waypoint" />
          <circle cx={preview.exit.x} cy={preview.exit.y} r="5" className="preview-waypoint" />
          {preview.hasLinkedExit && <circle cx={preview.exitTarget.x} cy={preview.exitTarget.y} r="9" className="preview-exit-target" />}
          <text x={preview.entry.x - 8} y={preview.entry.y - 22} textAnchor="end">Eintritt</text>
          <text x={preview.exit.x + 12} y={preview.exit.y + 6}>Austritt → {exitName}</text>
          <text x={preview.entry.x + 18} y={preview.entry.y - 34} className="preview-note">Min</text>
          <text x={preview.exit.x + 16} y={preview.exit.y - 22} className="preview-note">Max</text>
          <text x={preview.center.x + 118} y={preview.center.y - 4} className="preview-note">Optimum</text>
        </svg>
        <dl className="route-preview-state">
          <div><dt>Passage</dt><dd>{passageText} · {section.passage.orbitDirection === 'prograde' ? 'prograd' : 'retrograd'}</dd></div>
          <div><dt>Eintritt</dt><dd>{BEHAVIOR_LABELS[section.passage.entryBehavior]}</dd></div>
          <div><dt>Austritt</dt><dd>{BEHAVIOR_LABELS[section.passage.exitBehavior]}</dd></div>
          <div><dt>Folgeziel</dt><dd>{exitName}</dd></div>
          <div><dt>Austrittswinkel</dt><dd>{preview.hasLinkedExit ? `${preview.exitAngleDeg.toFixed(1)}° gekoppelt` : 'frei'}</dd></div>
        </dl>
        <section className="route-preview-ai" aria-labelledby="route-preview-ai-title">
          <h3 id="route-preview-ai-title">Interaktiv verfeinern</h3>
          <div className="route-preview-chips">
            <button type="button" onClick={() => onApply('asymptotic-entry')}>Eintritt asymptotisch</button>
            <button type="button" onClick={() => onApply('tangential-entry')}>Eintritt tangential</button>
            <button type="button" onClick={() => onApply('accelerated-exit')}>Austritt beschleunigen</button>
            <button type="button" onClick={() => onApply('braking-entry')}>Eintritt bremsend</button>
          </div>
          <label>
            <span>KI-Anweisung</span>
            <textarea
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
              placeholder="z.B. Eintritt soll asymptotisch erfolgen, Austritt tangential beschleunigen"
            />
          </label>
          <button type="button" className="primary" onClick={applyInstruction}>Anweisung anwenden</button>
          <p>Diese Vorschau speichert die Passage direkt im Routenabschnitt. Die 3D-Gesamtberechnung verwendet dadurch denselben Abschnitt als Quelle.</p>
        </section>
      </div>
      <footer>
        <button type="button" className="primary" onClick={onClose}>Übernehmen</button>
      </footer>
    </dialog>
  )
}

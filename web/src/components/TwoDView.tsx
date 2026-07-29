import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react'
import * as THREE from 'three'

import type { EntryCorridorDefinition } from '../entryCorridorGeometry'
import { createOrbitPoints, planetPositionAt, toScenePosition } from '../orbitalMath'
import type { RouteBoundaryBehavior, RouteSectionDefinition } from '../routeSections'
import type { MoonCatalogue, SolarSystemData } from '../types'
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
  plannedRoute: WaypointRouteResult | null
}

const EXTENT = 30
const SIDE_HALF_HEIGHT = EXTENT * 7 / 16
const SIDE_LABEL_Y = [-6.6, 6.5, -4.7, 4.6, -2.8, 2.7, -7.9, 7.8]

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

function routeScenePosition(positionKm: [number, number, number]) {
  return toScenePosition(
    new THREE.Vector3(
      positionKm[0] / 149_597_870.7,
      positionKm[2] / 149_597_870.7,
      positionKm[1] / 149_597_870.7,
    ),
  )
}

export function TwoDView({
  routeSections,
  onRouteSectionsChange,
  activeRouteSectionId,
  onActiveRouteSectionChange,
  plannedMissionDate,
  plannedRoute,
}: TwoDViewProps) {
  const [data, setData] = useState<SolarSystemData | null>(null)
  const [moonCatalogue, setMoonCatalogue] = useState<MoonCatalogue | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [projection, setProjection] = useState<Projection>('corridor')
  const [selectedPlanetId, setSelectedPlanetId] = useState('earth')
  const [previewSectionId, setPreviewSectionId] = useState<string | null>(null)
  const todayTimestampMs = useMemo(() => Date.now(), [])

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
  const viewBox = orbitalProjection === 'top'
    ? `${-EXTENT} ${-EXTENT} ${EXTENT * 2} ${EXTENT * 2}`
    : `${-EXTENT} ${-SIDE_HALF_HEIGHT} ${EXTENT * 2} ${SIDE_HALF_HEIGHT * 2}`

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
        {projection !== 'corridor' && <output className={plannedMissionDate ? 'mission-epoch' : ''}>{epochLabel}</output>}
      </div>

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
              <div className={`plot-frame orbital-plot ${projection}`}>
                <svg
                  viewBox={viewBox}
                  role="group"
                  aria-label={orbitalProjection === 'top' ? 'Draufsicht der tatsächlichen Planetenbahnen' : 'Kantenansicht der tatsächlichen Bahnneigungen'}
                >
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
                        onClick={selectPlanet}
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
                  {plannedRoute?.routeSections?.map((section, index) => {
                    const entry = plannedRoutePoints[section.entryIndex]
                    const periapsis = plannedRoutePoints[section.periapsisIndex]
                    const exit = plannedRoutePoints[section.exitIndex]
                    if (!entry || !periapsis || !exit) return null
                    const [entryX, entryY] = project(entry, orbitalProjection)
                    const [periapsisX, periapsisY] = project(periapsis, orbitalProjection)
                    const [exitX, exitY] = project(exit, orbitalProjection)
                    return (
                      <g key={`route-state-${section.id}`} className="planned-route-states-2d">
                        <circle cx={entryX} cy={entryY} r=".18" className="entry" />
                        <circle cx={periapsisX} cy={periapsisY} r=".2" className="periapsis" />
                        <circle cx={exitX} cy={exitY} r=".18" className="exit" />
                        <text x={periapsisX + .35} y={periapsisY - .35}>
                          {String(index + 1).padStart(2, '0')} · {section.targetName}
                        </text>
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
    ?? objectId
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
  const returnsToOrigin = nextSection?.originId === section.targetId && nextSection.targetId === section.originId
  const hasLinkedExit = nextSection?.originId === section.targetId
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
      ? Math.max(45, Math.min(315, section.passage.orbitAngleDeg))
      : 0
  const directionSign = section.passage.orbitDirection === 'prograde' ? 1 : -1
  const loopEndAngle = entryAngle + directionSign * (requestedOrbitDeg * Math.PI / 180)
  const directExitAngle = entryAngle
  const exitAngle = section.passage.mode === 'direct' ? directExitAngle : loopEndAngle
  const corridorEndAngle = exitAngle
  const origin = { x: 105, y: center.y }
  const freeExitTarget = { x: 925, y: center.y }
  const exitTarget = nextSection?.originId === section.targetId
    ? (returnsToOrigin ? origin : freeExitTarget)
    : freeExitTarget
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
  const exitControlB = returnsToOrigin
    ? { x: origin.x + 210, y: center.y - (section.passage.exitBehavior.includes('tangential') ? 0 : 10) }
    : { x: exitTarget.x - 210, y: center.y - (section.passage.exitBehavior.includes('tangential') ? 0 : 10) }
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

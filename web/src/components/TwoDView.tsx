import {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react'
import * as THREE from 'three'

import type { EntryCorridorDefinition } from '../entryCorridorGeometry'
import { createOrbitPoints, planetPositionAt, toScenePosition } from '../orbitalMath'
import type { RouteSectionDefinition } from '../routeSections'
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
  const orbitalProjection: OrbitalProjection = projection === 'top' ? 'top' : 'side'
  const plannedRoutePoints = useMemo(
    () => plannedRoute?.trajectory.map((point) => routeScenePosition(point.positionKm)) ?? [],
    [plannedRoute],
  )
  const viewBox = orbitalProjection === 'top'
    ? `${-EXTENT} ${-EXTENT} ${EXTENT * 2} ${EXTENT * 2}`
    : `${-EXTENT} ${-SIDE_HALF_HEIGHT} ${EXTENT * 2} ${SIDE_HALF_HEIGHT * 2}`

  if (error) return <div className="status-message">{error}</div>
  if (!data || !activeRouteSection) return <div className="status-message">2D-Orbitalplaner wird geladen …</div>

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
  const suggestedOriginId = activeRouteSection.targetId
  const suggestedOriginIndex = data.planets.findIndex((planet) => planet.id === suggestedOriginId)
  const suggestedTargetId = suggestedOriginIndex >= 0
    ? data.planets[(suggestedOriginIndex + 1) % data.planets.length]?.id ?? 'earth'
    : suggestedOriginId === 'sun' ? data.planets[0]?.id ?? 'earth' : 'sun'
  const createSection = (section: RouteSectionDefinition) => {
    onRouteSectionsChange((current) => [...current, section])
    onActiveRouteSectionChange(section.id)
  }
  const deleteSection = (sectionId: string) => {
    if (routeSections.length === 1) return
    const deletedIndex = routeSections.findIndex((section) => section.id === sectionId)
    const nextActiveId = routeSections[deletedIndex + 1]?.id ?? routeSections[deletedIndex - 1]?.id
    onRouteSectionsChange((current) => current.filter((section) => section.id !== sectionId))
    if (sectionId === activeRouteSectionId && nextActiveId) onActiveRouteSectionChange(nextActiveId)
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
            <PlanetCorridorPlanner
              planets={data.planets}
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
            />
            <RouteSectionList
              planets={data.planets}
              sections={routeSections}
              activeSectionId={activeRouteSectionId}
              suggestedOriginId={suggestedOriginId}
              suggestedTargetId={suggestedTargetId === suggestedOriginId ? 'earth' : suggestedTargetId}
                onCreate={createSection}
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
    </section>
  )
}

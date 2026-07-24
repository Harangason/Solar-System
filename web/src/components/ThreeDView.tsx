import { GizmoHelper, GizmoViewport, Grid, PerformanceMonitor, Stars } from '@react-three/drei'
import { Canvas, type RootState } from '@react-three/fiber'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'

import { INTERSTELLAR_TARGETS } from '../interstellarTargets'
import { interstellarTargetPosition } from '../celestialCoordinates'
import { requestLaunchOptimization, type LaunchOptimizationResult } from '../launchOptimizer'
import { DEFAULT_MISSION_CONFIG, requestMissionSimulation } from '../missionSimulation'
import { planetPositionAt } from '../orbitalMath'
import { popSketchHistory, removeSketchSelection } from '../routeSketchState'
import type { MissionConfig, MissionResult, MoonCatalogue, MoonData, PlanetData, SolarSystemData, VisualConfig } from '../types'
import { MissionTrajectory } from './MissionTrajectory'
import { DirectSolarRoute, type DirectSolarRouteResult } from './DirectSolarRoute'
import { DraggableOverlayPanel } from './DraggableOverlayPanel'
import { FlybyFocusInset } from './FlybyFocusInset'
import { InterstellarTargets } from './InterstellarTargets'
import { MilkyWayBackground } from './MilkyWayBackground'
import { MoonSystem } from './MoonSystem'
import { Orbit } from './Orbit'
import { ParameterPanel } from './ParameterPanel'
import { PlanetCameraControls, type CameraFocusRequest } from './PlanetCameraControls'
import { PlannedWaypointRoute, type WaypointRouteResult } from './PlannedWaypointRoute'
import { PlanetMesh } from './PlanetMesh'
import { createRouteSketch, RoutePlanPreview, type RouteDrawTool, type RouteSketch, type RouteSketchSelection, type RouteTransformMode } from './RoutePlanPreview'
import { Sun, SUN_SCENE_RADIUS } from './Sun'

const DEFAULT_VISUAL_CONFIG: VisualConfig = {
  orbitScale: 5,
  inclinationScale: 1,
  planetScale: 1,
  smallPlanetScale: 1,
  giantPlanetScale: 1,
  probeScale: 8,
  saturnRingScale: 1,
  showPlanets: true,
  showOrbits: true,
  showTrajectory: true,
  showStages: true,
  showDetachedStages: true,
  showBurn: true,
  showSail: true,
  highlightSensorTethers: true,
  showLabels: false,
  showVectors: false,
  showForceVectors: false,
  showScaleNotice: true,
}

const WEBGL_RENDERER_OPTIONS: THREE.WebGLRendererParameters = {
  antialias: true,
  alpha: false,
  depth: true,
  stencil: false,
  logarithmicDepthBuffer: true,
  powerPreference: 'high-performance',
  precision: 'highp',
  preserveDrawingBuffer: false,
}

const WEBGL_CAMERA = { position: [46, 38, 58] as [number, number, number], fov: 48, near: 0.0001, far: 2_000 }
type AimpointRole = 'entry' | 'periapsis' | 'exit' | 'periapsis_point'

function scaledRadius(planet: PlanetData, sunRadiusKm: number, visual: VisualConfig) {
  return SUN_SCENE_RADIUS * (planet.radiusKm / sunRadiusKm) * visual.planetScale
}

function pointAtDay(result: MissionResult, elapsedDays: number) {
  const points = result.trajectory
  let low = 0
  let high = points.length - 1
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if (points[middle].elapsedDays <= elapsedDays) low = middle
    else high = middle - 1
  }
  return points[low]
}

function calendarDateAfterDays(startDate: string, elapsedDays: number) {
  return new Date(new Date(`${startDate}T00:00:00Z`).getTime() + elapsedDays * 86_400_000).toISOString().slice(0, 10)
}

function formatMissionDate(isoDate: string) {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString('de-DE', { timeZone: 'UTC' })
}

export function ThreeDView() {
  const [data, setData] = useState<SolarSystemData | null>(null)
  const [moonCatalogue, setMoonCatalogue] = useState<MoonCatalogue | null>(null)
  const [selectedPlanet, setSelectedPlanet] = useState<PlanetData | null>(null)
  const [selectedMoon, setSelectedMoon] = useState<MoonData | null>(null)
  const [selectedObject, setSelectedObject] = useState('earth')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [simulationError, setSimulationError] = useState<string | null>(null)
  const [visual, setVisual] = useState<VisualConfig>(DEFAULT_VISUAL_CONFIG)
  const [draft, setDraft] = useState<MissionConfig>(DEFAULT_MISSION_CONFIG)
  const [result, setResult] = useState<MissionResult | null>(null)
  const [elapsedDays, setElapsedDays] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [simulationSpeed, setSimulationSpeed] = useState(30)
  const [stepDays, setStepDays] = useState(1)
  const [showMoons, setShowMoons] = useState(true)
  const [navigationMode, setNavigationMode] = useState<'rotate' | 'pan'>('rotate')
  const [selectedTargetId, setSelectedTargetId] = useState('proxima-centauri')
  const [waypointId, setWaypointId] = useState('jupiter')
  const [encounterDay, setEncounterDay] = useState(730)
  const [flybyAltitudeKm, setFlybyAltitudeKm] = useState(100_000)
  const [flybyMode, setFlybyMode] = useState<'acceleration' | 'observation'>('acceleration')
  const [aimpointEnabled, setAimpointEnabled] = useState(false)
  const [aimpointClockAngleDeg, setAimpointClockAngleDeg] = useState(0)
  const [aimpointScreenRadiusNorm, setAimpointScreenRadiusNorm] = useState(1)
  const [aimpointAltitudeKm, setAimpointAltitudeKm] = useState(100_000)
  const [aimpointRole, setAimpointRole] = useState<AimpointRole>('periapsis')
  const [plannedRoute, setPlannedRoute] = useState<WaypointRouteResult | null>(null)
  const [routeError, setRouteError] = useState<string | null>(null)
  const [routeLoading, setRouteLoading] = useState(false)
  const [optimizationWindowDays, setOptimizationWindowDays] = useState(1_460)
  const [optimizationStartDate, setOptimizationStartDate] = useState(DEFAULT_MISSION_CONFIG.startDate)
  const [optimizationThreshold, setOptimizationThreshold] = useState(95)
  const [desiredSolarExitSpeedKmS, setDesiredSolarExitSpeedKmS] = useState(100)
  const [optimizationLoading, setOptimizationLoading] = useState(false)
  const [optimizationResult, setOptimizationResult] = useState<LaunchOptimizationResult | null>(null)
  const [autoReoptimize, setAutoReoptimize] = useState(false)
  const [recalculationMinutes, setRecalculationMinutes] = useState(5)
  const [showRouteDispersion, setShowRouteDispersion] = useState(false)
  const [dispersionWidth, setDispersionWidth] = useState(0.18)
  const [showRouteGuide, setShowRouteGuide] = useState(false)
  const [showAlternativeRoutes, setShowAlternativeRoutes] = useState(false)
  const [directSolarRoute, setDirectSolarRoute] = useState<DirectSolarRouteResult | null>(null)
  const [routePlanStatus, setRoutePlanStatus] = useState<'hidden' | 'review' | 'confirmed'>('hidden')
  const [routeSketch, setRouteSketch] = useState<RouteSketch | null>(null)
  const [routeDrawTool, setRouteDrawTool] = useState<RouteDrawTool>('move')
  const [routeTransformMode, setRouteTransformMode] = useState<RouteTransformMode>('translate')
  const [routeSketchSelection, setRouteSketchSelection] = useState<RouteSketchSelection>(null)
  const [routeSketchHistory, setRouteSketchHistory] = useState<RouteSketch[]>([])
  const [routeSketchDragging, setRouteSketchDragging] = useState(false)
  const routeSketchRef = useRef<RouteSketch | null>(null)
  const pendingRouteSketchRef = useRef<RouteSketch | null>(null)
  const routeSketchUpdateTimerRef = useRef<number | null>(null)
  const [rendererInfo, setRendererInfo] = useState<{ api: string; antialias: boolean; maxTextureSize: number } | null>(null)
  const [rendererDpr, setRendererDpr] = useState(1.2)
  const [rendererProfile, setRendererProfile] = useState<'stabil' | 'sparsam'>('stabil')
  const [activeInfoDrags, setActiveInfoDrags] = useState<Set<string>>(() => new Set())
  const [cameraFocusRequest, setCameraFocusRequest] = useState<CameraFocusRequest>({ kind: 'overview', view: 'perspective', requestId: 0 })

  const handleInfoDragChange = useCallback((label: string, active: boolean) => {
    setActiveInfoDrags((current) => {
      const next = new Set(current)
      if (active) next.add(label)
      else next.delete(label)
      return next
    })
  }, [])
  const overlayDragActive = activeInfoDrags.size > 0
  const selectedSketchCircle = routeSketchSelection && (routeSketchSelection.kind === 'circle' || routeSketchSelection.kind === 'circle-radius')
    ? routeSketch?.circles.find((circle) => circle.id === routeSketchSelection.id) ?? null
    : null

  const configureWebGLRenderer = useCallback(({ gl }: RootState) => {
    gl.outputColorSpace = THREE.SRGBColorSpace
    gl.toneMapping = THREE.ACESFilmicToneMapping
    gl.toneMappingExposure = 1.08
    gl.shadowMap.enabled = false
    const attributes = gl.getContext().getContextAttributes()
    setRendererInfo({
      api: gl.capabilities.isWebGL2 ? 'WebGL 2' : 'WebGL 1',
      antialias: Boolean(attributes?.antialias),
      maxTextureSize: gl.capabilities.maxTextureSize,
    })
  }, [])

  const reduceRendererLoad = useCallback(() => {
    setRendererDpr(1)
    setRendererProfile('sparsam')
  }, [])

  const restoreRendererQuality = useCallback(() => {
    setRendererDpr(1.2)
    setRendererProfile('stabil')
  }, [])

  useEffect(() => {
    routeSketchRef.current = routeSketch
  }, [routeSketch])

  const rememberRouteSketch = useCallback(() => {
    const current = routeSketchRef.current
    if (current) setRouteSketchHistory((history) => [...history, current].slice(-100))
  }, [])

  const flushPendingRouteSketch = useCallback(() => {
    if (routeSketchUpdateTimerRef.current !== null) {
      window.clearTimeout(routeSketchUpdateTimerRef.current)
      routeSketchUpdateTimerRef.current = null
    }
    const next = pendingRouteSketchRef.current
    pendingRouteSketchRef.current = null
    if (!next) return
    routeSketchRef.current = next
    setRouteSketch(next)
  }, [])

  const clearPendingRouteSketch = useCallback(() => {
    if (routeSketchUpdateTimerRef.current !== null) window.clearTimeout(routeSketchUpdateTimerRef.current)
    routeSketchUpdateTimerRef.current = null
    pendingRouteSketchRef.current = null
  }, [])

  const handleRouteSketchChange = useCallback((next: RouteSketch, recordHistory = false) => {
    if (recordHistory) {
      flushPendingRouteSketch()
      rememberRouteSketch()
      routeSketchRef.current = next
      setRouteSketch(next)
      return
    }
    routeSketchRef.current = next
    pendingRouteSketchRef.current = next
    if (routeSketchUpdateTimerRef.current === null) {
      routeSketchUpdateTimerRef.current = window.setTimeout(() => {
        routeSketchUpdateTimerRef.current = null
        const pending = pendingRouteSketchRef.current
        pendingRouteSketchRef.current = null
        if (pending) setRouteSketch(pending)
      }, 32)
    }
  }, [flushPendingRouteSketch, rememberRouteSketch])

  const handleRouteSketchEditingChange = useCallback((editing: boolean) => {
    if (editing) rememberRouteSketch()
    else flushPendingRouteSketch()
    setRouteSketchDragging(editing)
  }, [flushPendingRouteSketch, rememberRouteSketch])

  useEffect(() => clearPendingRouteSketch, [clearPendingRouteSketch])

  const playbackEndDay = plannedRoute?.totalFlightDays
    ?? plannedRoute?.trajectory.at(-1)?.elapsedDays
    ?? result?.summary.totalFlightDays
    ?? 0
  const canPlay = playbackEndDay > 0
  const activeStartDate = plannedRoute?.startDate ?? result?.config.startDate ?? draft.startDate

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      fetch('/api/solar-system', { signal: controller.signal }),
      fetch('/moons.json', { signal: controller.signal }),
    ])
      .then(async ([planetResponse, moonResponse]) => {
        if (!planetResponse.ok || !moonResponse.ok) throw new Error(`HTTP ${planetResponse.status}/${moonResponse.status}`)
        const [solarData, moonData] = await Promise.all([
          planetResponse.json() as Promise<SolarSystemData>,
          moonResponse.json() as Promise<MoonCatalogue>,
        ])
        return [solarData, moonData] as const
      })
      .then(([solarData, moonData]) => {
        setData(solarData)
        setMoonCatalogue(moonData)
        setSelectedPlanet(solarData.planets.find((planet) => planet.id === 'earth') ?? null)
      })
      .catch((requestError: Error) => {
        if (requestError.name !== 'AbortError') setLoadError(requestError.message)
      })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (!playing || !canPlay) return undefined
    const timer = window.setInterval(() => {
      setElapsedDays((current) => Math.min(playbackEndDay, current + simulationSpeed / 10))
    }, 100)
    return () => window.clearInterval(timer)
  }, [canPlay, playbackEndDay, playing, simulationSpeed])

  useEffect(() => {
    if (canPlay && elapsedDays >= playbackEndDay && playing) setPlaying(false)
  }, [canPlay, elapsedDays, playbackEndDay, playing])

  const selectedMoons = useMemo(
    () => selectedPlanet && moonCatalogue
      ? moonCatalogue.moons.filter((moon) => moon.parentId === selectedPlanet.id)
      : [],
    [moonCatalogue, selectedPlanet],
  )
  const currentPoint = useMemo(() => result ? pointAtDay(result, elapsedDays) : null, [elapsedDays, result])
  const currentRouteSegment = useMemo(() => {
    if (!plannedRoute?.segments?.length) return null
    const currentIndex = plannedRoute.trajectory.reduce(
      (selected, point, index) => point.elapsedDays <= elapsedDays ? index : selected,
      0,
    )
    return plannedRoute.segments.find((segment) => currentIndex >= segment.startIndex && currentIndex <= segment.endIndex)
      ?? plannedRoute.segments.at(-1)
      ?? null
  }, [elapsedDays, plannedRoute])
  const encounterPlanetRadius = useMemo(() => {
    if (!data) return 0.01
    const planet = data.planets.find((candidate) => candidate.id === waypointId)
    return planet ? scaledRadius(planet, data.sun.radiusKm, visual) : 0.01
  }, [data, visual, waypointId])
  const selectedTarget = INTERSTELLAR_TARGETS.find((target) => target.id === selectedTargetId)
  const timestampMs = new Date(activeStartDate).getTime() + elapsedDays * 86_400_000
  const focusedPlanet = cameraFocusRequest.kind === 'planet'
    ? data?.planets.find((planet) => planet.id === cameraFocusRequest.planetId) ?? null
    : null
  const focusedPlanetPosition = useMemo(
    () => focusedPlanet
      ? planetPositionAt(focusedPlanet, timestampMs, visual.orbitScale, visual.inclinationScale)
      : null,
    [focusedPlanet, timestampMs, visual.inclinationScale, visual.orbitScale],
  )
  const focusedPlanetRadius = focusedPlanet && data
    ? scaledRadius(focusedPlanet, data.sun.radiusKm, visual)
    : 0.01
  const selectedTargetScenePosition = useMemo(() => {
    if (!selectedTarget) return undefined
    const cataloguePosition = interstellarTargetPosition(selectedTarget)
    const catalogueDistance = cataloguePosition.length()
    const displayDirection = cataloguePosition.normalize()
    displayDirection.y *= visual.inclinationScale
    displayDirection.normalize()
    // A catalogue target is a fixed sky direction. It must not jump when the
    // optimizer recommends another route or when a propagated preview ends.
    return displayDirection.multiplyScalar(catalogueDistance)
  }, [selectedTarget, visual.inclinationScale])
  const routePlanNodes = useMemo(() => {
    if (!data || !selectedTargetScenePosition) return null
    const earth = data.planets.find((planet) => planet.id === 'earth')
    const waypointPlanet = data.planets.find((planet) => planet.id === waypointId)
    if (!earth || !waypointPlanet) return null
    const activeStartDate = optimizationResult?.alternatives.gravityAssist.startDate ?? draft.startDate
    const activeEncounterDay = optimizationResult?.optimizedEncounterDay ?? encounterDay
    const startTimestamp = new Date(`${activeStartDate}T00:00:00Z`).getTime()
    return {
      earth: planetPositionAt(earth, startTimestamp, visual.orbitScale, visual.inclinationScale),
      sun: new THREE.Vector3(0, 0, 0),
      waypoint: planetPositionAt(waypointPlanet, startTimestamp + activeEncounterDay * 86_400_000, visual.orbitScale, visual.inclinationScale),
      target: selectedTargetScenePosition,
      waypointId: waypointPlanet.id,
      waypointName: waypointPlanet.name,
      waypointColor: waypointPlanet.color,
      waypointRadius: scaledRadius(waypointPlanet, data.sun.radiusKm, visual),
      encounterDay: activeEncounterDay,
      encounterDate: optimizationResult?.optimizedEncounterDate ?? calendarDateAfterDays(activeStartDate, activeEncounterDay),
    }
  }, [data, draft.startDate, encounterDay, optimizationResult, selectedTargetScenePosition, visual.inclinationScale, visual.orbitScale, visual.planetScale, waypointId])
  const requestedPlanNodes = useMemo(() => {
    if (!data || !optimizationResult) return undefined
    if (!optimizationResult.planComparison.startDateChanged && !optimizationResult.planComparison.encounterDayChanged) return undefined
    const earth = data.planets.find((planet) => planet.id === 'earth')
    const waypointPlanet = data.planets.find((planet) => planet.id === waypointId)
    if (!earth || !waypointPlanet) return undefined
    const requestedStartDate = optimizationResult.requestedPlan.startDate
    const requestedEncounterDay = optimizationResult.requestedPlan.encounterDay
    const requestedTimestamp = new Date(`${requestedStartDate}T00:00:00Z`).getTime()
    return {
      earth: planetPositionAt(earth, requestedTimestamp, visual.orbitScale, visual.inclinationScale),
      waypoint: planetPositionAt(waypointPlanet, requestedTimestamp + requestedEncounterDay * 86_400_000, visual.orbitScale, visual.inclinationScale),
      startDate: requestedStartDate,
      encounterDay: requestedEncounterDay,
      encounterDate: optimizationResult.requestedPlan.encounterDate,
    }
  }, [data, optimizationResult, visual.inclinationScale, visual.orbitScale, waypointId])

  const invalidateRoutePlan = () => {
    clearPendingRouteSketch()
    setRoutePlanStatus('hidden')
    setRouteSketch(null)
    routeSketchRef.current = null
    setRouteSketchHistory([])
    setRouteSketchSelection(null)
    setRouteDrawTool('move')
    setRouteTransformMode('translate')
    setRouteSketchDragging(false)
  }

  const freshRouteSketch = () => routePlanNodes ? createRouteSketch(routePlanNodes) : null
  const beginRouteReview = () => {
    const sketch = freshRouteSketch()
    if (!sketch) return
    clearPendingRouteSketch()
    setRouteSketch(sketch)
    routeSketchRef.current = sketch
    setRouteSketchHistory([])
    setRouteSketchSelection(null)
    setRouteDrawTool('move')
    setRouteTransformMode('translate')
    setRouteSketchDragging(false)
    setRoutePlanStatus('review')
    setPlannedRoute(null)
    setDirectSolarRoute(null)
    setOptimizationResult(null)
    setRouteError(null)
  }
  const resetRouteSketch = () => {
    const next = freshRouteSketch()
    if (next) handleRouteSketchChange(next, true)
    setRouteSketchSelection(null)
    setRouteDrawTool('move')
    setRouteTransformMode('translate')
  }
  const discardRouteSketch = () => {
    clearPendingRouteSketch()
    setRoutePlanStatus('hidden')
    setRouteSketch(null)
    routeSketchRef.current = null
    setRouteSketchHistory([])
    setRouteSketchSelection(null)
    setRouteDrawTool('move')
    setRouteTransformMode('translate')
    setRouteSketchDragging(false)
  }
  const removeLastSketchElement = () => {
    const current = routeSketchRef.current
    if (!current) return
    let next = current
    if (current.lines.length > 0) next = { ...current, lines: current.lines.slice(0, -1) }
    else if (current.circles.length > 2) next = { ...current, circles: current.circles.slice(0, -1) }
    else {
      const lastControl = [...current.nodes].reverse().find((node) => !node.locked)
      if (lastControl) next = { ...current, nodes: current.nodes.filter((node) => node.id !== lastControl.id) }
    }
    if (next !== current) {
      handleRouteSketchChange(next, true)
      setRouteSketchSelection(null)
    }
  }

  const undoRouteSketch = useCallback(() => {
    const { previous, remaining } = popSketchHistory(routeSketchHistory)
    if (!previous) return
    routeSketchRef.current = previous
    setRouteSketch(previous)
    setRouteSketchHistory(remaining)
    setRouteSketchSelection(null)
    setRouteSketchDragging(false)
  }, [routeSketchHistory])

  const deleteSelectedSketchElement = useCallback(() => {
    const current = routeSketchRef.current
    const selection = routeSketchSelection
    if (!current || !selection) return
    const next = removeSketchSelection(current, selection)
    if (next !== current) handleRouteSketchChange(next, true)
    setRouteSketchSelection(null)
  }, [handleRouteSketchChange, routeSketchSelection])

  const setSelectedCircleRotationDeg = useCallback((axis: 0 | 1 | 2, degrees: number, relative = false) => {
    const current = routeSketchRef.current
    const selection = routeSketchSelection
    if (!current || !selection || (selection.kind !== 'circle' && selection.kind !== 'circle-radius') || !Number.isFinite(degrees)) return
    const selectedCircle = current.circles.find((circle) => circle.id === selection.id)
    if (!selectedCircle) return
    const rotation: [number, number, number] = [...selectedCircle.rotation]
    rotation[axis] = relative ? rotation[axis] + THREE.MathUtils.degToRad(degrees) : THREE.MathUtils.degToRad(degrees)
    handleRouteSketchChange({
      ...current,
      circles: current.circles.map((circle) => circle.id === selection.id ? { ...circle, rotation } : circle),
    }, true)
  }, [handleRouteSketchChange, routeSketchSelection])

  useEffect(() => {
    if (routePlanStatus !== 'review') return undefined
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.isContentEditable || target?.matches('input, textarea, select')) return
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        undoRouteSketch()
      } else if (event.key === 'Delete') {
        event.preventDefault()
        deleteSelectedSketchElement()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [deleteSelectedSketchElement, routePlanStatus, undoRouteSketch])

  const selectPlanet = (planet: PlanetData) => {
    setSelectedPlanet(planet)
    setSelectedObject(planet.id)
    setSelectedMoon(null)
    setCameraFocusRequest((current) => ({ kind: 'planet', planetId: planet.id, requestId: current.requestId + 1 }))
    if (planet.id !== 'earth') {
      setWaypointId(planet.id)
      invalidateRoutePlan()
      setPlannedRoute(null)
      setDirectSolarRoute(null)
      setOptimizationResult(null)
    }
  }
  const focusSelectedPlanet = () => {
    if (!selectedPlanet) return
    setCameraFocusRequest((current) => ({ kind: 'planet', planetId: selectedPlanet.id, requestId: current.requestId + 1 }))
  }
  const showSystemOverview = (view: 'perspective' | 'top' | 'front' | 'side' = 'perspective') => {
    setCameraFocusRequest((current) => ({ kind: 'overview', view, requestId: current.requestId + 1 }))
  }
  const selectInterstellarTarget = (targetId: string) => {
    setSelectedTargetId(targetId)
    invalidateRoutePlan()
    setPlannedRoute(null)
    setDirectSolarRoute(null)
    setOptimizationResult(null)
    clearPendingRouteSketch()
  }
  const applySimulation = async () => {
    try {
      setPlaying(false)
      setSimulationError(null)
      const nextResult = await requestMissionSimulation(draft)
      setResult(nextResult)
      setElapsedDays(0)
      setPlaying(false)
      setSimulationError(null)
    } catch (error) {
      setSimulationError(error instanceof Error ? error.message : 'Simulation fehlgeschlagen.')
    }
  }
  const aimpointPayload = useMemo(() => ({
    enabled: aimpointEnabled,
    clockAngleDeg: aimpointClockAngleDeg,
    screenRadiusNorm: aimpointScreenRadiusNorm,
    role: aimpointRole === 'periapsis_point' ? 'periapsis' : aimpointRole,
    altitudeKm: aimpointAltitudeKm,
  }), [
    aimpointEnabled,
    aimpointClockAngleDeg,
    aimpointScreenRadiusNorm,
    aimpointRole,
    aimpointAltitudeKm,
  ])
  const calculateWaypointRoute = async () => {
    if (!selectedTarget) {
      setRouteError('Bitte zuerst ein interstellares Ziel wählen.')
      return
    }
    setRouteLoading(true)
    setRouteError(null)
    setDirectSolarRoute(null)
    setOptimizationResult(null)
    try {
      const response = await fetch('/api/route/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mission: draft,
          visual,
          waypointId,
          encounterDay,
          flybyAltitudeKm,
          flybyMode,
          targetRightAscensionDeg: selectedTarget.rightAscensionDeg,
          targetDeclinationDeg: selectedTarget.declinationDeg,
          desiredSolarExitSpeedKmS,
          flybyAimpoint: aimpointPayload,
          routeSketch,
        }),
      })
      const payload = await response.json() as WaypointRouteResult | { error?: string }
      if (!response.ok || 'error' in payload) throw new Error('error' in payload ? payload.error : `HTTP ${response.status}`)
      setPlannedRoute(payload as WaypointRouteResult)
      setElapsedDays((payload as WaypointRouteResult).trajectory[0]?.elapsedDays ?? 0)
      setPlaying(false)
      setSelectedObject('probe')
    } catch (error) {
      setPlannedRoute(null)
      setRoutePlanStatus('review')
      setRouteDrawTool('move')
      setRouteError(error instanceof Error ? error.message : 'Routenberechnung fehlgeschlagen.')
    } finally {
      setRouteLoading(false)
    }
  }
  const optimizeLaunchWindow = async () => {
    if (routePlanStatus !== 'confirmed') {
      setRouteError('Bitte zuerst den Hilfslinienplan prüfen und bestätigen.')
      return
    }
    if (!selectedTarget || optimizationLoading) {
      if (!selectedTarget) setRouteError('Bitte zuerst ein interstellares Ziel wählen.')
      return
    }
    setOptimizationLoading(true)
    setRouteError(null)
    try {
      const optimized = await requestLaunchOptimization({
        mission: draft,
        waypointId,
        encounterDay,
        flybyAltitudeKm,
        flybyMode,
        flybyAimpoint: aimpointPayload,
        targetRightAscensionDeg: selectedTarget.rightAscensionDeg,
        targetDeclinationDeg: selectedTarget.declinationDeg,
        desiredSolarExitSpeedKmS,
        searchStartDate: optimizationStartDate,
        searchWindowDays: optimizationWindowDays,
        confidenceThresholdPct: optimizationThreshold,
        maxIterations: 40,
        maxFullValidations: 8,
      })
      setOptimizationResult(optimized)
      // Feed the converged boundary values back into the three coupled input
      // parameters. The result still retains the original requested plan for
      // comparison and audit, while a following run continues from the found
      // basin instead of restarting at the old date.
      setEncounterDay(optimized.optimizedEncounterDay)
      setOptimizationStartDate(optimized.optimizedStartDate)
      setOptimizationWindowDays(optimized.optimizedSearchWindowDays)
      setDraft((current) => ({ ...current, startDate: optimized.optimizedStartDate }))
      // The visible primary route is the gravity-assist route, so its epoch
      // and mission context must also drive the moving planets and HUD.
      setResult(optimized.mission)
      setPlannedRoute(optimized.route)
      setDirectSolarRoute(optimized.alternatives.directSolar.route)
      setElapsedDays(0)
      setPlaying(false)
      setSelectedObject('probe')
    } catch (error) {
      setRouteError(error instanceof Error ? error.message : 'Startfenster-Optimierung fehlgeschlagen.')
    } finally {
      setOptimizationLoading(false)
    }
  }

  useEffect(() => {
    if (!autoReoptimize) return undefined
    const timer = window.setInterval(() => { void optimizeLaunchWindow() }, Math.max(1, recalculationMinutes) * 60_000)
    return () => window.clearInterval(timer)
  }, [
    autoReoptimize,
    draft,
    desiredSolarExitSpeedKmS,
    encounterDay,
    flybyAltitudeKm,
    flybyMode,
    optimizationStartDate,
    aimpointClockAngleDeg,
    aimpointEnabled,
    aimpointRole,
    aimpointScreenRadiusNorm,
    aimpointAltitudeKm,
    optimizationThreshold,
    optimizationWindowDays,
    recalculationMinutes,
    selectedTargetId,
    visual,
    waypointId,
  ])
  const resetAll = () => {
    clearPendingRouteSketch()
    const defaults = { ...DEFAULT_MISSION_CONFIG, startDate: new Date().toISOString().slice(0, 10) }
    setDraft(defaults)
    setOptimizationStartDate(defaults.startDate)
    setDesiredSolarExitSpeedKmS(100)
    setVisual(DEFAULT_VISUAL_CONFIG)
    setResult(null)
    setPlannedRoute(null)
    setDirectSolarRoute(null)
    setOptimizationResult(null)
    setRoutePlanStatus('hidden')
    setRouteSketch(null)
    routeSketchRef.current = null
    setRouteSketchHistory([])
    setRouteSketchSelection(null)
    setRouteDrawTool('move')
    setRouteTransformMode('translate')
    setRouteSketchDragging(false)
    setElapsedDays(0)
    setPlaying(false)
    setSimulationError(null)
  }

  if (loadError) return <p className="status-message">3D-Daten konnten nicht geladen werden: {loadError}</p>
  if (!data || !moonCatalogue) return <p className="status-message">Planeten- und Monddaten werden geladen …</p>

  return (
    <section className="three-d-layout mission-layout" aria-label="Interaktives Planeten- und Missionsmodell">
      <div className={`scene-wrap navigation-${navigationMode}`}>
        <Canvas
          camera={WEBGL_CAMERA}
          dpr={rendererDpr}
          gl={WEBGL_RENDERER_OPTIONS}
          onCreated={configureWebGLRenderer}
          fallback={<div className="webgl-fallback">WebGL konnte nicht initialisiert werden. Bitte Hardwarebeschleunigung im Browser aktivieren.</div>}
        >
          <color attach="background" args={['#02050d']} />
          <fog attach="fog" args={['#02050d', 95, 240]} />
          <PerformanceMonitor flipflops={3} onDecline={reduceRendererLoad} onIncline={restoreRendererQuality} onFallback={reduceRendererLoad} />
          <ambientLight intensity={0.18} />
          <hemisphereLight args={['#8fcfff', '#09030f', 0.22]} />
          <Stars radius={120} depth={60} count={2200} factor={3} saturation={0.25} fade speed={0.3} />
          <MilkyWayBackground />
          {routePlanStatus === 'review' && <Grid
            args={[180, 180]}
            position={[0, -0.025, 0]}
            cellSize={1}
            cellThickness={0.35}
            cellColor="#18334c"
            sectionSize={5}
            sectionThickness={0.7}
            sectionColor="#315f7e"
            fadeDistance={90}
            fadeStrength={1.4}
            side={THREE.DoubleSide}
          />}
          <Sun sun={data.sun} sizeScale={visual.planetScale} />
          <InterstellarTargets
            targets={INTERSTELLAR_TARGETS}
            selectedId={selectedTargetId}
            onSelect={(target) => selectInterstellarTarget(target.id)}
            guideStart={routePlanNodes?.earth}
            selectedPositionOverride={selectedTargetScenePosition}
            hideGuide={Boolean(routePlanStatus !== 'hidden' || (showRouteGuide && (plannedRoute || directSolarRoute)))}
            onInfoDragChange={handleInfoDragChange}
          />
          {routePlanStatus !== 'hidden' && !plannedRoute && routePlanNodes && routeSketch && (
            <RoutePlanPreview
              {...routePlanNodes}
              requestedPlan={requestedPlanNodes}
              confirmed={routePlanStatus === 'confirmed'}
              sketch={routeSketch}
              drawTool={routeDrawTool}
              transformMode={routeTransformMode}
              selection={routeSketchSelection}
              editable={routePlanStatus === 'review'}
              onSketchChange={handleRouteSketchChange}
              onSelectionChange={setRouteSketchSelection}
              onEditingChange={handleRouteSketchEditingChange}
            />
          )}
          {data.planets.map((planet) => {
            const size = scaledRadius(planet, data.sun.radiusKm, visual)
            return (
              <group key={planet.id}>
                {visual.showOrbits && <Orbit planet={planet} distanceScale={visual.orbitScale} inclinationScale={visual.inclinationScale} />}
                {visual.showPlanets && (
                  <Suspense fallback={null}>
                    <PlanetMesh
                      planet={planet}
                      size={size}
                      timestampMs={timestampMs}
                      distanceScale={visual.orbitScale}
                      inclinationScale={visual.inclinationScale}
                      ringScale={visual.saturnRingScale}
                      showLabels={visual.showLabels}
                      onSelect={selectPlanet}
                    />
                  </Suspense>
                )}
                {showMoons && visual.showPlanets && selectedPlanet?.id === planet.id && selectedMoons.length > 0 && (
                  <MoonSystem
                    moons={selectedMoons}
                    planet={planet}
                    planetSize={size}
                    timestampMs={timestampMs}
                    distanceScale={visual.orbitScale}
                    inclinationScale={visual.inclinationScale}
                    onSelectMoon={setSelectedMoon}
                  />
                )}
              </group>
            )
          })}
          {result && !plannedRoute && <MissionTrajectory result={result} elapsedDays={elapsedDays} visual={visual} />}
          {plannedRoute && <PlannedWaypointRoute route={plannedRoute} orbitScale={visual.orbitScale} inclinationScale={visual.inclinationScale} elapsedDays={elapsedDays} showDispersion={showRouteDispersion} dispersionWidth={dispersionWidth} showNavigationGuide={showRouteGuide} encounterBodyRadius={encounterPlanetRadius} probeScale={visual.probeScale} targetPosition={selectedTargetScenePosition} onInfoDragChange={handleInfoDragChange} />}
          {showAlternativeRoutes && directSolarRoute && <DirectSolarRoute route={directSolarRoute} orbitScale={visual.orbitScale} inclinationScale={visual.inclinationScale} showNavigationGuide={showRouteGuide && routePlanStatus === 'hidden'} targetPosition={selectedTargetScenePosition} onInfoDragChange={handleInfoDragChange} />}
          <PlanetCameraControls
            request={cameraFocusRequest}
            focusPosition={focusedPlanetPosition}
            focusRadius={focusedPlanetRadius}
            navigationMode={navigationMode}
            enabled={!overlayDragActive && !routeSketchDragging && (routePlanStatus !== 'review' || routeDrawTool === 'move')}
          />
          <GizmoHelper alignment="bottom-right" margin={[86, 86]}>
            <GizmoViewport axisColors={['#ff5a67', '#72ff8f', '#68a8ff']} labelColor="#07101d" labels={['X', 'Y', 'Z']} />
          </GizmoHelper>
        </Canvas>

        {plannedRoute && <FlybyFocusInset route={plannedRoute} elapsedDays={elapsedDays} />}

        <div className="webgl-renderer-status" aria-live="polite" title={rendererInfo ? `Maximale Texturgröße ${rendererInfo.maxTextureSize}px` : 'Renderer wird initialisiert'}>
          <span aria-hidden="true" />
          <strong>{rendererInfo?.api ?? 'WebGL'}</strong>
          <small>{rendererInfo ? `${rendererProfile === 'stabil' ? 'Stabilprofil' : 'Sparprofil'} · DPR ${rendererDpr.toFixed(1)} · AA ${rendererInfo.antialias ? 'an' : 'aus'} · ACES` : 'initialisiert …'}</small>
        </div>

        <div className="mission-hud">
          {plannedRoute ? <>
            <span className={`mission-status ${plannedRoute.summary.solarDepartureInjectionApplied ? 'success' : 'warning'}`}>{plannedRoute.summary.solarDepartureInjectionApplied ? 'ROUTE' : 'SOLLROUTE'}</span>
            <strong>{currentRouteSegment?.label ?? 'Wegpunktroute'}</strong>
            <span>Tag {elapsedDays.toFixed(1)} / {playbackEndDay.toFixed(0)}</span>
          </> : result && currentPoint ? <>
            <span className={`mission-status ${result.summary.status.toLowerCase()}`}>{result.summary.status}</span>
            <strong>{currentPoint.phase.replaceAll('_', ' ')}</strong>
            <span>Tag {elapsedDays.toFixed(1)} / {result.summary.totalFlightDays.toFixed(0)}</span>
          </> : <>
            <span className="mission-status">BEREIT</span>
            <strong>Noch keine Satellitenbahn berechnet</strong>
            <span>Parameter einstellen und Simulation starten</span>
          </>}
        </div>
        <div className="time-controls" role="group" aria-label="Schnellsteuerung">
          <button className={playing ? 'active' : ''} type="button" disabled={!canPlay} onClick={() => setPlaying((active) => !active)}>{playing ? 'Pause' : 'Mission abspielen'}</button>
          <button className={showMoons ? 'active' : ''} type="button" aria-pressed={showMoons} onClick={() => setShowMoons((visible) => !visible)}>Monde · {showMoons ? 'an' : 'aus'}</button>
          <button type="button" disabled={!canPlay} onClick={() => setSelectedObject('probe')}>Sonde</button>
          <button className={navigationMode === 'pan' ? 'active' : ''} type="button" aria-pressed={navigationMode === 'pan'} onClick={() => setNavigationMode('pan')}>Ziehen</button>
          <button className={navigationMode === 'rotate' ? 'active' : ''} type="button" aria-pressed={navigationMode === 'rotate'} onClick={() => setNavigationMode('rotate')}>Drehen</button>
        </div>
        <DraggableOverlayPanel
          className="target-controls"
          ariaLabel="Missionsplanung und KI-Navigation"
          draggable={false}
          header={<div className="target-panel-title"><strong>Missionsplanung</strong><small>{selectedTarget?.name ?? 'Kein interstellares Ziel'} → {data.planets.find((planet) => planet.id === waypointId)?.name ?? waypointId}</small></div>}
        >
          <div className="target-controls-body">
          <details className="target-control-section" open>
            <summary><span>Ziel, Vorbeiflug & KI-Optimierung</span><small>{optimizationLoading ? 'KI rechnet …' : optimizationResult ? `${optimizationResult.minimumConfidencePct.toFixed(1)} %` : routePlanStatus === 'confirmed' ? 'Plan bestätigt' : 'Planung'}</small></summary>
            <div className="target-control-section-content">
          <label>
            <span>Interstellares Ziel</span>
            <select value={selectedTargetId} onChange={(event) => selectInterstellarTarget(event.target.value)}>
              <option value="">Kein Ziel</option>
              <optgroup label="Nahe Sternsysteme">
                {INTERSTELLAR_TARGETS.filter((target) => target.kind === 'stellar-system').map((target) => (
                  <option key={target.id} value={target.id}>{target.name} · {target.distanceLy.toLocaleString('de-DE')} Lj</option>
                ))}
              </optgroup>
              <optgroup label="Milchstraße">
                {INTERSTELLAR_TARGETS.filter((target) => target.kind === 'galactic-center').map((target) => (
                  <option key={target.id} value={target.id}>{target.name} · {target.distanceLy.toLocaleString('de-DE')} Lj</option>
                ))}
              </optgroup>
            </select>
          </label>
          {selectedTarget && <span>RA {selectedTarget.rightAscensionDeg.toFixed(2)}° · Dec {selectedTarget.declinationDeg.toFixed(2)}° · Klickbare Zielmarke im View</span>}
          <label>
            <span>Wegpunkt</span>
            <select value={waypointId} onChange={(event) => { setWaypointId(event.target.value); invalidateRoutePlan(); setPlannedRoute(null); setDirectSolarRoute(null); setOptimizationResult(null) }}>
              {data.planets.filter((planet) => planet.id !== 'earth').map((planet) => <option key={planet.id} value={planet.id}>{planet.name}</option>)}
            </select>
          </label>
          <label><span>Erste Begegnungsschätzung (Missionstag)</span><input type="number" min="500" max="7305" step="1" value={encounterDay} onChange={(event) => { setEncounterDay(event.target.valueAsNumber); invalidateRoutePlan(); setPlannedRoute(null) }} /></label>
          <span>Dieser Tag ist nur der Startwert der Suche. Das tatsächliche Begegnungsdatum wird aus Startfenster und Flugzeit berechnet.</span>
          <label><span>Vorbeiflughöhe</span><input type="number" min="100" step="1000" value={flybyAltitudeKm} onChange={(event) => { setFlybyAltitudeKm(event.target.valueAsNumber); invalidateRoutePlan(); setPlannedRoute(null) }} /></label>
          <label>
            <span>Vorbeiflugprofil</span>
            <select value={flybyMode} onChange={(event) => { setFlybyMode(event.target.value as 'acceleration' | 'observation'); invalidateRoutePlan(); setPlannedRoute(null) }}>
              <option value="acceleration">Beschleunigung maximieren</option>
              <option value="observation">Beobachtung / Zielkurs</option>
            </select>
          </label>
          {routePlanStatus === 'hidden' && <button type="button" disabled={routeLoading || !selectedTarget} onClick={beginRouteReview}>Routenentwurf öffnen</button>}
          {routePlanStatus === 'review' && routeSketch && <div className="route-alternatives route-sketch-controls">
            <strong>Routenentwurf Erde → Sonne → {routePlanNodes?.waypointName ?? 'Wegpunkt'} → Ziel</strong>
            <span className="route-ok">Die gelben, gesperrten Anker liegen exakt auf Erde, Sonne, {routePlanNodes?.waypointName ?? 'Wegpunkt'} am Begegnungstag und Ziel.</span>
            <div className="route-sketch-toolbar" aria-label="Zeichenwerkzeuge">
              <button className={routeDrawTool === 'move' ? 'selected' : ''} type="button" onClick={() => setRouteDrawTool('move')}>Auswählen</button>
              <button className={routeDrawTool === 'route-point' ? 'selected' : ''} type="button" onClick={() => { setRouteDrawTool('route-point'); setRouteSketchSelection(null) }}>Stützpunkt</button>
              <button className={routeDrawTool === 'line' ? 'selected' : ''} type="button" onClick={() => { setRouteDrawTool('line'); setRouteSketchSelection(null) }}>Linie</button>
              <button className={routeDrawTool === 'radius' ? 'selected' : ''} type="button" onClick={() => { setRouteDrawTool('radius'); setRouteSketchSelection(null) }}>Radius/Kreis</button>
            </div>
            <div className="route-sketch-toolbar route-transform-toolbar" aria-label="3D-Transformation">
              <button className={routeDrawTool === 'move' && routeTransformMode === 'translate' ? 'selected' : ''} type="button" onClick={() => { setRouteDrawTool('move'); setRouteTransformMode('translate') }}>3D verschieben</button>
              <button className={routeDrawTool === 'move' && routeTransformMode === 'rotate' ? 'selected' : ''} type="button" onClick={() => { setRouteDrawTool('move'); setRouteTransformMode('rotate') }}>Kreis 3D drehen</button>
            </div>
            <span>Element oder Griff anklicken und an den roten, grünen oder blauen Achsen bewegen. Bei Kreisen schaltet „Kreis 3D drehen“ auf räumliche Rotation; der helle Außengriff ändert den Radius.</span>
            <span className={routeSketchSelection ? 'route-ok' : ''}>{routeSketchSelection ? `Ausgewählt: ${routeSketchSelection.kind === 'node' ? 'Stützpunkt' : routeSketchSelection.kind.startsWith('line') ? 'Linie' : routeSketchSelection.kind === 'circle-radius' ? 'Kreisradius' : 'Kreis'}` : 'Kein Element ausgewählt'} · Strg+Z: rückgängig · Entf: Auswahl löschen</span>
            {selectedSketchCircle && <div className="circle-orientation-controls">
              <strong>Kreisausrichtung im Raum</strong>
              {(['X', 'Y', 'Z'] as const).map((axis, index) => <label key={axis}>
                <span>{axis}-Winkel</span>
                <input
                  type="number"
                  step="1"
                  value={THREE.MathUtils.radToDeg(selectedSketchCircle.rotation?.[index] ?? 0).toFixed(1)}
                  onChange={(event) => setSelectedCircleRotationDeg(index as 0 | 1 | 2, event.target.valueAsNumber)}
                />
                <span>°</span>
              </label>)}
              <div className="route-sketch-secondary-actions">
                <button type="button" onClick={() => setSelectedCircleRotationDeg(0, 15, true)}>X +15°</button>
                <button type="button" onClick={() => setSelectedCircleRotationDeg(1, 15, true)}>Y +15°</button>
                <button type="button" onClick={() => setSelectedCircleRotationDeg(2, 15, true)}>Z +15°</button>
                <button type="button" onClick={() => {
                  const current = routeSketchRef.current
                  if (!current) return
                  handleRouteSketchChange({ ...current, circles: current.circles.map((circle) => circle.id === selectedSketchCircle.id ? { ...circle, rotation: [0, 0, 0] } : circle) }, true)
                }}>Winkel nullen</button>
              </div>
            </div>}
            <span>{routeSketch.nodes.filter((node) => !node.locked).length} Stützpunkte · {routeSketch.lines.length} Hilfslinien · {routeSketch.circles.length} Radien</span>
            <div className="route-sketch-secondary-actions">
              <button type="button" disabled={routeSketchHistory.length === 0} onClick={undoRouteSketch}>Rückgängig · Strg+Z</button>
              <button type="button" disabled={!routeSketchSelection} onClick={deleteSelectedSketchElement}>Auswahl löschen · Entf</button>
              <button type="button" onClick={removeLastSketchElement}>Letztes Element entfernen</button>
              <button type="button" onClick={resetRouteSketch}>Entwurf zurücksetzen</button>
            </div>
            <span>Der Entwurf verändert die visuelle Führung. Die anschließend berechnete Nominalbahn bleibt physikalisch und wird zwingend durch den festen Ephemeridenanker geführt.</span>
            <button className="ai-primary-action" type="button" disabled={routeLoading} onClick={() => { setRoutePlanStatus('confirmed'); setRouteDrawTool('move'); setRouteSketchSelection(null); void calculateWaypointRoute() }}>{routeLoading ? 'Berechne komplexe Bahn …' : 'Entwurf übernehmen & Bahn physikalisch berechnen'}</button>
            <button type="button" onClick={discardRouteSketch}>Entwurf verwerfen</button>
          </div>}
          {routePlanStatus === 'confirmed' && <span className="route-ok">Routenplan bestätigt · Nach der Berechnung bleibt nur die Nominalbahn; Referenz und Streuung sind zuschaltbar.</span>}
          {routeError && <span className="route-warning">{routeError}</span>}
          <span>Hinweis: Ein Klick auf einen Planeten setzt ihn ebenfalls als Wegpunkt.</span>
          <div className="ai-integrated-block">
          <div className="optimizer-divider"><strong>KI-gestützte Randwertsuche</strong><span>vorwärts + rückwärts · Mehrpass 12/8</span></div>
          <span>Die KI koppelt Sonnenaustritt, Ankunft und B-Plane direkt an das gewählte Ziel und den Vorbeiflug.</span>
          <label><span>Zielgeschwindigkeit Sonnenaustritt (km/s bei 1 AE)</span><input type="number" min="1" max="1000" step="1" value={desiredSolarExitSpeedKmS} onChange={(event) => { setDesiredSolarExitSpeedKmS(event.target.valueAsNumber); invalidateRoutePlan(); setPlannedRoute(null); setOptimizationResult(null) }} /></label>
          <label><span>Ausgangs-Start / Suchzentrum</span><input type="date" value={optimizationStartDate} onChange={(event) => { setOptimizationStartDate(event.target.value); invalidateRoutePlan() }} /></label>
          <label><span>Suchhorizont je Richtung (Tage)</span><input type="number" min="500" max="7305" step="1" value={optimizationWindowDays} onChange={(event) => { setOptimizationWindowDays(event.target.valueAsNumber); invalidateRoutePlan() }} /></label>
          <span>Startdatum, Begegnungstag und Horizont: bidirektional mit 100 → 10 → 5 → 1 Tagen · Grenzen 500 Tage bis 20 Jahre.</span>
          <label><span>Mindestkonfidenz</span><input type="number" min="90" max="99.9" step="0.5" value={optimizationThreshold} onChange={(event) => setOptimizationThreshold(event.target.valueAsNumber)} /></label>
          <button className="ai-primary-action" type="button" disabled={optimizationLoading || routeLoading || routePlanStatus !== 'confirmed'} onClick={() => void optimizeLaunchWindow()}>{optimizationLoading ? 'KI koppelt Sonne, Jupiter und Ziel …' : routePlanStatus === 'confirmed' ? 'Route mit KI bidirektional optimieren' : 'Zuerst Routenplan bestätigen'}</button>
          <label className="optimizer-check"><span>Zyklisch neu rechnen</span><input type="checkbox" checked={autoReoptimize} onChange={(event) => setAutoReoptimize(event.target.checked)} /></label>
          {autoReoptimize && <label><span>Intervall (min)</span><input type="number" min="1" step="1" value={recalculationMinutes} onChange={(event) => setRecalculationMinutes(event.target.valueAsNumber)} /></label>}
          {optimizationResult && (
            <div className="optimizer-result">
              <strong>Suchstart: Datum {optimizationResult.requestedPlan.startDate} · erste Begegnungsschätzung Tag {optimizationResult.requestedPlan.encounterDay.toFixed(1)} ({formatMissionDate(optimizationResult.requestedPlan.encounterDate)})</strong>
              <span>Nur Suchstart – keine Sollvorgabe, keine Freigabebedingung und kein eigener Vollmodell-Kandidat.</span>
              <strong className="route-ok">Begegnung wird erreicht am {formatMissionDate(optimizationResult.optimizedEncounterDate)} · Start {optimizationResult.optimizedStartDate} · Missionstag {optimizationResult.optimizedEncounterDay.toFixed(1)}</strong>
              <span>Optimierter Suchhorizont ±{optimizationResult.optimizedSearchWindowDays.toFixed(0)} Tage · vollständig untersucht bis ±{optimizationResult.searchStrategy.exploredHorizonDays.toFixed(0)} Tage · Raster {optimizationResult.searchStrategy.refinementStepsDays.join(' → ')} Tage</span>
              <span className={optimizationResult.geometryPlausible ? 'route-ok' : 'route-warning'}>{optimizationResult.geometryPlausible ? 'Geometrie grün: Einspritzung, Jupiter-Kopplung, Zielwinkel und Zielfortschritt sind erfüllt.' : 'Die gekoppelte Fluggeometrie hat noch mindestens einen offenen Grenzwert.'}</span>
              <span className={optimizationResult.solarEnergyFeasibility.energeticallyReachable ? 'route-ok' : 'route-warning'}>Antriebsgrenze: höchstens {optimizationResult.solarEnergyFeasibility.maximumExitSpeedWithAvailableBurnKmS.toFixed(2)} km/s bei 1 AE · für {optimizationResult.solarEnergyFeasibility.desiredExitSpeedKmS.toFixed(2)} km/s sind mindestens {optimizationResult.solarEnergyFeasibility.minimumOberthDeltaVForDesiredSpeedKmS.toFixed(2)} km/s Oberth-Δv nötig ({optimizationResult.solarEnergyFeasibility.availableOberthDeltaVKmS.toFixed(2)} km/s verfügbar) · kein elektrischer Leistungswert.</span>
              <span>Bidirektional gekoppelt: Sonne → Jupiter vorwärts, Ziel → Jupiter rückwärts · Randrest {(optimizationResult.bidirectionalSearch.jupiterMatch?.boundaryVelocityResidualKmS ?? 0).toFixed(3)} km/s</span>
              {optimizationResult.bidirectionalSearch.solarEntry && <span>Sonneneintritt {optimizationResult.bidirectionalSearch.solarEntry.entryDate} · Perihel {new Date(optimizationResult.bidirectionalSearch.solarEntry.perihelionDateTime).toLocaleString('de-DE')} · Austritt {optimizationResult.bidirectionalSearch.solarEntry.actualExitSpeedKmS.toFixed(2)} / {optimizationResult.bidirectionalSearch.desiredSolarExitSpeedKmS.toFixed(2)} km/s bei 1 AE</span>}
              <span className={optimizationResult.bidirectionalSearch.postFlybyTargetProgressMonotonic ? 'route-ok' : 'route-warning'}>{optimizationResult.bidirectionalSearch.postFlybyTargetProgressMonotonic ? 'Nach Jupiter nimmt der Zielweg durchgehend zu.' : 'Nach Jupiter enthält die Bahn noch einen Abschnitt entgegen dem Zielkorridor.'}</span>
              {(optimizationResult.planComparison.startDateChanged || optimizationResult.planComparison.encounterDayChanged) && (
                <span>Verschiebung gegenüber der Ausgangsschätzung: Start {optimizationResult.planComparison.startDateDeltaDays >= 0 ? '+' : ''}{optimizationResult.planComparison.startDateDeltaDays.toFixed(0)} Tage · Flugzeit {optimizationResult.planComparison.encounterDayDelta >= 0 ? '+' : ''}{optimizationResult.planComparison.encounterDayDelta.toFixed(1)} Tage</span>
              )}
              <span className={optimizationResult.plausible ? 'route-ok' : 'route-warning'}>{optimizationResult.plausible ? 'Das Optimum erfüllt alle Plausibilitätskriterien.' : 'Das angezeigte Optimum ist das beste Suchminimum, aber noch nicht flugfähig.'}</span>
              <span>{optimizationResult.minimumConfidencePct.toFixed(1)} % numerische Konvergenz · {optimizationResult.iterations} echte Suchdurchläufe in {optimizationResult.searchStrategy.refinementStepsDays.length} Rasterstufen · {optimizationResult.evaluations} Kandidaten</span>
              <span>{optimizationResult.fullValidationCandidates.length} Kandidaten mit dem vollständigen Bahnmodell geprüft · {optimizationResult.stopReason === 'plausible-route-found' ? 'Plausibilitätskriterien erfüllt' : optimizationResult.stopReason === 'solar-energy-boundary-unreachable-with-configured-burn' ? 'Geometriesuche erfüllt; die Antriebs-Δv-Grenze verhindert die Flugfreigabe' : 'Suchgrenzen ohne flugfähige Route ausgeschöpft'}</span>
              <span className={optimizationResult.route.summary.feasibleWithConfiguredBurn ? 'route-ok' : 'route-warning'}>{optimizationResult.route.summary.feasibleWithConfiguredBurn ? 'Konfiguration erfüllt den Δv-Test.' : 'Startfenster konvergiert, aber das konfigurierte Δv reicht noch nicht.'}</span>
              {!optimizationResult.plausible && optimizationResult.fullValidationCandidates.find((candidate) => candidate.startDate === optimizationResult.optimizedStartDate && Math.abs(candidate.encounterDay - optimizationResult.optimizedEncounterDay) < 0.01)?.rejectionReasons.map((reason) => <span className="route-warning" key={`optimum-${reason}`}>Optimum-Ablehnung: {reason}</span>)}
              <span>Navigator-Audit {optimizationResult.audit.runId} · <a href="/api/audit/latest-optimizer" target="_blank" rel="noreferrer">Entscheidungsweg</a> · <a href="/api/audit/optimizer-log">JSONL-Log</a></span>
            </div>
          )}
          {optimizationResult?.alternatives && (
            <div className="route-alternatives">
              <strong>{optimizationResult.alternatives.recommendationFeasible ? 'Empfehlung' : 'Beste getestete Variante – noch nicht flugfähig'}: {optimizationResult.alternatives.recommended === 'gravityAssist' ? `${waypointId}-Swing-by` : 'direkter Solar-Oberth-Kurs'}</strong>
              <span>A · Planet: Start {optimizationResult.alternatives.gravityAssist.startDate} · Zielrest {optimizationResult.alternatives.gravityAssist.route.summary.targetAlignmentDeg.toFixed(1)}° · {optimizationResult.alternatives.gravityAssist.feasible ? 'Δv ausreichend' : 'Δv nicht ausreichend'}</span>
              <span>B · Direkt: Start {optimizationResult.alternatives.directSolar.startDate} · Zielrest {optimizationResult.alternatives.directSolar.route.summary.finalTargetAlignmentDeg.toFixed(1)}° · Zielbreite {optimizationResult.alternatives.directSolar.route.summary.targetEclipticLatitudeDeg.toFixed(1)}° · {optimizationResult.alternatives.directSolar.feasible ? 'Δv ausreichend' : 'Δv nicht ausreichend'}</span>
              <label className="optimizer-check"><span>Beide Routenvorschläge anzeigen</span><input type="checkbox" checked={showAlternativeRoutes} onChange={(event) => setShowAlternativeRoutes(event.target.checked)} /></label>
            </div>
          )}
          </div>
            </div>
          </details>
          <details className="target-control-section">
            <summary><span>Ergebnis & Nachweis</span><small>{plannedRoute ? (plannedRoute.summary.feasibleWithConfiguredBurn ? 'erreichbar' : 'nicht erreichbar') : 'noch keine Route'}</small></summary>
            <div className="target-control-section-content">
          {plannedRoute?.uncertainty && (
            <div className="dispersion-controls">
              <label className="optimizer-check"><span>95-%-Streuung anzeigen</span><input type="checkbox" checked={showRouteDispersion} onChange={(event) => setShowRouteDispersion(event.target.checked)} /></label>
              <label className="optimizer-check"><span>Gestrichelte Routenführung</span><input type="checkbox" checked={showRouteGuide} onChange={(event) => setShowRouteGuide(event.target.checked)} /></label>
              <label><span>Sichtbare Korridorbreite</span><input type="range" min="0.08" max="1.5" step="0.02" value={dispersionWidth} onChange={(event) => setDispersionWidth(event.target.valueAsNumber)} /></label>
              <span>95-%-Radius am Wegpunkt: {plannedRoute.uncertainty.summary.waypointRadius95Km.toLocaleString('de-DE', { maximumFractionDigits: 0 })} km · Kalman-Zyklen: {plannedRoute.uncertainty.summary.navigationCycles.toLocaleString('de-DE')} · Korridorbreite nur visuell {dispersionWidth.toFixed(2)}</span>
            </div>
          )}
          {plannedRoute && (
            <span className={plannedRoute.summary.feasibleWithConfiguredBurn ? 'route-ok' : 'route-warning'}>
              {plannedRoute.summary.feasibleWithConfiguredBurn ? 'Erreichbar' : 'Nicht erreichbar'} · Kurs-Δv {plannedRoute.summary.requiredInjectionDeltaVKmS.toFixed(2)} km/s · Swing-by {plannedRoute.summary.courseChangeDeg?.toFixed(1) ?? '–'}° · Geschwindigkeitsgewinn {plannedRoute.summary.speedGainKmS >= 0 ? '+' : ''}{plannedRoute.summary.speedGainKmS.toFixed(2)} km/s
            </span>
          )}
          {plannedRoute?.summary.warnings?.map((warning) => <span className="route-warning" key={`summary-warning-${warning}`}>⚠ {warning}</span>)}
          {plannedRoute?.warnings?.map((warning) => <span className="route-warning" key={`payload-warning-${warning}`}>⚠ {warning}</span>)}
          {plannedRoute?.solarBoundary && <span className={plannedRoute.solarBoundary.speedBoundaryReached ? 'route-ok' : 'route-warning'}>1-AE-Sonnenaustritt: {plannedRoute.solarBoundary.actualExitSpeedKmS.toFixed(2)} km/s · Ziel {plannedRoute.solarBoundary.desiredExitSpeedKmS?.toFixed(2) ?? '–'} km/s · erforderlicher Oberth-Vektor {plannedRoute.solarBoundary.requiredOberthVectorDeltaVKmS.toFixed(2)} km/s · Antriebs-Maximum {plannedRoute.solarBoundary.maximumExitSpeedWithAvailableBurnKmS.toFixed(2)} km/s · Mindest-Oberth-Δv fürs Ziel {plannedRoute.solarBoundary.minimumOberthDeltaVForDesiredSpeedKmS.toFixed(2)} km/s</span>}
          {plannedRoute?.transitionDiagnostics?.bidirectionalMatch && <span>Vorwärts/Rückwärts-Kopplung am Jupiter: Bedarf {plannedRoute.transitionDiagnostics.bidirectionalMatch.demandedTurnDeg.toFixed(2)}° / verfügbar {plannedRoute.transitionDiagnostics.bidirectionalMatch.maximumTurnDeg.toFixed(2)}° · Randrest {plannedRoute.transitionDiagnostics.bidirectionalMatch.boundaryVelocityResidualKmS.toFixed(3)} km/s · {plannedRoute.transitionDiagnostics.bidirectionalMatch.passiveMatch ? 'passiv geschlossen' : 'Korrektur erforderlich'}</span>}
          {plannedRoute && <span className={plannedRoute.summary.targetProgressMonotonic ? 'route-ok' : 'route-warning'}>{plannedRoute.summary.targetProgressMonotonic ? 'Zielbedingung erfüllt: Nach Jupiter verläuft kein Abschnitt mehr vom Ziel weg.' : 'Zielbedingung verletzt: Nach Jupiter besteht noch rückläufiger Zielfortschritt.'}</span>}
          {plannedRoute && !plannedRoute.summary.solarDepartureInjectionApplied && <span className="route-warning">Solarer Übergang nicht ausführbar: benötigt {plannedRoute.summary.requiredInjectionDeltaVKmS.toFixed(2)} km/s bei {(plannedRoute.summary.availableInjectionDeltaVKmS ?? draft.oberthDeltaVKmS).toFixed(2)} km/s Budget und {(plannedRoute.transitionDiagnostics?.burnToLambertDirectionChangeDeg ?? 0).toFixed(2)}° Richtungswechsel. Die gestrichelten Abschnitte sind eine zeitlich abspielbare Sollsimulation, keine freigegebene Flugbahn.</span>}
          {plannedRoute?.summary.flybyMode === 'observation' && <span>Beobachtungsfenster ≈ {plannedRoute.summary.observationWindowHours.toFixed(1)} h · Perizentrum {plannedRoute.summary.periapsisSpeedKmS.toFixed(2)} km/s · Zielabweichung {plannedRoute.summary.targetAlignmentDeg.toFixed(1)}°</span>}
          {plannedRoute?.transitionDiagnostics && <span>SOI-Übergang: Position gekoppelt · Geschwindigkeitsrest Eingang {(plannedRoute.transitionDiagnostics.entryVelocityResidualKmS * 1_000).toFixed(2)} m/s · Soll-Zielimpuls {(plannedRoute.transitionDiagnostics.exitTargetInjectionDeltaVKmS ?? 0).toFixed(2)} km/s / {(plannedRoute.transitionDiagnostics.exitTargetInjectionDirectionChangeDeg ?? 0).toFixed(2)}° · {plannedRoute.transitionDiagnostics.exitTargetInjectionApplied ? 'angewendet' : 'nicht verfügbar, daher nicht propagiert'}</span>}
          {plannedRoute?.transitionDiagnostics?.lambertSelection && <span>Lambert-Zweig: {plannedRoute.transitionDiagnostics.lambertSelection.motion} · Familie {plannedRoute.transitionDiagnostics.lambertSelection.revolutionFamily ?? 0} · Oberth→Lambert Richtung {(plannedRoute.transitionDiagnostics.burnToLambertDirectionChangeDeg ?? 0).toFixed(2)}° · Lambert→SOI Richtung {(plannedRoute.transitionDiagnostics.lambertToHyperbolaDirectionChangeDeg ?? 0).toFixed(4)}°</span>}
          {plannedRoute?.audit && <span>Rechennachweis {plannedRoute.audit.runId} · <a href="/api/audit/latest-route" target="_blank" rel="noreferrer">letzten Lauf prüfen</a> · <a href="/api/audit/route-log">JSONL-Log</a> · <a href="/api/audit/methods" target="_blank" rel="noreferrer">Methodendokument</a></span>}
            </div>
          </details>
          </div>
        </DraggableOverlayPanel>
        <div className="phase-legend" aria-label="Farblegende">
          <span className="inbound">Sonnensturz</span><span className="burn">Oberth</span><span className="sail">Electric Sail</span><span className="cruise">Deep Space</span>
        </div>
        <div className={`phase-timeline ${plannedRoute ? 'route-timeline' : ''}`} aria-label="Missionstimeline">
          {(plannedRoute ? [
            ['earth-to-oberth', 'Erde → Sonne'],
            ['lambert-to-soi', 'Sonne → Jupiter'],
            ['jupiter-hyperbola', 'Jupiter-Swing-by'],
            ['post-flyby', 'Ausflug / Zielkurs'],
          ] : [
            ['EARTH', 'Start / Erdorbit'],
            ['SUNDIVER', 'Sonnensturz'],
            ['SOLAR_APPROACH', 'Perihel'],
            ['SOLAR_OBERTH', 'Oberth'],
            ['PAYLOAD', 'Trennung'],
            ['ELECTRIC_SAIL_DEPLOYMENT', 'Entfaltung'],
            ['ELECTRIC_SAIL_PROPULSION', 'E-Sail'],
            ['DEEP_SPACE', 'Deep Space'],
          ]).map(([phase, label]) => (
            <span className={plannedRoute ? currentRouteSegment?.id === phase ? 'active' : '' : currentPoint?.phase.includes(phase) ? 'active' : ''} key={phase}>{label}</span>
          ))}
        </div>
        {aimpointEnabled && (
          <div className="aimpoint-overlay" aria-label="Aimpoint-Steuerung">
            <strong>Aimpoint im Planetenbild</strong>
            <label>
              <span>Rolle</span>
              <select
                value={aimpointRole}
                onChange={(event) => {
                  setAimpointRole(event.target.value as AimpointRole)
                  invalidateRoutePlan()
                  setPlannedRoute(null)
                }}
              >
                <option value="entry">Entry</option>
                <option value="periapsis">Periapsis (Standard)</option>
                <option value="exit">Exit</option>
              </select>
            </label>
            <label><span>Höhe</span><input type="number" min="0" step="1000" value={aimpointAltitudeKm} onChange={(event) => { setAimpointAltitudeKm(event.target.valueAsNumber); invalidateRoutePlan(); setPlannedRoute(null) }} /><small>km</small></label>
            <label><span>Uhrwinkel</span><input type="number" step="1" value={aimpointClockAngleDeg} onChange={(event) => { setAimpointClockAngleDeg(event.target.valueAsNumber); invalidateRoutePlan(); setPlannedRoute(null) }} /><small>°</small></label>
            <label><span>Scheibenradius</span><input type="number" min="0" max="1" step="0.05" value={aimpointScreenRadiusNorm} onChange={(event) => { setAimpointScreenRadiusNorm(Math.max(0, Math.min(1, event.target.valueAsNumber))); invalidateRoutePlan(); setPlannedRoute(null) }} /><small>0-1</small></label>
            <span>Aimpoint: {aimpointRole === 'periapsis' ? 'Periapsis' : aimpointRole === 'entry' ? 'Eintritt' : 'Austritt'} · {aimpointAltitudeKm.toLocaleString('de-DE', { maximumFractionDigits: 0 })} km · {aimpointClockAngleDeg.toFixed(0)}° · {aimpointScreenRadiusNorm.toFixed(2)}</span>
          </div>
        )}
        <div className="planet-view-actions" aria-label="Kamerafokus">
          <button type="button" onClick={() => showSystemOverview('perspective')}>3D-Perspektive</button>
          <button type="button" onClick={() => showSystemOverview('top')}>Draufsicht</button>
          <button type="button" onClick={() => showSystemOverview('front')}>Vorderansicht</button>
          <button type="button" onClick={() => showSystemOverview('side')}>Seitenansicht</button>
          <button type="button" disabled={!selectedPlanet} onClick={focusSelectedPlanet}>{selectedPlanet ? `${selectedPlanet.name} fokussieren` : 'Planet fokussieren'}</button>
        </div>
        <div className="scene-help">XYZ-Gizmo unten rechts · Planet anklicken: Nahfokus · Mausrad: zoomen · Linke Taste: {navigationMode === 'pan' ? 'Ansicht ziehen' : 'Ansicht räumlich drehen'} · Rechte Taste: {navigationMode === 'pan' ? 'drehen' : 'ziehen'}</div>
      </div>

      <ParameterPanel
        planets={data.planets}
        moonCounts={moonCatalogue.counts}
        selectedPlanet={selectedPlanet}
        selectedObject={selectedObject}
        selectedMoons={selectedMoons}
        selectedMoon={selectedMoon}
        currentPoint={plannedRoute ? null : currentPoint}
        visual={visual}
        draft={draft}
        result={plannedRoute ? null : result}
        elapsedDays={elapsedDays}
        playing={playing}
        canPlay={canPlay}
        playbackEndDay={playbackEndDay}
        simulationSpeed={simulationSpeed}
        stepDays={stepDays}
        error={simulationError}
        energyDeficit={optimizationResult?.solarEnergyFeasibility}
        onSelectPlanet={selectPlanet}
        onSelectObject={setSelectedObject}
        onSelectMoon={setSelectedMoon}
        onVisualChange={setVisual}
        onDraftChange={(nextDraft) => { setDraft(nextDraft); invalidateRoutePlan(); setPlannedRoute(null); setDirectSolarRoute(null); setOptimizationResult(null) }}
        onApply={applySimulation}
        onResetAll={resetAll}
        onPlayingChange={setPlaying}
        onElapsedDaysChange={(day) => { setElapsedDays(Math.max(0, Math.min(playbackEndDay, day))); setPlaying(false) }}
        onSpeedChange={setSimulationSpeed}
        onStepDaysChange={setStepDays}
        onStep={() => canPlay && setElapsedDays((current) => Math.min(playbackEndDay, current + stepDays))}
        onResetTime={() => { setElapsedDays(0); setPlaying(false) }}
      />
      {visual.showScaleNotice && (
        <p className="floating-scale-note">Orbitale Darstellung: {visual.orbitScale} × √AE · Neigungen vertikal ×{visual.inclinationScale} · Körperradien proportional zueinander · Missionsbahn RK4 / N-Körper</p>
      )}
    </section>
  )
}

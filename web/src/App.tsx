import { lazy, Suspense, useCallback, useState, type Dispatch, type SetStateAction } from 'react'

import type { EntryCorridorDefinition } from './entryCorridorGeometry'
import { DEFAULT_ROUTE_SECTION, type RouteSectionDefinition } from './routeSections'
import type { WaypointRouteResult } from './components/PlannedWaypointRoute'

const TwoDView = lazy(() => import('./components/TwoDView').then(({ TwoDView }) => ({ default: TwoDView })))
const ThreeDView = lazy(() => import('./components/ThreeDView').then(({ ThreeDView }) => ({ default: ThreeDView })))

type ViewMode = 'menu' | '2d' | '3d'

export function App() {
  const [viewMode, setViewMode] = useState<ViewMode>('menu')
  const [routeSections, setRouteSections] = useState<RouteSectionDefinition[]>(() => [{
    ...DEFAULT_ROUTE_SECTION,
    corridor: { ...DEFAULT_ROUTE_SECTION.corridor },
  }])
  const [activeRouteSectionId, setActiveRouteSectionId] = useState(DEFAULT_ROUTE_SECTION.id)
  const [plannedMissionDate, setPlannedMissionDate] = useState<string | null>(null)
  const [plannedRoute, setPlannedRoute] = useState<WaypointRouteResult | null>(null)
  const activeRouteSection = routeSections.find((section) => section.id === activeRouteSectionId) ?? routeSections[0]

  const setEntryCorridor: Dispatch<SetStateAction<EntryCorridorDefinition>> = useCallback((action) => {
    setRouteSections((current) => current.map((section) => {
      if (section.id !== activeRouteSectionId) return section
      const corridor = typeof action === 'function' ? action(section.corridor) : action
      return { ...section, corridor }
    }))
  }, [activeRouteSectionId])

  const updateRouteSections: Dispatch<SetStateAction<RouteSectionDefinition[]>> = useCallback((action) => {
    setRouteSections(action)
    setPlannedRoute(null)
    setPlannedMissionDate(null)
  }, [])

  const setWaypointId: Dispatch<SetStateAction<string>> = useCallback((action) => {
    setRouteSections((current) => current.map((section) => {
      if (section.id !== activeRouteSectionId) return section
      const targetId = typeof action === 'function' ? action(section.targetId) : action
      return { ...section, targetId }
    }))
  }, [activeRouteSectionId])

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand" type="button" onClick={() => setViewMode('menu')}>
          <span className="brand-mark" aria-hidden="true" />
          Unser Sonnensystem
        </button>
        {viewMode !== 'menu' && (
          <nav className="view-switcher" aria-label="Darstellung wechseln">
            <button className={viewMode === '2d' ? 'active' : ''} type="button" onClick={() => setViewMode('2d')}>
              2D
            </button>
            <button className={viewMode === '3d' ? 'active' : ''} type="button" onClick={() => setViewMode('3d')}>
              3D
            </button>
          </nav>
        )}
      </header>

      {viewMode === 'menu' ? (
        <section className="chooser" aria-labelledby="chooser-title">
          <p className="eyebrow">Interaktive Expedition</p>
          <h1 id="chooser-title">Wie möchtest du das Sonnensystem erkunden?</h1>
          <p className="intro">Wähle die wissenschaftliche 2D-Übersicht oder fliege frei durch das 3D-Modell.</p>
          <div className="choice-grid">
            <button className="choice-card choice-2d" type="button" onClick={() => setViewMode('2d')}>
              <span className="choice-number">01</span>
              <strong>Orbitalplaner 2D</strong>
              <span>Zielkorridor zeichnen sowie reale Bahnverläufe von oben und entlang der Ekliptik prüfen.</span>
            </button>
            <button className="choice-card choice-3d" type="button" onClick={() => setViewMode('3d')}>
              <span className="choice-number">02</span>
              <strong>Interaktiv 3D</strong>
              <span>Drehen, zoomen und Planeten auswählen – mit React Three Fiber.</span>
            </button>
          </div>
        </section>
      ) : (
        <Suspense fallback={<div className="loading">Ansicht wird geladen …</div>}>
          {viewMode === '2d'
            ? (
              <TwoDView
                routeSections={routeSections}
                onRouteSectionsChange={updateRouteSections}
                activeRouteSectionId={activeRouteSectionId}
                onActiveRouteSectionChange={setActiveRouteSectionId}
                plannedMissionDate={plannedMissionDate}
                plannedRoute={plannedRoute}
              />
            )
            : (
              <ThreeDView
                routeSections={routeSections}
                entryCorridor={activeRouteSection.corridor}
                onEntryCorridorChange={setEntryCorridor}
                waypointId={activeRouteSection.targetId}
                onWaypointChange={setWaypointId}
                onPlannedMissionDateChange={setPlannedMissionDate}
                plannedRoute={plannedRoute}
                onPlannedRouteChange={setPlannedRoute}
              />
            )}
        </Suspense>
      )}
    </main>
  )
}

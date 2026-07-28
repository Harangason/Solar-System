import { lazy, Suspense, useCallback, useState, type Dispatch, type SetStateAction } from 'react'

import { ProjectDialog } from './components/ProjectDialog'
import type { EntryCorridorDefinition } from './entryCorridorGeometry'
import {
  createProject,
  deleteProject,
  listProjects,
  loadProject,
  updateProject,
  type ProjectState,
  type ProjectSummary,
} from './projectStore'
import { DEFAULT_ROUTE_SECTION, type RouteSectionDefinition } from './routeSections'
import type { WaypointRouteResult } from './components/PlannedWaypointRoute'
import type { MissionConfig, MissionResult, VisualConfig } from './types'

const TwoDView = lazy(() => import('./components/TwoDView').then(({ TwoDView }) => ({ default: TwoDView })))
const ThreeDView = lazy(() => import('./components/ThreeDView').then(({ ThreeDView }) => ({ default: ThreeDView })))

type ViewMode = 'menu' | '2d' | '3d'

export function App() {
  const [viewMode, setViewMode] = useState<ViewMode>('menu')
  const [routeSections, setRouteSections] = useState<RouteSectionDefinition[]>([])
  const [activeRouteSectionId, setActiveRouteSectionId] = useState('')
  const [plannedMissionDate, setPlannedMissionDate] = useState<string | null>(null)
  const [plannedRoute, setPlannedRoute] = useState<WaypointRouteResult | null>(null)
  const [missionConfig, setMissionConfig] = useState<MissionConfig | null>(null)
  const [visualConfig, setVisualConfig] = useState<VisualConfig | null>(null)
  const [missionResult, setMissionResult] = useState<MissionResult | null>(null)
  const [projectLoadToken, setProjectLoadToken] = useState(0)
  const [projectId, setProjectId] = useState('')
  const [projectName, setProjectName] = useState('')
  const [projectDescription, setProjectDescription] = useState('')
  const [projectDialogMode, setProjectDialogMode] = useState<'save-as' | 'open' | null>(null)
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [projectBusy, setProjectBusy] = useState(false)
  const [projectError, setProjectError] = useState<string | null>(null)
  const [projectStatus, setProjectStatus] = useState('')
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

  const currentProjectState = (): ProjectState => ({
    schemaVersion: 1,
    viewMode: viewMode === '3d' ? '3d' : '2d',
    routeSections,
    activeRouteSectionId,
    plannedMissionDate,
    plannedRoute,
    missionConfig,
    visualConfig,
    missionResult,
  })
  const showProjectDialog = async (mode: 'save-as' | 'open') => {
    setProjectError(null)
    if (mode === 'open') {
      setProjectBusy(true)
      try {
        setProjects(await listProjects())
      } catch (error) {
        setProjectError(error instanceof Error ? error.message : String(error))
      } finally {
        setProjectBusy(false)
      }
    }
    setProjectDialogMode(mode)
  }
  const saveProjectAs = async (name: string, description: string) => {
    setProjectBusy(true)
    setProjectError(null)
    try {
      const stored = await createProject(name, description, currentProjectState())
      setProjectId(stored.id)
      setProjectName(stored.name)
      setProjectDescription(stored.description)
      setProjectStatus(`${stored.name} · Revision ${stored.revision} gespeichert`)
      setProjectDialogMode(null)
    } catch (error) {
      setProjectError(error instanceof Error ? error.message : String(error))
    } finally {
      setProjectBusy(false)
    }
  }
  const saveCurrentProject = async () => {
    if (!projectId) {
      await showProjectDialog('save-as')
      return
    }
    setProjectBusy(true)
    setProjectError(null)
    try {
      const stored = await updateProject(projectId, projectName, projectDescription, currentProjectState())
      setProjectStatus(`${stored.name} · Revision ${stored.revision} gespeichert`)
    } catch (error) {
      setProjectStatus('')
      setProjectError(error instanceof Error ? error.message : String(error))
    } finally {
      setProjectBusy(false)
    }
  }
  const openStoredProject = async (selectedProjectId: string) => {
    setProjectBusy(true)
    setProjectError(null)
    try {
      const stored = await loadProject(selectedProjectId)
      setRouteSections(stored.state.routeSections)
      setActiveRouteSectionId(stored.state.activeRouteSectionId || stored.state.routeSections[0]?.id || '')
      setPlannedMissionDate(stored.state.plannedMissionDate)
      setPlannedRoute(stored.state.plannedRoute)
      setMissionConfig(stored.state.missionConfig ?? null)
      setVisualConfig(stored.state.visualConfig ?? null)
      setMissionResult(stored.state.missionResult ?? null)
      setProjectLoadToken((current) => current + 1)
      setProjectId(stored.id)
      setProjectName(stored.name)
      setProjectDescription(stored.description)
      setProjectStatus(`${stored.name} · Revision ${stored.revision} geöffnet`)
      setViewMode(stored.state.viewMode)
      setProjectDialogMode(null)
    } catch (error) {
      setProjectError(error instanceof Error ? error.message : String(error))
    } finally {
      setProjectBusy(false)
    }
  }
  const removeStoredProject = async (selectedProjectId: string) => {
    setProjectBusy(true)
    setProjectError(null)
    try {
      await deleteProject(selectedProjectId)
      setProjects((current) => current.filter((project) => project.id !== selectedProjectId))
      if (selectedProjectId === projectId) {
        setProjectId('')
        setProjectName('')
        setProjectDescription('')
        setProjectStatus('Projekt gelöscht · aktueller Plan ist noch ungespeichert geöffnet')
      }
    } catch (error) {
      setProjectError(error instanceof Error ? error.message : String(error))
    } finally {
      setProjectBusy(false)
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand" type="button" onClick={() => setViewMode('menu')}>
          <span className="brand-mark" aria-hidden="true" />
          Unser Sonnensystem
        </button>
        {viewMode !== 'menu' && (
          <div className="topbar-actions">
            <div className="project-actions" aria-label="Projektverwaltung">
              <span title={projectStatus || undefined}>{projectName || 'Ungespeichertes Projekt'}</span>
              <button type="button" disabled={projectBusy} onClick={() => void saveCurrentProject()}>Speichern</button>
              <button type="button" disabled={projectBusy} onClick={() => void showProjectDialog('save-as')}>Speichern unter …</button>
              <button type="button" disabled={projectBusy} onClick={() => void showProjectDialog('open')}>Öffnen …</button>
            </div>
            <nav className="view-switcher" aria-label="Darstellung wechseln">
              <button className={viewMode === '2d' ? 'active' : ''} type="button" onClick={() => setViewMode('2d')}>
                2D
              </button>
              <button className={viewMode === '3d' ? 'active' : ''} type="button" onClick={() => setViewMode('3d')}>
                3D
              </button>
            </nav>
          </div>
        )}
      </header>

      {projectDialogMode && (
        <ProjectDialog
          mode={projectDialogMode}
          currentName={projectName}
          currentDescription={projectDescription}
          projects={projects}
          busy={projectBusy}
          error={projectError}
          onCancel={() => setProjectDialogMode(null)}
          onSave={(name, description) => void saveProjectAs(name, description)}
          onOpen={(selectedProjectId) => void openStoredProject(selectedProjectId)}
          onDelete={(selectedProjectId) => void removeStoredProject(selectedProjectId)}
        />
      )}

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
                entryCorridor={activeRouteSection?.corridor ?? DEFAULT_ROUTE_SECTION.corridor}
                onEntryCorridorChange={setEntryCorridor}
                waypointId={activeRouteSection?.targetId ?? ''}
                onWaypointChange={setWaypointId}
                onPlannedMissionDateChange={setPlannedMissionDate}
                plannedRoute={plannedRoute}
                onPlannedRouteChange={setPlannedRoute}
                onOpenRoutePlanner={() => setViewMode('2d')}
                restoredMissionConfig={missionConfig}
                restoredVisualConfig={visualConfig}
                restoredMissionResult={missionResult}
                projectLoadToken={projectLoadToken}
                onMissionConfigChange={setMissionConfig}
                onVisualConfigChange={setVisualConfig}
                onMissionResultChange={setMissionResult}
              />
            )}
        </Suspense>
      )}
    </main>
  )
}

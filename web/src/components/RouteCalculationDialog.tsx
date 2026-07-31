import { useMemo, useRef, useState, useEffect } from 'react'

export type RouteCalculationCandidateStatus =
  | 'running'
  | 'geometry-valid'
  | 'performance-valid'
  | 'success'
  | 'rejected'
  | 'error'

export interface RouteCalculationCandidateTrace {
  id: string
  iteration: number
  date: string
  stage: string
  fullCorridorCheck: boolean
  status: RouteCalculationCandidateStatus
  message?: string
  geometricScore: number
  quality?: number
  geometryValid?: boolean
  endpointsReached?: boolean
  maximumEndpointResidualKm?: number
  performanceEvaluated?: boolean
  hypotheticalInterstellarAsymptote?: boolean
  feasible?: boolean
  corridorSatisfied?: boolean
  collisionFree?: boolean
  requiredInjectionDeltaVKmS?: number
  availableInjectionDeltaVKmS?: number
  targetCorrectionDeltaVKmS?: number
  corridorInsertionDeficitKmS?: number
  targetAlignmentDeg?: number
  totalFlightDays?: number
  routePoints?: Array<[number, number, number]>
}

export interface RouteCalculationTrace {
  runId: string
  routeLabel: string
  running: boolean
  baseDate: string
  searchStartDate: string
  searchEndDate: string
  broadStepDays: number
  graphNodes: number
  graphEdges: number
  geometricShortlist: number
  preflightBudget: number
  fullValidationBudget: number
  candidates: RouteCalculationCandidateTrace[]
  resultCount: number
  flightReadyCount: number
  goodResultCount?: number
  targetGoodResults?: number
  adaptiveRound?: number
  stopReason?: string
  bestDate?: string
  error?: string
}

export interface RouteCalculationRunSummary {
  runId: string
  routeLabel: string
  status: string
  startedAtUtc: string
}

interface RouteCalculationDialogProps {
  trace: RouteCalculationTrace
  availableRuns: RouteCalculationRunSummary[]
  historyLoading: boolean
  onRunSelect: (runId: string) => void
  onClose: () => void
}

const STAGE_NAMES: Record<string, string> = {
  'basin-preflight': 'Geometrische Vorprüfung',
  'graph-refinement-level-1': 'Nachsuche E1',
  'graph-refinement-level-2': 'Nachsuche E2',
  'graph-refinement-level-3': 'Nachsuche E3',
  'graph-refinement-level-4': 'Nachsuche E4',
  'corridor-full-validation': 'Geometrische Wegpunktprüfung',
  'adaptive-passage-round-1': 'Adaptive Passage R1',
  'adaptive-passage-round-2': 'Adaptive Passage R2',
  'adaptive-passage-round-3': 'Adaptive Passage R3',
}

const STATUS_NAMES: Record<RouteCalculationCandidateStatus, string> = {
  running: 'läuft',
  'geometry-valid': 'geometrisch gültig',
  'performance-valid': 'flugfähig',
  success: 'erfolgreich',
  rejected: 'verworfen',
  error: 'Fehler',
}

function finite(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value)
}

function metric(value: number | undefined, digits = 1) {
  return finite(value) ? value.toFixed(digits) : '–'
}

function stageName(stage: string) {
  return STAGE_NAMES[stage] ?? stage
}

function candidateDeficit(candidate: RouteCalculationCandidateTrace) {
  if (!candidate.performanceEvaluated) return undefined
  if (
    !finite(candidate.requiredInjectionDeltaVKmS)
    || !finite(candidate.availableInjectionDeltaVKmS)
  ) return undefined
  return Math.max(
    0,
    candidate.requiredInjectionDeltaVKmS
      + (candidate.targetCorrectionDeltaVKmS ?? 0)
      - candidate.availableInjectionDeltaVKmS,
  ) + (candidate.corridorInsertionDeficitKmS ?? 0)
}

function routePath(points: Array<[number, number, number]> | undefined) {
  if (!points || points.length < 2) return ''
  const projected = points
    .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y))
    .map(([x, y]) => ({ x, y: -y }))
  if (projected.length < 2) return ''
  let minX = projected[0].x
  let maxX = projected[0].x
  let minY = projected[0].y
  let maxY = projected[0].y
  for (const point of projected) {
    minX = Math.min(minX, point.x)
    maxX = Math.max(maxX, point.x)
    minY = Math.min(minY, point.y)
    maxY = Math.max(maxY, point.y)
  }
  const width = Math.max(1, maxX - minX)
  const height = Math.max(1, maxY - minY)
  const scale = Math.min(620 / width, 260 / height)
  const offsetX = 340 - (minX + maxX) * scale / 2
  const offsetY = 150 - (minY + maxY) * scale / 2
  return projected.map((point, index) => (
    `${index === 0 ? 'M' : 'L'} ${(point.x * scale + offsetX).toFixed(2)} ${(point.y * scale + offsetY).toFixed(2)}`
  )).join(' ')
}

function CandidateQualityPlot({
  candidates,
  selectedId,
  onSelect,
}: {
  candidates: RouteCalculationCandidateTrace[]
  selectedId: string
  onSelect: (id: string) => void
}) {
  const plotted = candidates.filter((candidate) => finite(candidate.quality))
  if (plotted.length === 0) {
    return <p className="calculation-empty">Noch keine bewerteten Solvervarianten.</p>
  }
  const timestamps = plotted.map((candidate) => new Date(`${candidate.date}T00:00:00Z`).getTime())
  const qualities = plotted.map((candidate) => candidate.quality as number)
  const minTime = Math.min(...timestamps)
  const maxTime = Math.max(...timestamps)
  const minQuality = Math.min(...qualities)
  const maxQuality = Math.max(...qualities)
  const timeSpan = Math.max(1, maxTime - minTime)
  const qualitySpan = Math.max(1, maxQuality - minQuality)

  return (
    <svg viewBox="0 0 700 250" className="calculation-quality-plot" role="img" aria-label="Qualität der Solvervarianten über dem Startdatum">
      <line x1="54" y1="18" x2="54" y2="216" className="calculation-axis" />
      <line x1="54" y1="216" x2="682" y2="216" className="calculation-axis" />
      <text x="12" y="28" className="calculation-axis-label">Qualität</text>
      <text x="682" y="240" textAnchor="end" className="calculation-axis-label">Startdatum</text>
      <text x="48" y="31" textAnchor="end" className="calculation-tick">{maxQuality.toFixed(0)}</text>
      <text x="48" y="214" textAnchor="end" className="calculation-tick">{minQuality.toFixed(0)}</text>
      {plotted.map((candidate, index) => {
        const x = 62 + (timestamps[index] - minTime) / timeSpan * 610
        const y = 206 - (qualities[index] - minQuality) / qualitySpan * 178
        return (
          <g key={candidate.id}>
            <circle
              cx={x}
              cy={y}
              r={candidate.id === selectedId ? 8 : 5}
              className={`calculation-point is-${candidate.status}${candidate.id === selectedId ? ' is-selected' : ''}`}
              tabIndex={0}
              role="button"
              aria-label={`Variante ${candidate.iteration}, ${candidate.date}, Qualität ${candidate.quality?.toFixed(1)}`}
              onClick={() => onSelect(candidate.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') onSelect(candidate.id)
              }}
            />
          </g>
        )
      })}
    </svg>
  )
}

export function RouteCalculationDialog({
  trace,
  availableRuns,
  historyLoading,
  onRunSelect,
  onClose,
}: RouteCalculationDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [stageFilter, setStageFilter] = useState('all')
  const [selectedId, setSelectedId] = useState('')

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return undefined
    dialog.showModal()
    return () => {
      if (dialog.open) dialog.close()
    }
  }, [])

  const stages = useMemo(
    () => [...new Set(trace.candidates.map((candidate) => candidate.stage))],
    [trace.candidates],
  )
  const filteredCandidates = useMemo(
    () => trace.candidates.filter((candidate) => stageFilter === 'all' || candidate.stage === stageFilter),
    [stageFilter, trace.candidates],
  )
  const selectedCandidate = (
    filteredCandidates.find((candidate) => candidate.id === selectedId)
    ?? filteredCandidates.at(-1)
  )
  const selectedRoutePath = routePath(selectedCandidate?.routePoints)
  const solvedCount = trace.candidates.filter((candidate) => candidate.status !== 'running').length
  const fullValidationCount = trace.candidates.filter((candidate) => candidate.fullCorridorCheck).length
  const targetGoodResults = trace.targetGoodResults ?? 10
  const goodResultCount = trace.goodResultCount ?? trace.flightReadyCount
  const deficit = selectedCandidate ? candidateDeficit(selectedCandidate) : undefined
  const comparisonCandidate = selectedCandidate
    ? [...trace.candidates].reverse().find((candidate) => (
        candidate.date === selectedCandidate.date
        && candidate.fullCorridorCheck !== selectedCandidate.fullCorridorCheck
      ))
    : undefined
  const requiredDelta = (
    selectedCandidate
    && comparisonCandidate
    && selectedCandidate.performanceEvaluated
    && comparisonCandidate.performanceEvaluated
    && finite(selectedCandidate.requiredInjectionDeltaVKmS)
    && finite(comparisonCandidate.requiredInjectionDeltaVKmS)
  )
    ? selectedCandidate.requiredInjectionDeltaVKmS - comparisonCandidate.requiredInjectionDeltaVKmS
    : undefined

  return (
    <dialog
      ref={dialogRef}
      className="route-calculation-dialog"
      aria-labelledby="route-calculation-title"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
    >
      <header>
        <div>
          <small>{trace.running ? 'Live · Solver läuft' : 'Abgeschlossener Solverlauf'}</small>
          <h2 id="route-calculation-title">Routenberechnungen analysieren</h2>
          <p>{trace.routeLabel}</p>
        </div>
        <div className="calculation-dialog-actions">
          <label>
            <span>Gespeicherter Lauf</span>
            <select
              value={trace.runId}
              disabled={historyLoading}
              onChange={(event) => onRunSelect(event.target.value)}
            >
              {availableRuns.map((run) => (
                <option key={run.runId} value={run.runId}>
                  {new Date(run.startedAtUtc).toLocaleString('de-DE')} · {run.status} · {run.routeLabel}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="wizard-close" aria-label="Analyse schließen" onClick={onClose}>×</button>
        </div>
      </header>

      <div className="route-calculation-content">
        <section className="calculation-funnel" aria-label="Suchtrichter">
          <article><strong>{trace.graphNodes.toLocaleString('de-DE')}</strong><span>Geometriepunkte</span></article>
          <span aria-hidden="true">→</span>
          <article><strong>{trace.geometricShortlist}</strong><span>Shortlist · erweitert</span></article>
          <span aria-hidden="true">→</span>
          <article><strong>{solvedCount}</strong><span>Solverläufe · adaptiv</span></article>
          <span aria-hidden="true">→</span>
          <article><strong>{fullValidationCount}</strong><span>Vollprüfungen</span></article>
          <span aria-hidden="true">→</span>
          <article><strong>{goodResultCount}/{targetGoodResults}</strong><span>gute Resultate · Ziel</span></article>
        </section>

        <div className="calculation-meta">
          <span>Fenster {trace.searchStartDate} – {trace.searchEndDate}</span>
          <span>Raster {trace.broadStepDays} Tage</span>
          <span>{trace.graphEdges.toLocaleString('de-DE')} Graphkanten</span>
          <span>Run {trace.runId.slice(0, 8)}</span>
          <span>Adaptive Runde {trace.adaptiveRound ?? 0}</span>
          <span>{trace.flightReadyCount} strikt flugfähig</span>
        </div>

        {trace.error ? <p className="calculation-error">{trace.error}</p> : null}
        {trace.stopReason
          ? <p className={goodResultCount >= targetGoodResults ? 'calculation-empty' : 'calculation-error'}>{trace.stopReason}</p>
          : null}

        <section className="calculation-grid">
          <article className="calculation-panel">
            <header>
              <div>
                <small>Variantenvergleich</small>
                <h3>Qualität nach Startdatum</h3>
              </div>
              <label>
                <span>Stufe</span>
                <select value={stageFilter} onChange={(event) => setStageFilter(event.target.value)}>
                  <option value="all">Alle Stufen</option>
                  {stages.map((stage) => <option key={stage} value={stage}>{stageName(stage)}</option>)}
                </select>
              </label>
            </header>
            <CandidateQualityPlot
              candidates={filteredCandidates}
              selectedId={selectedCandidate?.id ?? ''}
              onSelect={setSelectedId}
            />
          </article>

          <article className="calculation-panel">
            <header>
              <div>
                <small>Ausgewählte Variante</small>
                <h3>{selectedCandidate ? `#${selectedCandidate.iteration} · ${selectedCandidate.date}` : 'Noch keine Variante'}</h3>
              </div>
              {selectedCandidate ? <span className={`calculation-status is-${selectedCandidate.status}`}>{STATUS_NAMES[selectedCandidate.status] ?? selectedCandidate.status}</span> : null}
            </header>
            {selectedRoutePath
              ? (
                <svg viewBox="0 0 680 300" className="calculation-route-plot" role="img" aria-label="Projizierter Verlauf der ausgewählten Route">
                  <line x1="20" y1="150" x2="660" y2="150" className="calculation-axis" />
                  <line x1="340" y1="12" x2="340" y2="288" className="calculation-axis" />
                  <path d={selectedRoutePath} className="calculation-route-path" />
                </svg>
              )
              : <p className="calculation-empty">Für diese Variante ist noch kein Routenverlauf vorhanden.</p>}
            {selectedCandidate?.hypotheticalInterstellarAsymptote
              ? <p className="calculation-route-hypothetical">Hypothetische Zielrichtung – gerader Katalogstrahl über 50 AE, ohne lokale Ephemeride oder physikalische Sternankunft.</p>
              : null}
            {selectedCandidate?.status === 'rejected' && !selectedCandidate.hypotheticalInterstellarAsymptote
              ? <p className="calculation-route-warning">Diagnosebahn – diese Variante ist kein gültiges Ergebnis. {selectedCandidate.message ?? ''}</p>
              : null}
          </article>
        </section>

        {selectedCandidate
          ? (
            <section className="calculation-metrics" aria-label="Kennzahlen der ausgewählten Variante">
              <article><span>Stufe</span><strong>{stageName(selectedCandidate.stage)}</strong></article>
              <article><span>Qualität</span><strong>{metric(selectedCandidate.quality)}</strong></article>
              <article><span>Geometrie</span><strong>{selectedCandidate.geometryValid === undefined ? 'historischer Lauf' : selectedCandidate.geometryValid ? 'gültig' : 'ungültig'}</strong></article>
              <article><span>Endpunktrest</span><strong>{metric(selectedCandidate.maximumEndpointResidualKm, 2)} km</strong></article>
              <article><span>Δv erforderlich</span><strong>{selectedCandidate.performanceEvaluated ? `${metric(selectedCandidate.requiredInjectionDeltaVKmS, 2)} km/s` : 'noch nicht bewertet'}</strong></article>
              <article><span>Δv verfügbar</span><strong>{selectedCandidate.performanceEvaluated ? `${metric(selectedCandidate.availableInjectionDeltaVKmS, 2)} km/s` : 'noch nicht bewertet'}</strong></article>
              <article><span>Δv-Defizit</span><strong>{selectedCandidate.performanceEvaluated ? `${metric(deficit, 2)} km/s` : 'noch nicht bewertet'}</strong></article>
              <article><span>Zielrest</span><strong>{metric(selectedCandidate.targetAlignmentDeg)}°</strong></article>
              <article><span>Korridor</span><strong>{selectedCandidate.corridorSatisfied === undefined ? '–' : selectedCandidate.corridorSatisfied ? 'erfüllt' : 'verfehlt'}</strong></article>
              <article><span>Kollision</span><strong>{selectedCandidate.collisionFree === undefined ? '–' : selectedCandidate.collisionFree ? 'frei' : 'Treffer'}</strong></article>
            </section>
          )
          : null}

        {selectedCandidate && comparisonCandidate
          ? (
            <section className={`calculation-comparison${finite(requiredDelta) && Math.abs(requiredDelta) > 5 ? ' has-large-delta' : ''}`}>
              <div>
                <small>Stufenvergleich für {selectedCandidate.date}</small>
                <strong>{stageName(comparisonCandidate.stage)} → {stageName(selectedCandidate.stage)}</strong>
              </div>
              <span>Δv Soll {metric(comparisonCandidate.requiredInjectionDeltaVKmS, 2)} → {metric(selectedCandidate.requiredInjectionDeltaVKmS, 2)} km/s</span>
              <span>Zielrest {metric(comparisonCandidate.targetAlignmentDeg)}° → {metric(selectedCandidate.targetAlignmentDeg)}°</span>
              <span>Sprung {finite(requiredDelta) ? `${requiredDelta >= 0 ? '+' : ''}${requiredDelta.toFixed(2)} km/s` : '–'}</span>
            </section>
          )
          : null}

        <section className="calculation-table-wrap">
          <table className="calculation-table">
            <thead>
              <tr>
                <th>#</th><th>Datum</th><th>Stufe</th><th>Status</th><th>Qualität</th><th>Δv Soll</th><th>Δv Defizit</th><th>Zielrest</th>
              </tr>
            </thead>
            <tbody>
              {filteredCandidates.map((candidate) => (
                <tr
                  key={candidate.id}
                  className={candidate.id === selectedCandidate?.id ? 'is-selected' : ''}
                >
                  <td>
                    <button
                      type="button"
                      className="calculation-row-select"
                      aria-label={`Variante ${candidate.iteration} auswählen`}
                      onClick={() => setSelectedId(candidate.id)}
                    >
                      {candidate.iteration}
                    </button>
                  </td>
                  <td>{candidate.date}</td>
                  <td>{stageName(candidate.stage)}</td>
                  <td><span className={`calculation-status is-${candidate.status}`}>{STATUS_NAMES[candidate.status] ?? candidate.status}</span></td>
                  <td>{metric(candidate.quality)}</td>
                  <td>{metric(candidate.requiredInjectionDeltaVKmS, 2)}</td>
                  <td>{metric(candidateDeficit(candidate), 2)}</td>
                  <td>{metric(candidate.targetAlignmentDeg)}°</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <footer>
        <p>{trace.running ? `Suche läuft bis mindestens ${targetGoodResults} gute Resultate gefunden oder alle Passagevarianten ausgeschöpft sind.` : `${trace.candidates.length} Solvervarianten protokolliert. ${trace.stopReason ?? ''}`}</p>
        <button type="button" onClick={onClose}>Schließen</button>
      </footer>
    </dialog>
  )
}

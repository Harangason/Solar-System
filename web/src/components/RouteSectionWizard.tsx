import { useEffect, useRef, useState, type ChangeEvent } from 'react'

import { ROUTE_INTERSTELLAR_SYSTEMS } from '../interstellarTargets'
import {
  MAX_PARTIAL_ORBIT_ANGLE_DEG,
  createRouteSection,
  type RouteBoundaryBehavior,
  type RoutePassageMode,
  type RouteSectionDefinition,
} from '../routeSections'
import type { MoonData, PlanetData } from '../types'

interface RouteSectionWizardProps {
  planets: PlanetData[]
  moons: MoonData[]
  suggestedOriginId: string
  suggestedTargetId: string
  initialSection?: RouteSectionDefinition
  initialStep?: WizardStep
  mode?: 'create' | 'edit'
  onCancel: () => void
  onSubmit: (section: RouteSectionDefinition) => void
}

type WizardStep = 1 | 2 | 3 | 4

const BOUNDARY_BEHAVIORS: Array<{ value: RouteBoundaryBehavior; label: string }> = [
  { value: 'ballistic', label: 'Ballistisch · Geschwindigkeit beibehalten' },
  { value: 'tangential-prograde', label: 'Tangential · prograd' },
  { value: 'tangential-retrograde', label: 'Tangential · retrograd' },
  { value: 'tangential-accelerate', label: 'Tangential · Geschwindigkeit erhöhen' },
  { value: 'radial', label: 'Radial · einwärts / auswärts' },
]

const BEHAVIOR_GLOSSARY: Record<RouteBoundaryBehavior, string> = {
  ballistic: 'Kein aktiver Impuls am Rand des Korridors. Die Sonde behält ihre berechnete Relativgeschwindigkeit.',
  'tangential-prograde': 'Die Geschwindigkeit wird tangential zur Passage in Umlaufrichtung ausgerichtet. Das ist der Standard für einen vorwärts laufenden Umlaufbogen.',
  'tangential-retrograde': 'Die Geschwindigkeit wird tangential gegen die Umlaufrichtung ausgerichtet. Das wirkt wie Bremsen oder Einfangen.',
  'tangential-accelerate': 'Zusätzlicher prograder Impuls am Eintritt oder Austritt. Die Planungsabsicht wird gespeichert; das verfügbare Δv+ begrenzt später die reale Beschleunigung.',
  radial: 'Die Richtung folgt der Linie zum Zielkörper: einwärts zum Objekt oder auswärts davon weg.',
}

const DIRECTION_GLOSSARY = {
  prograde: 'Prograd bedeutet: in derselben Richtung wie der lokale Umlaufbogen um das Ziel.',
  retrograde: 'Retrograd bedeutet: entgegengesetzt zum lokalen Umlaufbogen, also bremsend gegen die Bewegungsrichtung.',
} as const

function boundaryBehaviorLabel(value: RouteBoundaryBehavior) {
  return BOUNDARY_BEHAVIORS.find((behavior) => behavior.value === value)?.label ?? value
}

function passageLabel(section: RouteSectionDefinition) {
  if (section.passage.mode === 'full-orbit') {
    return `Volle Umrundung · 360° · ${section.passage.orbitDirection === 'prograde' ? 'prograd' : 'retrograd'}`
  }
  if (section.passage.mode === 'partial-orbit') {
    return `Teilumrundung · ${section.passage.orbitAngleDeg.toFixed(0)}° · ${section.passage.orbitDirection === 'prograde' ? 'prograd' : 'retrograd'}`
  }
  return 'Direkte Passage · keine vorgegebene Umrundung'
}

function objectName(objectId: string, planets: PlanetData[], moons: MoonData[]) {
  if (!objectId) return 'Nicht gewählt'
  if (objectId === 'sun') return 'Sonne'
  return planets.find((planet) => planet.id === objectId)?.name
    ?? moons.find((moon) => moon.id === objectId)?.name
    ?? ROUTE_INTERSTELLAR_SYSTEMS.find((system) => system.id === objectId)?.name
    ?? objectId
}

function finitePositive(value: number, fallback: number) {
  return Number.isFinite(value) && value >= 0 ? value : fallback
}

function normalizePartialOrbitAngle(value: number, fallback = 45) {
  return Number.isFinite(value)
    ? Math.min(MAX_PARTIAL_ORBIT_ANGLE_DEG, Math.max(1, Math.round(value)))
    : fallback
}

export function RouteSectionWizard({
  planets,
  moons,
  suggestedOriginId,
  suggestedTargetId,
  initialSection,
  initialStep = 1,
  mode = 'create',
  onCancel,
  onSubmit,
}: RouteSectionWizardProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [step, setStep] = useState<WizardStep>(initialStep)
  const [draft, setDraft] = useState<RouteSectionDefinition>(
    () => initialSection ? structuredClone(initialSection) : createRouteSection(suggestedOriginId, suggestedTargetId),
  )
  const [orbitAngleInput, setOrbitAngleInput] = useState(() => (
    initialSection?.passage.mode === 'partial-orbit'
      ? String(normalizePartialOrbitAngle(initialSection.passage.orbitAngleDeg))
      : '45'
  ))

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return undefined
    dialog.showModal()
    return () => {
      if (dialog.open) dialog.close()
    }
  }, [])

  const setClockAngle = (event: ChangeEvent<HTMLInputElement>) => {
    const angle = event.target.valueAsNumber * Math.PI / 180
    setDraft((current) => ({
      ...current,
      corridor: {
        ...current.corridor,
        centerDirection: [Math.cos(angle), Math.sin(angle), 0],
      },
    }))
  }
  const clockAngleDeg = Math.atan2(draft.corridor.centerDirection[1], draft.corridor.centerDirection[0]) * 180 / Math.PI
  const setPassageMode = (mode: RoutePassageMode) => {
    const partialAngle = draft.passage.mode === 'partial-orbit'
      ? normalizePartialOrbitAngle(draft.passage.orbitAngleDeg)
      : 45
    if (mode === 'partial-orbit') {
      setOrbitAngleInput(String(partialAngle))
    }
    setDraft((current) => ({
      ...current,
      passage: {
        ...current.passage,
        mode,
        orbitAngleDeg: mode === 'direct'
          ? 0
          : mode === 'full-orbit'
            ? 360
            : partialAngle,
      },
    }))
  }
  const commitOrbitAngleInput = () => {
    const angle = normalizePartialOrbitAngle(Number(orbitAngleInput), draft.passage.orbitAngleDeg || 45)
    setOrbitAngleInput(String(angle))
    setDraft((current) => ({
      ...current,
      passage: {
        ...current.passage,
        orbitAngleDeg: angle,
      },
    }))
  }
  const goToNextStep = () => {
    if (step === 3 && draft.passage.mode === 'partial-orbit') {
      commitOrbitAngleInput()
    }
    setStep((current) => (current + 1) as WizardStep)
  }

  return (
    <dialog
      ref={dialogRef}
      className="route-section-wizard"
      aria-labelledby="route-wizard-title"
      onCancel={(event) => {
        event.preventDefault()
        onCancel()
      }}
    >
      <header>
        <div>
          <small>{mode === 'edit' ? 'Routenabschnitt bearbeiten' : 'Neuer Routenabschnitt'} · Schritt {step} von 4</small>
          <h2 id="route-wizard-title">
            {step === 1 && 'Verbindung festlegen'}
            {step === 2 && 'Zielkorridor definieren'}
            {step === 3 && 'Passage & Umrundung'}
            {step === 4 && 'Anforderungen prüfen'}
          </h2>
        </div>
        <button type="button" className="wizard-close" aria-label="Assistent schließen" onClick={onCancel}>×</button>
      </header>

      <ol className="wizard-progress" aria-label="Fortschritt">
        <li className={step >= 1 ? 'complete' : ''} aria-current={step === 1 ? 'step' : undefined}><span>1</span>Verbindung</li>
        <li className={step >= 2 ? 'complete' : ''} aria-current={step === 2 ? 'step' : undefined}><span>2</span>Korridor</li>
        <li className={step >= 3 ? 'complete' : ''} aria-current={step === 3 ? 'step' : undefined}><span>3</span>Passage</li>
        <li className={step >= 4 ? 'complete' : ''} aria-current={step === 4 ? 'step' : undefined}><span>4</span>Prüfen</li>
      </ol>

      <div className="wizard-content">
        {step === 1 && (
          <fieldset>
            <legend>Wo beginnt und endet dieser Abschnitt?</legend>
            <p>Jeder Abschnitt wird unabhängig angelegt. Eine Verkettung entsteht nur durch deine ausdrückliche Auswahl.</p>
            <div className="wizard-connection">
              <label>
                <span>Ursprung</span>
                <select
                  value={draft.originId}
                  onChange={(event) => setDraft((current) => ({ ...current, originId: event.target.value }))}
                >
                  <option value="" disabled>Ursprung wählen …</option>
                  <optgroup label="Sonnensystem">
                    {draft.targetId !== 'sun' && <option value="sun">Sonne</option>}
                    {planets.filter((planet) => planet.id !== draft.targetId).map((planet) => (
                      <option key={`wizard-origin-${planet.id}`} value={planet.id}>{planet.name}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Monde">
                    {moons.filter((moon) => moon.id !== draft.targetId).map((moon) => (
                      <option key={`wizard-origin-${moon.id}`} value={moon.id}>
                        {planets.find((planet) => planet.id === moon.parentId)?.name ?? moon.parentId} · {moon.name}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Exoplanetensysteme">
                    {ROUTE_INTERSTELLAR_SYSTEMS.filter((system) => system.id !== draft.targetId).map((system) => (
                      <option key={`wizard-origin-${system.id}`} value={system.id}>{system.name} · {system.distanceLy.toFixed(1)} Lj</option>
                    ))}
                  </optgroup>
                </select>
              </label>
              <span className="wizard-arrow" aria-hidden="true">→</span>
              <label>
                <span>Ziel</span>
                <select
                  value={draft.targetId}
                  onChange={(event) => setDraft((current) => ({ ...current, targetId: event.target.value }))}
                >
                  <option value="" disabled>Ziel wählen …</option>
                  <optgroup label="Sonnensystem">
                    {draft.originId !== 'sun' && <option value="sun">Sonne</option>}
                    {planets.filter((planet) => planet.id !== draft.originId).map((planet) => (
                      <option key={`wizard-target-${planet.id}`} value={planet.id}>{planet.name}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Monde">
                    {moons.filter((moon) => moon.id !== draft.originId).map((moon) => (
                      <option key={`wizard-target-${moon.id}`} value={moon.id}>
                        {planets.find((planet) => planet.id === moon.parentId)?.name ?? moon.parentId} · {moon.name}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Exoplanetensysteme">
                    {ROUTE_INTERSTELLAR_SYSTEMS.filter((system) => system.id !== draft.originId).map((system) => (
                      <option key={`wizard-target-${system.id}`} value={system.id}>{system.name} · {system.distanceLy.toFixed(1)} Lj</option>
                    ))}
                  </optgroup>
                </select>
              </label>
            </div>
            <output className="wizard-route-preview">
              {objectName(draft.originId, planets, moons)} <span>→</span> {objectName(draft.targetId, planets, moons)}
            </output>
          </fieldset>
        )}

        {step === 2 && (
          <fieldset>
            <legend>Welcher Bereich am Ziel ist zulässig?</legend>
            <p>Diese Werte sind neutrale Standardwerte für den neuen Abschnitt und keine Kopie des aktiven Abschnitts.</p>
            <label className="wizard-checkbox">
              <input
                type="checkbox"
                checked={draft.corridor.enabled}
                onChange={(event) => setDraft((current) => ({
                  ...current,
                  corridor: { ...current.corridor, enabled: event.target.checked },
                }))}
              />
              <span>Zielkorridor verwenden</span>
            </label>
            <div className="wizard-range-grid">
              <label>
                <span>Bogenbreite ±</span>
                <input
                  type="range"
                  min="1"
                  max="70"
                  step="1"
                  value={draft.corridor.horizontalHalfAngleDeg}
                  onChange={(event) => setDraft((current) => ({
                    ...current,
                    corridor: { ...current.corridor, horizontalHalfAngleDeg: event.target.valueAsNumber },
                  }))}
                />
                <output>{draft.corridor.horizontalHalfAngleDeg.toFixed(0)}°</output>
              </label>
              <label>
                <span>Min/Max-Spanne ±</span>
                <input
                  type="range"
                  min="1"
                  max="30"
                  step="1"
                  value={draft.corridor.verticalHalfAngleDeg}
                  onChange={(event) => setDraft((current) => ({
                    ...current,
                    corridor: { ...current.corridor, verticalHalfAngleDeg: event.target.valueAsNumber },
                  }))}
                />
                <output>{draft.corridor.verticalHalfAngleDeg.toFixed(0)}°</output>
              </label>
              <label>
                <span>Position</span>
                <input type="range" min="-180" max="180" step="1" value={clockAngleDeg} onChange={setClockAngle} />
                <output>{clockAngleDeg.toFixed(0)}°</output>
              </label>
            </div>
          </fieldset>
        )}

        {step === 3 && (
          <fieldset>
            <legend>Wie soll sich die Sonde am Ziel verhalten?</legend>
            <p>Die Passage beschreibt Eintritt, Umlaufbogen und Austritt als gemeinsamen räumlichen Plan. Eine volle oder teilweise Umrundung kann zusätzliche Einfang- und Ausflugmanöver erfordern.</p>
            <div className="wizard-passage-modes" role="radiogroup" aria-label="Art der Zielpassage">
              <label>
                <input type="radio" name="passage-mode" checked={draft.passage.mode === 'direct'} onChange={() => setPassageMode('direct')} />
                <span><strong>Direkte Passage</strong><small>Keine Umrundung vorgeben</small></span>
              </label>
              <label>
                <input type="radio" name="passage-mode" checked={draft.passage.mode === 'partial-orbit'} onChange={() => setPassageMode('partial-orbit')} />
                <span><strong>Teilumrundung</strong><small>Umlaufbogen über einen Winkel</small></span>
              </label>
              <label>
                <input type="radio" name="passage-mode" checked={draft.passage.mode === 'full-orbit'} onChange={() => setPassageMode('full-orbit')} />
                <span><strong>Volle Umrundung</strong><small>Ein vollständiger Umlauf mit 360°</small></span>
              </label>
            </div>

            {draft.passage.mode !== 'direct' && (
              <div className="wizard-passage-grid">
                <label>
                  <span>Umrundungswinkel</span>
                  <input
                    type="number"
                    min="1"
                    max={MAX_PARTIAL_ORBIT_ANGLE_DEG}
                    step="1"
                    disabled={draft.passage.mode === 'full-orbit'}
                    value={draft.passage.mode === 'full-orbit' ? 360 : orbitAngleInput}
                    onChange={(event) => setOrbitAngleInput(event.target.value)}
                    onBlur={commitOrbitAngleInput}
                  />
                  <small>1–1080° · 540° entsprechen 1½ Umläufen</small>
                </label>
                <label>
                  <span>Umlaufrichtung</span>
                  <select
                    value={draft.passage.orbitDirection}
                    onChange={(event) => setDraft((current) => ({
                      ...current,
                      passage: {
                        ...current.passage,
                        orbitDirection: event.target.value as 'prograde' | 'retrograde',
                      },
                    }))}
                  >
                    <option value="prograde">Prograd</option>
                    <option value="retrograde">Retrograd</option>
                  </select>
                </label>
              </div>
            )}

            <div className="wizard-passage-grid">
              <label>
                <span>Eintrittsverhalten</span>
                <select
                  value={draft.passage.entryBehavior}
                  onChange={(event) => setDraft((current) => ({
                    ...current,
                    passage: {
                      ...current.passage,
                      entryBehavior: event.target.value as RouteBoundaryBehavior,
                    },
                  }))}
                >
                  {BOUNDARY_BEHAVIORS.map((behavior) => <option key={`entry-${behavior.value}`} value={behavior.value}>{behavior.label}</option>)}
                </select>
              </label>
              <label>
                <span>Austrittsverhalten</span>
                <select
                  value={draft.passage.exitBehavior}
                  onChange={(event) => setDraft((current) => ({
                    ...current,
                    passage: {
                      ...current.passage,
                      exitBehavior: event.target.value as RouteBoundaryBehavior,
                    },
                  }))}
                >
                  {BOUNDARY_BEHAVIORS.map((behavior) => <option key={`exit-${behavior.value}`} value={behavior.value}>{behavior.label}</option>)}
                </select>
              </label>
            </div>
            <dl className="wizard-glossary" aria-label="Glossar zur Passage">
              <div>
                <dt>Umlaufrichtung</dt>
                <dd>{DIRECTION_GLOSSARY[draft.passage.orbitDirection]}</dd>
              </div>
              <div>
                <dt>Eintritt</dt>
                <dd>{BEHAVIOR_GLOSSARY[draft.passage.entryBehavior]}</dd>
              </div>
              <div>
                <dt>Austritt</dt>
                <dd>{BEHAVIOR_GLOSSARY[draft.passage.exitBehavior]}</dd>
              </div>
            </dl>
            <output className="wizard-route-preview">{passageLabel(draft)}</output>
          </fieldset>
        )}

        {step === 4 && (
          <fieldset>
            <legend>Abschnitt vor dem Erstellen prüfen</legend>
            <div className="wizard-delta-v">
              <label>
                <span>Δv −</span>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={draft.deltaVMinusKmS}
                  onChange={(event) => setDraft((current) => ({
                    ...current,
                    deltaVMinusKmS: finitePositive(event.target.valueAsNumber, current.deltaVMinusKmS),
                  }))}
                />
                <small>km/s</small>
              </label>
              <label>
                <span>Δv +</span>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={draft.deltaVPlusKmS}
                  onChange={(event) => setDraft((current) => ({
                    ...current,
                    deltaVPlusKmS: finitePositive(event.target.valueAsNumber, current.deltaVPlusKmS),
                  }))}
                />
                <small>km/s</small>
              </label>
            </div>
            <dl className="wizard-summary">
              <div><dt>Verbindung</dt><dd>{objectName(draft.originId, planets, moons)} → {objectName(draft.targetId, planets, moons)}</dd></div>
              <div><dt>Zielkorridor</dt><dd>{draft.corridor.enabled ? 'Aktiv' : 'Deaktiviert'}</dd></div>
              <div><dt>Passage</dt><dd>{passageLabel(draft)}</dd></div>
              <div><dt>Eintritt / Austritt</dt><dd>{boundaryBehaviorLabel(draft.passage.entryBehavior)} / {boundaryBehaviorLabel(draft.passage.exitBehavior)}</dd></div>
              <div><dt>Winkelbereich</dt><dd>±{draft.corridor.horizontalHalfAngleDeg.toFixed(0)}° / ±{draft.corridor.verticalHalfAngleDeg.toFixed(0)}°</dd></div>
              <div><dt>Δv-Fächer</dt><dd>−{draft.deltaVMinusKmS.toFixed(1)} / +{draft.deltaVPlusKmS.toFixed(1)} km/s</dd></div>
            </dl>
          </fieldset>
        )}
      </div>

      <footer>
        <button type="button" className="wizard-cancel" onClick={onCancel}>Abbrechen</button>
        <div>
          {step > 1 && <button type="button" onClick={() => setStep((current) => (current - 1) as WizardStep)}>Zurück</button>}
          {step < 4
            ? <button type="button" className="primary" disabled={step === 1 && (!draft.originId || !draft.targetId || draft.originId === draft.targetId)} onClick={goToNextStep}>Weiter</button>
            : <button type="button" className="primary" onClick={() => onSubmit(draft)}>{mode === 'edit' ? 'Änderungen speichern' : 'Abschnitt erstellen'}</button>}
        </div>
      </footer>
    </dialog>
  )
}

import { useEffect, useRef, useState, type ChangeEvent } from 'react'

import { ROUTE_INTERSTELLAR_SYSTEMS } from '../interstellarTargets'
import { createRouteSection, type RouteSectionDefinition } from '../routeSections'
import type { MoonData, PlanetData } from '../types'

interface RouteSectionWizardProps {
  planets: PlanetData[]
  moons: MoonData[]
  suggestedOriginId: string
  suggestedTargetId: string
  onCancel: () => void
  onCreate: (section: RouteSectionDefinition) => void
}

type WizardStep = 1 | 2 | 3

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

export function RouteSectionWizard({
  planets,
  moons,
  suggestedOriginId,
  suggestedTargetId,
  onCancel,
  onCreate,
}: RouteSectionWizardProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [step, setStep] = useState<WizardStep>(1)
  const [draft, setDraft] = useState<RouteSectionDefinition>(
    () => createRouteSection(suggestedOriginId, suggestedTargetId),
  )

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
          <small>Neuer Routenabschnitt · Schritt {step} von 3</small>
          <h2 id="route-wizard-title">
            {step === 1 && 'Verbindung festlegen'}
            {step === 2 && 'Zielkorridor definieren'}
            {step === 3 && 'Anforderungen prüfen'}
          </h2>
        </div>
        <button type="button" className="wizard-close" aria-label="Assistent schließen" onClick={onCancel}>×</button>
      </header>

      <ol className="wizard-progress" aria-label="Fortschritt">
        <li className={step >= 1 ? 'complete' : ''} aria-current={step === 1 ? 'step' : undefined}><span>1</span>Verbindung</li>
        <li className={step >= 2 ? 'complete' : ''} aria-current={step === 2 ? 'step' : undefined}><span>2</span>Korridor</li>
        <li className={step >= 3 ? 'complete' : ''} aria-current={step === 3 ? 'step' : undefined}><span>3</span>Prüfen</li>
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
          {step < 3
            ? <button type="button" className="primary" disabled={step === 1 && (!draft.originId || !draft.targetId || draft.originId === draft.targetId)} onClick={() => setStep((current) => (current + 1) as WizardStep)}>Weiter</button>
            : <button type="button" className="primary" onClick={() => onCreate(draft)}>Abschnitt erstellen</button>}
        </div>
      </footer>
    </dialog>
  )
}

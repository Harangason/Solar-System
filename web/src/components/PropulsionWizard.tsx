import { useEffect, useMemo, useRef, useState } from 'react'

import {
  applyPropulsionConfiguration,
  applyPropulsionPreset,
  PROPULSION_PRESETS,
} from '../propulsionModels'
import type { MissionConfig, PropulsionModule, TechnologyReadiness } from '../types'

interface PropulsionWizardProps {
  config: MissionConfig
  onCancel: () => void
  onApply: (config: MissionConfig) => void
}

type WizardStep = 1 | 2 | 3

const READINESS_LABELS: Record<TechnologyReadiness, string> = {
  operational: 'Einsatzbereit',
  demonstrated: 'Erprobt',
  experimental: 'Experimentell',
  conceptual: 'Konzept',
  speculative: 'Spekulativ',
  fictional: 'Fiktiv',
}

const DIRECTION_LABELS: Record<PropulsionModule['directionMode'], string> = {
  prograde: 'Prograd',
  retrograde: 'Retrograd',
  radial_out: 'Radial nach außen',
  radial_in: 'Radial nach innen',
  custom_vector: 'Eigener Vektor',
  spin_plane_controlled: 'Über Spinnebene',
}

const PARAMETER_LABELS: Record<string, { label: string; unit?: string; step?: number }> = {
  thrustN: { label: 'Schub', unit: 'N', step: 0.01 },
  specificImpulseS: { label: 'Spezifischer Impuls', unit: 's', step: 1 },
  powerRequiredW: { label: 'Leistungsbedarf', unit: 'W', step: 100 },
  targetPerihelionAU: { label: 'Ziel-Perihel', unit: 'AE', step: 0.01 },
  burnDeltaVKmS: { label: 'Manöver-Δv', unit: 'km/s', step: 0.1 },
  burnDurationS: { label: 'Brenndauer', unit: 's', step: 1 },
  reactorPowerW: { label: 'Reaktorleistung', unit: 'W', step: 1000 },
  electricEfficiency: { label: 'Elektrischer Wirkungsgrad', step: 0.01 },
  radiatorAreaM2: { label: 'Radiatorfläche', unit: 'm²', step: 1 },
  thermalWasteW: { label: 'Abwärme', unit: 'W', step: 1000 },
  sailAreaM2: { label: 'Segelfläche', unit: 'm²', step: 1 },
  reflectivity: { label: 'Reflektivität', step: 0.1 },
  deploymentProgress: { label: 'Entfaltung', step: 0.01 },
  thermalLimitWm2: { label: 'Thermische Grenze', unit: 'W/m²', step: 100 },
  totalTetherCount: { label: 'Tethers gesamt', step: 1 },
  instrumentedTetherCount: { label: 'Instrumentierte Tethers', step: 1 },
  tetherLengthKm: { label: 'Tether-Länge', unit: 'km', step: 1 },
  effectiveDiameterKm: { label: 'Wirksamer Durchmesser', unit: 'km', step: 1 },
  tetherVoltageKV: { label: 'Tether-Spannung', unit: 'kV', step: 1 },
  spinRateRpm: { label: 'Spinrate', unit: 'rpm', step: 0.1 },
  endMassKg: { label: 'Endmasse', unit: 'kg', step: 0.1 },
  electronGunPowerW: { label: 'Elektronenkanone', unit: 'W', step: 10 },
  loopRadiusKm: { label: 'Schleifenradius', unit: 'km', step: 1 },
  magneticFieldStrengthT: { label: 'Magnetfeld', unit: 'T', step: 0.001 },
  exhaustVelocityKmS: { label: 'Ausströmgeschwindigkeit', unit: 'km/s', step: 1 },
  antimatterMassMg: { label: 'Antimateriemasse', unit: 'mg', step: 0.001 },
  conversionEfficiency: { label: 'Umwandlungswirkungsgrad', step: 0.01 },
  containmentPowerW: { label: 'Containment-Leistung', unit: 'W', step: 1000 },
  warpFactor: { label: 'Warp-Faktor', step: 0.1 },
  bubbleRadiusKm: { label: 'Blasenradius', unit: 'km', step: 1 },
  exoticEnergyRequirement: { label: 'Exotischer Energiebedarf', unit: 'J', step: 1e40 },
}

function cloneConfig(config: MissionConfig): MissionConfig {
  return {
    ...config,
    propulsionModules: config.propulsionModules.map((item) => ({
      ...item,
      parameters: { ...item.parameters },
      warnings: [...item.warnings],
    })),
  }
}

function humanizeParameter(key: string) {
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (character) => character.toLocaleUpperCase('de-DE'))
}

function configurationIssues(config: MissionConfig) {
  const enabled = config.propulsionModules.filter((item) => item.enabled)
  const blockers: string[] = []
  const warnings: string[] = []

  if (enabled.length === 0) blockers.push('Mindestens ein Antriebsmodul muss ausgewählt sein.')
  if (enabled.some((item) => ['fusion', 'antimatter'].includes(item.type)) && !config.theoreticalPropulsionMode) {
    blockers.push('Fusion und Antimaterie benötigen den theoretischen Szenariomodus.')
  }
  if (enabled.some((item) => item.type === 'warp')) {
    warnings.push('Warp ist eine fiktive Visualisierung und liefert keinen physikalischen Schub.')
  }
  if (enabled.some((item) => ['conceptual', 'speculative'].includes(item.readiness))) {
    warnings.push('Die Kombination enthält konzeptionelle oder spekulative Technologien.')
  }
  const electric = enabled.find((item) => item.type === 'electric_sail')
  if (electric) {
    const total = Number(electric.parameters.totalTetherCount)
    const instrumented = Number(electric.parameters.instrumentedTetherCount)
    const deployment = Number(electric.parameters.deploymentProgress)
    if (!(total > 0)) blockers.push('Das Electric Sail benötigt mindestens einen Tether.')
    if (instrumented < 0 || instrumented > total) blockers.push('Instrumentierte Tethers müssen zwischen 0 und der Gesamtzahl liegen.')
    if (deployment < 0 || deployment > 1) blockers.push('Die Electric-Sail-Entfaltung muss zwischen 0 und 1 liegen.')
  }
  enabled.forEach((item) => {
    if (item.dryMassKg < 0 || item.propellantMassKg < 0 || item.powerRequiredW < 0) {
      blockers.push(`${item.name}: Masse und Leistungsbedarf dürfen nicht negativ sein.`)
    }
  })

  return { blockers, warnings }
}

function ParameterInput({
  parameterKey,
  value,
  onChange,
}: {
  parameterKey: string
  value: number | string | boolean
  onChange: (value: number | string | boolean) => void
}) {
  const metadata = PARAMETER_LABELS[parameterKey]
  const label = metadata?.label ?? humanizeParameter(parameterKey)
  if (typeof value === 'boolean') {
    return (
      <label className="propulsion-wizard-toggle">
        <span>{label}</span>
        <input type="checkbox" checked={value} onChange={(event) => onChange(event.target.checked)} />
      </label>
    )
  }
  return (
    <label className="propulsion-wizard-field">
      <span>{label}</span>
      <span>
        <input
          type={typeof value === 'number' ? 'number' : 'text'}
          value={String(value)}
          step={metadata?.step ?? 'any'}
          onChange={(event) => onChange(typeof value === 'number' ? event.target.valueAsNumber : event.target.value)}
        />
        {metadata?.unit && <small>{metadata.unit}</small>}
      </span>
    </label>
  )
}

export function PropulsionWizard({ config, onCancel, onApply }: PropulsionWizardProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [step, setStep] = useState<WizardStep>(1)
  const [draft, setDraft] = useState(() => cloneConfig(config))
  const [presetId, setPresetId] = useState('oberth-electric')
  const enabledModules = draft.propulsionModules.filter((item) => item.enabled)
  const issues = useMemo(() => configurationIssues(draft), [draft])
  const totals = useMemo(() => enabledModules.reduce((sum, item) => ({
    dryMassKg: sum.dryMassKg + item.dryMassKg,
    propellantMassKg: sum.propellantMassKg + item.propellantMassKg,
    powerRequiredW: sum.powerRequiredW + item.powerRequiredW,
  }), { dryMassKg: 0, propellantMassKg: 0, powerRequiredW: 0 }), [enabledModules])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return undefined
    dialog.showModal()
    return () => {
      if (dialog.open) dialog.close()
    }
  }, [])

  const updateModule = (moduleId: string, update: (module: PropulsionModule) => PropulsionModule) => {
    setDraft((current) => ({
      ...current,
      propulsionModules: current.propulsionModules.map((item) => item.id === moduleId ? update(item) : item),
    }))
  }
  const updateParameter = (moduleId: string, key: string, value: number | string | boolean) => {
    updateModule(moduleId, (item) => ({
      ...item,
      ...(key === 'powerRequiredW' ? { powerRequiredW: Number(value) } : {}),
      parameters: { ...item.parameters, [key]: value },
    }))
  }
  const applyPreset = () => {
    const preset = PROPULSION_PRESETS.find((item) => item.id === presetId)
    if (preset) setDraft((current) => applyPropulsionPreset(current, preset))
  }

  return (
    <dialog
      ref={dialogRef}
      className="route-section-wizard propulsion-wizard"
      aria-labelledby="propulsion-wizard-title"
      onCancel={(event) => {
        event.preventDefault()
        onCancel()
      }}
    >
      <header>
        <div>
          <small>Antriebskonfiguration · Schritt {step} von 3</small>
          <h2 id="propulsion-wizard-title">
            {step === 1 && 'Antriebsmodule kombinieren'}
            {step === 2 && 'Module konfigurieren'}
            {step === 3 && 'Kombination prüfen'}
          </h2>
        </div>
        <button type="button" className="wizard-close" aria-label="Assistent schließen" onClick={onCancel}>×</button>
      </header>

      <ol className="wizard-progress" aria-label="Fortschritt">
        <li className={step >= 1 ? 'complete' : ''} aria-current={step === 1 ? 'step' : undefined}><span>1</span>Auswählen</li>
        <li className={step >= 2 ? 'complete' : ''} aria-current={step === 2 ? 'step' : undefined}><span>2</span>Konfigurieren</li>
        <li className={step >= 3 ? 'complete' : ''} aria-current={step === 3 ? 'step' : undefined}><span>3</span>Prüfen</li>
      </ol>

      <div className="wizard-content">
        {step === 1 && (
          <fieldset>
            <legend>Welche Systeme soll die Sonde kombinieren?</legend>
            <p>Wähle beliebig viele Module. Ein Preset ist nur ein Ausgangspunkt und kann anschließend frei verändert werden.</p>
            <div className="propulsion-wizard-preset">
              <label>
                <span>Schnellstart</span>
                <select value={presetId} onChange={(event) => setPresetId(event.target.value)}>
                  {PROPULSION_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
                </select>
              </label>
              <button type="button" onClick={applyPreset}>Preset anwenden</button>
            </div>
            <label className="wizard-checkbox propulsion-theoretical">
              <input
                type="checkbox"
                checked={draft.theoreticalPropulsionMode}
                onChange={(event) => setDraft((current) => ({ ...current, theoreticalPropulsionMode: event.target.checked }))}
              />
              <span>Theoretischen Szenariomodus erlauben</span>
            </label>
            <div className="propulsion-catalogue">
              {draft.propulsionModules.map((module) => (
                <label className={`propulsion-choice readiness-${module.readiness} ${module.enabled ? 'selected' : ''}`} key={module.id}>
                  <input
                    type="checkbox"
                    checked={module.enabled}
                    onChange={(event) => updateModule(module.id, (item) => ({ ...item, enabled: event.target.checked }))}
                  />
                  <span className="propulsion-choice-main">
                    <strong>{module.name}</strong>
                    <small>{module.type.replaceAll('_', ' ')}</small>
                  </span>
                  <span className={`readiness-badge ${module.readiness}`}>{READINESS_LABELS[module.readiness]}</span>
                </label>
              ))}
            </div>
            <output className="propulsion-selection-count">{enabledModules.length} von {draft.propulsionModules.length} Modulen ausgewählt</output>
          </fieldset>
        )}

        {step === 2 && (
          <fieldset>
            <legend>Parameter der ausgewählten Module</legend>
            <p>Massen, Leistung, Ausrichtung und technologiespezifische Werte fließen in die Missionskonfiguration ein.</p>
            <div className="propulsion-config-list">
              {enabledModules.map((module, index) => (
                <details className={`propulsion-config-card readiness-${module.readiness}`} key={module.id} open={index === 0}>
                  <summary>
                    <span><strong>{module.name}</strong><small>{READINESS_LABELS[module.readiness]}</small></span>
                    <span>{(module.dryMassKg + module.propellantMassKg).toLocaleString('de-DE')} kg</span>
                  </summary>
                  <div className="propulsion-common-fields">
                    <label className="propulsion-wizard-field">
                      <span>Trockenmasse</span>
                      <span><input type="number" min="0" step="1" value={module.dryMassKg} onChange={(event) => updateModule(module.id, (item) => ({ ...item, dryMassKg: event.target.valueAsNumber }))} /><small>kg</small></span>
                    </label>
                    <label className="propulsion-wizard-field">
                      <span>Treibstoffmasse</span>
                      <span><input type="number" min="0" step="1" value={module.propellantMassKg} onChange={(event) => updateModule(module.id, (item) => ({ ...item, propellantMassKg: event.target.valueAsNumber }))} /><small>kg</small></span>
                    </label>
                    <label className="propulsion-wizard-field">
                      <span>Leistungsbedarf</span>
                      <span><input type="number" min="0" step="100" value={module.powerRequiredW} onChange={(event) => updateModule(module.id, (item) => ({ ...item, powerRequiredW: event.target.valueAsNumber, parameters: 'powerRequiredW' in item.parameters ? { ...item.parameters, powerRequiredW: event.target.valueAsNumber } : item.parameters }))} /><small>W</small></span>
                    </label>
                    <label className="propulsion-wizard-field">
                      <span>Ausrichtung</span>
                      <select value={module.directionMode} onChange={(event) => updateModule(module.id, (item) => ({ ...item, directionMode: event.target.value as PropulsionModule['directionMode'] }))}>
                        {Object.entries(DIRECTION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </label>
                    <label className="propulsion-wizard-toggle">
                      <span>Visualisierung</span>
                      <input type="checkbox" checked={module.visualEnabled} onChange={(event) => updateModule(module.id, (item) => ({ ...item, visualEnabled: event.target.checked }))} />
                    </label>
                  </div>
                  <div className="propulsion-specific-fields">
                    {Object.entries(module.parameters)
                      .filter(([key]) => key !== 'powerRequiredW')
                      .map(([key, value]) => (
                        <ParameterInput key={key} parameterKey={key} value={value} onChange={(next) => updateParameter(module.id, key, next)} />
                      ))}
                  </div>
                </details>
              ))}
              {enabledModules.length === 0 && <p className="propulsion-empty">Noch kein Modul ausgewählt. Gehe zurück und wähle mindestens eines aus.</p>}
            </div>
          </fieldset>
        )}

        {step === 3 && (
          <fieldset>
            <legend>Konfiguration vor der Übernahme prüfen</legend>
            <p>Erst die Bestätigung schreibt diese Kombination in die Mission. Abbrechen lässt die bisherige Konfiguration unverändert.</p>
            <dl className="wizard-summary propulsion-total-summary">
              <div><dt>Aktive Module</dt><dd>{enabledModules.length}</dd></div>
              <div><dt>Trockenmasse</dt><dd>{totals.dryMassKg.toLocaleString('de-DE')} kg</dd></div>
              <div><dt>Treibstoff</dt><dd>{totals.propellantMassKg.toLocaleString('de-DE')} kg</dd></div>
              <div><dt>Leistungsbedarf</dt><dd>{totals.powerRequiredW.toLocaleString('de-DE')} W</dd></div>
            </dl>
            <ol className="propulsion-review-list">
              {enabledModules.map((module) => (
                <li key={module.id}>
                  <span><strong>{module.name}</strong><small>{DIRECTION_LABELS[module.directionMode]}</small></span>
                  <span>{READINESS_LABELS[module.readiness]}</span>
                </li>
              ))}
            </ol>
            {issues.blockers.map((issue) => <p className="propulsion-issue blocker" key={issue}><strong>Blockiert</strong>{issue}</p>)}
            {issues.warnings.map((issue) => <p className="propulsion-issue warning" key={issue}><strong>Hinweis</strong>{issue}</p>)}
            {issues.blockers.length === 0 && <p className="propulsion-issue ready"><strong>Bereit</strong>Die Kombination kann in die Mission übernommen werden.</p>}
          </fieldset>
        )}
      </div>

      <footer>
        <button type="button" className="wizard-cancel" onClick={onCancel}>Abbrechen</button>
        <div>
          {step > 1 && <button type="button" onClick={() => setStep((current) => (current - 1) as WizardStep)}>Zurück</button>}
          {step < 3
            ? <button type="button" className="primary" disabled={step === 1 && enabledModules.length === 0} onClick={() => setStep((current) => (current + 1) as WizardStep)}>Weiter</button>
            : <button
                type="button"
                className="primary"
                disabled={issues.blockers.length > 0}
                onClick={() => onApply(applyPropulsionConfiguration(config, draft.propulsionModules, draft.theoreticalPropulsionMode))}
              >
                In Mission übernehmen
              </button>}
        </div>
      </footer>
    </dialog>
  )
}

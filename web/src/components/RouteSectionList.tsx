import { useState } from 'react'

import { ROUTE_INTERSTELLAR_SYSTEMS } from '../interstellarTargets'
import type { PlanetData } from '../types'
import type { RouteSectionDefinition } from '../routeSections'
import { RouteSectionWizard } from './RouteSectionWizard'

interface RouteSectionListProps {
  planets: PlanetData[]
  sections: RouteSectionDefinition[]
  activeSectionId: string
  suggestedOriginId: string
  suggestedTargetId: string
  onCreate: (section: RouteSectionDefinition) => void
  onEdit: (sectionId: string) => void
  onDelete: (sectionId: string) => void
  onMove: (sectionId: string, direction: -1 | 1) => void
}

function objectName(objectId: string, planets: PlanetData[]) {
  if (objectId === 'sun') return 'Sonne'
  return planets.find((planet) => planet.id === objectId)?.name
    ?? ROUTE_INTERSTELLAR_SYSTEMS.find((system) => system.id === objectId)?.name
    ?? objectId
}

export function RouteSectionList({
  planets,
  sections,
  activeSectionId,
  suggestedOriginId,
  suggestedTargetId,
  onCreate,
  onEdit,
  onDelete,
  onMove,
}: RouteSectionListProps) {
  const [wizardOpen, setWizardOpen] = useState(false)

  return (
    <section className="route-section-list" aria-labelledby="route-sections-title">
      <header>
        <div>
          <p className="eyebrow">Abschnittsplanung</p>
          <h2 id="route-sections-title">Routenabschnitte</h2>
        </div>
        <button type="button" className="route-section-new" onClick={() => setWizardOpen(true)}>+ Neu</button>
      </header>

      <div className="route-section-table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Nr.</th>
              <th scope="col">Verbindung</th>
              <th scope="col">Zielkorridor</th>
              <th scope="col">Δv-Fächer</th>
              <th scope="col"><span className="visually-hidden">Aktionen</span></th>
            </tr>
          </thead>
          <tbody>
            {sections.map((section, index) => {
              const isActive = section.id === activeSectionId
              const previousSection = sections[index - 1]
              const isDisconnected = Boolean(previousSection && previousSection.targetId !== section.originId)
              return (
                <tr key={section.id} className={`${isActive ? 'active ' : ''}${isDisconnected ? 'disconnected' : ''}`.trim()}>
                  <td>
                    <div className="route-section-index-cell">
                      <span className="route-section-number">{String(index + 1).padStart(2, '0')}</span>
                      <div className="route-section-order" role="group" aria-label={`Abschnitt ${index + 1} verschieben`}>
                        <button
                          type="button"
                          title="Nach oben"
                          aria-label={`Abschnitt ${index + 1} nach oben verschieben`}
                          disabled={index === 0}
                          onClick={() => onMove(section.id, -1)}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          title="Nach unten"
                          aria-label={`Abschnitt ${index + 1} nach unten verschieben`}
                          disabled={index === sections.length - 1}
                          onClick={() => onMove(section.id, 1)}
                        >
                          ↓
                        </button>
                      </div>
                    </div>
                  </td>
                  <td>
                    <strong>{objectName(section.originId, planets)} → {objectName(section.targetId, planets)}</strong>
                    {isActive && <small>Aktiv in 2D und 3D</small>}
                    {isDisconnected && previousSection && (
                      <small className="route-chain-warning">
                        Verbindung unterbrochen: Ursprung muss {objectName(previousSection.targetId, planets)} sein.
                      </small>
                    )}
                  </td>
                  <td>
                    {section.corridor.enabled && section.corridor.blocked
                      ? <span className="route-warning">Gesperrt</span>
                      : section.corridor.enabled
                      ? `±${section.corridor.horizontalHalfAngleDeg.toFixed(0)}° / ±${section.corridor.verticalHalfAngleDeg.toFixed(0)}°`
                      : 'Deaktiviert'}
                  </td>
                  <td>−{section.deltaVMinusKmS.toFixed(1)} / +{section.deltaVPlusKmS.toFixed(1)} km/s</td>
                  <td>
                    <div className="route-section-actions">
                      <button type="button" className={isActive ? 'selected' : ''} onClick={() => onEdit(section.id)}>
                        {isActive ? 'Aktiv' : 'Bearbeiten'}
                      </button>
                      <button type="button" className="danger" disabled={sections.length === 1} onClick={() => onDelete(section.id)}>Löschen</button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {wizardOpen && (
        <RouteSectionWizard
          planets={planets}
          suggestedOriginId={suggestedOriginId}
          suggestedTargetId={suggestedTargetId}
          onCancel={() => setWizardOpen(false)}
          onCreate={(section) => {
            onCreate(section)
            setWizardOpen(false)
          }}
        />
      )}
    </section>
  )
}

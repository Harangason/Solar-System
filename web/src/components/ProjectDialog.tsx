import { useEffect, useRef, useState } from 'react'

import type { ProjectSummary } from '../projectStore'

interface ProjectDialogProps {
  mode: 'save-as' | 'open'
  currentName: string
  currentDescription: string
  projects: ProjectSummary[]
  busy: boolean
  error: string | null
  onCancel: () => void
  onSave: (name: string, description: string) => void
  onOpen: (projectId: string) => void
  onDelete: (projectId: string) => void
}

export function ProjectDialog({
  mode,
  currentName,
  currentDescription,
  projects,
  busy,
  error,
  onCancel,
  onSave,
  onOpen,
  onDelete,
}: ProjectDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [name, setName] = useState(() => mode === 'save-as'
    ? currentName ? `${currentName} – Kopie` : `Mission ${new Date().toLocaleDateString('de-DE')}`
    : '')
  const [description, setDescription] = useState(currentDescription)
  const [selectedProjectId, setSelectedProjectId] = useState(() => projects[0]?.id ?? '')

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return undefined
    dialog.showModal()
    return () => {
      if (dialog.open) dialog.close()
    }
  }, [])

  return (
    <dialog
      ref={dialogRef}
      className="route-section-wizard project-dialog"
      aria-labelledby="project-dialog-title"
      onCancel={(event) => {
        event.preventDefault()
        onCancel()
      }}
    >
      <header>
        <div>
          <small>Projektverwaltung</small>
          <h2 id="project-dialog-title">{mode === 'save-as' ? 'Projekt speichern unter …' : 'Projekt öffnen'}</h2>
        </div>
        <button type="button" className="wizard-close" aria-label="Dialog schließen" onClick={onCancel}>×</button>
      </header>

      <div className="wizard-content">
        {mode === 'save-as'
          ? (
            <fieldset className="project-save-fields">
              <legend>Neue Projektdatei anlegen</legend>
              <p>Der aktuelle Routenplan und ein vorhandenes Berechnungsergebnis werden als neue, versionierte Projektkopie gespeichert.</p>
              <label>
                <span>Projektname</span>
                <input value={name} maxLength={120} autoFocus onChange={(event) => setName(event.target.value)} />
              </label>
              <label>
                <span>Beschreibung</span>
                <textarea value={description} maxLength={2000} rows={5} onChange={(event) => setDescription(event.target.value)} />
              </label>
            </fieldset>
          )
          : (
            <fieldset>
              <legend>Gespeichertes Projekt auswählen</legend>
              <p>Beim Öffnen wird der gegenwärtige, noch nicht gespeicherte Zustand ersetzt.</p>
              <div className="project-list" role="radiogroup" aria-label="Gespeicherte Projekte">
                {projects.map((project) => (
                  <label className={selectedProjectId === project.id ? 'selected' : ''} key={project.id}>
                    <input type="radio" name="project" value={project.id} checked={selectedProjectId === project.id} onChange={() => setSelectedProjectId(project.id)} />
                    <span>
                      <strong>{project.name}</strong>
                      <small>{project.routeSectionCount} Abschnitte · Revision {project.revision} · {new Date(project.updatedAtUtc).toLocaleString('de-DE')}</small>
                      {project.description && <span>{project.description}</span>}
                    </span>
                  </label>
                ))}
                {projects.length === 0 && <p className="project-list-empty">Noch kein Projekt gespeichert.</p>}
              </div>
            </fieldset>
          )}
        {error && <p className="project-dialog-error" role="alert">{error}</p>}
      </div>

      <footer>
        <button type="button" className="wizard-cancel" disabled={busy} onClick={onCancel}>Abbrechen</button>
        <div>
          {mode === 'open' && selectedProjectId && (
            <button type="button" className="danger" disabled={busy} onClick={() => onDelete(selectedProjectId)}>
              Projekt löschen
            </button>
          )}
          {mode === 'save-as'
            ? <button type="button" className="primary" disabled={busy || !name.trim()} onClick={() => onSave(name.trim(), description.trim())}>{busy ? 'Speichert …' : 'Als neues Projekt speichern'}</button>
            : <button type="button" className="primary" disabled={busy || !selectedProjectId} onClick={() => onOpen(selectedProjectId)}>{busy ? 'Öffnet …' : 'Projekt öffnen'}</button>}
        </div>
      </footer>
    </dialog>
  )
}

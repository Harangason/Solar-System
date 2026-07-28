import type { WaypointRouteResult } from './components/PlannedWaypointRoute'
import type { RouteSectionDefinition } from './routeSections'
import type { MissionConfig, MissionResult, VisualConfig } from './types'

export interface ProjectState {
  schemaVersion: 1
  viewMode: '2d' | '3d'
  routeSections: RouteSectionDefinition[]
  activeRouteSectionId: string
  plannedMissionDate: string | null
  plannedRoute: WaypointRouteResult | null
  missionConfig: MissionConfig | null
  visualConfig: VisualConfig | null
  missionResult: MissionResult | null
}

export interface ProjectSummary {
  id: string
  name: string
  description: string
  schemaVersion: number
  revision: number
  createdAtUtc: string
  updatedAtUtc: string
  routeSectionCount: number
  hasCalculatedRoute: boolean
}

export interface StoredProject extends ProjectSummary {
  state: ProjectState
}

async function projectRequest<T extends object>(url: string, init?: RequestInit) {
  const response = await fetch(url, init)
  const payload = await response.json() as T | { error?: string }
  if (!response.ok || 'error' in payload) {
    throw new Error('error' in payload && payload.error ? payload.error : `HTTP ${response.status}`)
  }
  return payload as T
}

export async function listProjects() {
  const payload = await projectRequest<{ projects: ProjectSummary[] }>('/api/projects')
  return payload.projects
}

export function loadProject(projectId: string) {
  return projectRequest<StoredProject>(`/api/projects/${encodeURIComponent(projectId)}`)
}

export function createProject(name: string, description: string, state: ProjectState) {
  return projectRequest<StoredProject>('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description, state }),
  })
}

export function updateProject(projectId: string, name: string, description: string, state: ProjectState) {
  return projectRequest<StoredProject>(`/api/projects/${encodeURIComponent(projectId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description, state }),
  })
}

export async function deleteProject(projectId: string) {
  const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}`, { method: 'DELETE' })
  if (!response.ok) {
    const payload = await response.json() as { error?: string }
    throw new Error(payload.error ?? `HTTP ${response.status}`)
  }
}

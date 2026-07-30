import { activityRequestHeaders } from './activityLog'
import type { RouteSectionDefinition } from './routeSections'
import type { MissionConfig } from './types'

export type PlaybackEventType =
  | 'checkpoint'
  | 'paused'
  | 'resumed'
  | 'seek'
  | 'section-entered'
  | 'target-reached'
  | 'reset'
  | 'aborted'

export interface PlaybackStateSnapshot {
  positionKm: [number, number, number]
  velocityKmS?: [number, number, number]
  phase?: string
  massKg?: number
}

interface PlaybackStartRequest {
  routeAuditRunId?: string
  startDate: string
  playbackEndDay: number
  originId?: string
  targetId?: string
  routeSectionIds: string[]
  missionConfig: MissionConfig
  routeSections: RouteSectionDefinition[]
  state: PlaybackStateSnapshot
}

interface PlaybackEventRequest {
  playbackId: string
  sequence: number
  eventType: PlaybackEventType
  missionDay: number
  simulatedDateTimeUtc: string
  sectionId?: string
  sectionLabel?: string
  state: PlaybackStateSnapshot
  details?: Record<string, unknown>
}

async function postJson<T extends object>(url: string, values: unknown) {
  const response = await fetch(url, {
    method: 'POST',
    headers: activityRequestHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(values),
  })
  const payload = await response.json() as T | { error?: string }
  if (!response.ok || 'error' in payload) {
    throw new Error('error' in payload && payload.error ? payload.error : `HTTP ${response.status}`)
  }
  return payload as T
}

export function startPlaybackAudit(values: PlaybackStartRequest) {
  return postJson<{ playbackId: string; createdAtUtc: string; logFile: string }>(
    '/api/audit/playback/start',
    values,
  )
}

export function appendPlaybackAuditEvent(values: PlaybackEventRequest) {
  return postJson<{ playbackId: string; sequence: number; recordedAtUtc: string }>(
    '/api/audit/playback/event',
    values,
  )
}

export interface ActivityEntry {
  id: string
  timestampUtc: string
  source: string
  category: string
  action: string
  status: string
  projectId: string
  durationMs: number | null
  message: string
  values: Record<string, string | number | boolean | null>
  details: Record<string, string | number | boolean | null>
}

interface ActivityInput {
  source?: string
  category: string
  action: string
  status?: string
  projectId?: string
  durationMs?: number
  message?: string
  values?: Record<string, string | number | boolean | null>
  details?: Record<string, string | number | boolean | null>
}

let currentProjectId = ''

export function setActivityProjectId(projectId: string) {
  currentProjectId = projectId
}

export function activityRequestHeaders(headers: Record<string, string> = {}) {
  return currentProjectId
    ? { ...headers, 'X-Project-Id': currentProjectId }
    : headers
}

export function logActivity(input: ActivityInput) {
  void fetch('/api/activity', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source: 'frontend',
      status: 'success',
      projectId: currentProjectId,
      ...input,
    }),
    keepalive: true,
  }).catch(() => undefined)
}

export async function requestActivities(filters: {
  limit?: number
  category?: string
  status?: string
  projectId?: string
} = {}) {
  const query = new URLSearchParams()
  query.set('limit', String(filters.limit ?? 250))
  if (filters.category) query.set('category', filters.category)
  if (filters.status) query.set('status', filters.status)
  if (filters.projectId) query.set('projectId', filters.projectId)
  const response = await fetch(`/api/activity?${query}`)
  const payload = await response.json() as { activities?: ActivityEntry[]; error?: string }
  if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`)
  return payload.activities ?? []
}

export function activityCsvUrl(filters: {
  category?: string
  status?: string
  projectId?: string
} = {}) {
  const query = new URLSearchParams({ limit: '5000' })
  if (filters.category) query.set('category', filters.category)
  if (filters.status) query.set('status', filters.status)
  if (filters.projectId) query.set('projectId', filters.projectId)
  return `/api/activity/export.csv?${query}`
}

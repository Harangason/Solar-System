import { DEFAULT_ENTRY_CORRIDOR, type EntryCorridorDefinition } from './entryCorridorGeometry'

export interface RouteSectionDefinition {
  id: string
  originId: string
  targetId: string
  corridor: EntryCorridorDefinition
  deltaVMinusKmS: number
  deltaVPlusKmS: number
}

export const DEFAULT_ROUTE_SECTION: RouteSectionDefinition = {
  id: 'route-section-1',
  originId: 'sun',
  targetId: 'jupiter',
  corridor: {
    ...DEFAULT_ENTRY_CORRIDOR,
    enabled: true,
  },
  deltaVMinusKmS: 0.5,
  deltaVPlusKmS: 0.5,
}

export function createRouteSection(originId: string, targetId: string): RouteSectionDefinition {
  return {
    ...DEFAULT_ROUTE_SECTION,
    id: `route-section-${crypto.randomUUID()}`,
    originId,
    targetId,
    corridor: { ...DEFAULT_ROUTE_SECTION.corridor },
  }
}

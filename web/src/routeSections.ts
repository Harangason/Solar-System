import { DEFAULT_ENTRY_CORRIDOR, type EntryCorridorDefinition } from './entryCorridorGeometry'

export type RoutePassageMode = 'direct' | 'partial-orbit' | 'full-orbit'
export type RoutePassageDirection = 'prograde' | 'retrograde'
export type RouteBoundaryBehavior = 'ballistic' | 'tangential-prograde' | 'tangential-retrograde' | 'tangential-accelerate' | 'radial'

export interface RoutePassageDefinition {
  mode: RoutePassageMode
  orbitAngleDeg: number
  orbitDirection: RoutePassageDirection
  entryBehavior: RouteBoundaryBehavior
  exitBehavior: RouteBoundaryBehavior
}

export interface RouteSectionDefinition {
  id: string
  originId: string
  targetId: string
  corridor: EntryCorridorDefinition
  passage: RoutePassageDefinition
  deltaVMinusKmS: number
  deltaVPlusKmS: number
}

export const DEFAULT_ROUTE_PASSAGE: RoutePassageDefinition = {
  mode: 'direct',
  orbitAngleDeg: 0,
  orbitDirection: 'prograde',
  entryBehavior: 'ballistic',
  exitBehavior: 'ballistic',
}

export const DEFAULT_ROUTE_SECTION: RouteSectionDefinition = {
  id: 'route-section-1',
  originId: 'sun',
  targetId: 'jupiter',
  corridor: {
    ...DEFAULT_ENTRY_CORRIDOR,
    enabled: true,
  },
  passage: { ...DEFAULT_ROUTE_PASSAGE },
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
    passage: { ...DEFAULT_ROUTE_PASSAGE },
  }
}

export function routePassage(section: RouteSectionDefinition): RoutePassageDefinition {
  return {
    ...DEFAULT_ROUTE_PASSAGE,
    ...section.passage,
  }
}

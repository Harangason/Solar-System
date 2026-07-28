import type { EntryCorridorDefinition } from './entryCorridorGeometry'

export interface CorridorTargetPhysics {
  radiusKm?: number
  surfaceGravity?: number
}

export interface CorridorFeasibility {
  blocked: boolean
  reasons: string[]
  minimumPathClearanceRatio: number
  safetyRadiusRatio: number
  corridorRadiusRatio: number
  minimumPathClearanceKm: number | null
  safetyRadiusKm: number | null
  gravityReserveKm: number | null
}

const PLANET_RADIUS_UNITS = 1
const MINIMUM_CORRIDOR_RADIUS_UNITS = 220 / 160
const ORIGIN_X_UNITS = (105 - 635) / 160

type Vector3Tuple = [number, number, number]

function normalize(vector: Vector3Tuple): Vector3Tuple {
  const length = Math.hypot(...vector)
  return length > 0
    ? [vector[0] / length, vector[1] / length, vector[2] / length]
    : [1, 0, 0]
}

function cross(left: Vector3Tuple, right: Vector3Tuple): Vector3Tuple {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ]
}

function pointToSegmentDistance(
  point: Vector3Tuple,
  start: Vector3Tuple,
  end: Vector3Tuple,
) {
  const segment: Vector3Tuple = [
    end[0] - start[0],
    end[1] - start[1],
    end[2] - start[2],
  ]
  const lengthSquared = segment.reduce((sum, component) => sum + component * component, 0)
  if (lengthSquared === 0) {
    return Math.hypot(point[0] - start[0], point[1] - start[1], point[2] - start[2])
  }
  const projection = Math.max(0, Math.min(1, (
    (point[0] - start[0]) * segment[0]
    + (point[1] - start[1]) * segment[1]
    + (point[2] - start[2]) * segment[2]
  ) / lengthSquared))
  return Math.hypot(
    point[0] - (start[0] + projection * segment[0]),
    point[1] - (start[1] + projection * segment[1]),
    point[2] - (start[2] + projection * segment[2]),
  )
}

function corridorBoundaryDirections(definition: EntryCorridorDefinition) {
  const center = normalize(definition.centerDirection)
  const reference: Vector3Tuple = Math.abs(center[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0]
  const unrotatedRight = normalize(cross(reference, center))
  const unrotatedUp = normalize(cross(center, unrotatedRight))
  const rotation = definition.rotationDeg * Math.PI / 180
  const right = normalize([
    unrotatedRight[0] * Math.cos(rotation) + unrotatedUp[0] * Math.sin(rotation),
    unrotatedRight[1] * Math.cos(rotation) + unrotatedUp[1] * Math.sin(rotation),
    unrotatedRight[2] * Math.cos(rotation) + unrotatedUp[2] * Math.sin(rotation),
  ])
  const up = normalize([
    unrotatedUp[0] * Math.cos(rotation) - unrotatedRight[0] * Math.sin(rotation),
    unrotatedUp[1] * Math.cos(rotation) - unrotatedRight[1] * Math.sin(rotation),
    unrotatedUp[2] * Math.cos(rotation) - unrotatedRight[2] * Math.sin(rotation),
  ])
  const horizontal = Math.tan(definition.horizontalHalfAngleDeg * Math.PI / 180)
  const vertical = Math.tan(definition.verticalHalfAngleDeg * Math.PI / 180)
  const offsets = [
    [-horizontal, -vertical],
    [-horizontal, 0],
    [-horizontal, vertical],
    [0, -vertical],
    [0, 0],
    [0, vertical],
    [horizontal, -vertical],
    [horizontal, 0],
    [horizontal, vertical],
  ]
  return {
    center,
    boundaries: offsets.map(([horizontalOffset, verticalOffset]) => normalize([
      center[0] + right[0] * horizontalOffset + up[0] * verticalOffset,
      center[1] + right[1] * horizontalOffset + up[1] * verticalOffset,
      center[2] + right[2] * horizontalOffset + up[2] * verticalOffset,
    ])),
  }
}

function targetGravityReserveRatio(target: CorridorTargetPhysics) {
  const radiusKm = target.radiusKm
  const gravityMS2 = target.surfaceGravity
  if (!radiusKm || radiusKm <= 0 || !gravityMS2 || gravityMS2 <= 0) return 0.03
  const escapeVelocityKmS = Math.sqrt(2 * gravityMS2 * radiusKm / 1000)
  return Math.max(0.03, Math.min(0.18, escapeVelocityKmS / 400))
}

export function evaluateCorridorFeasibility(
  definition: EntryCorridorDefinition,
  target: CorridorTargetPhysics,
): CorridorFeasibility {
  const { center, boundaries } = corridorBoundaryDirections(definition)
  const halfThicknessUnits = (10 + definition.verticalHalfAngleDeg * 2.2) / 160
  const gravityReserveRatio = targetGravityReserveRatio(target)
  const safetyRadiusRatio = PLANET_RADIUS_UNITS + 0.08 + gravityReserveRatio
  const corridorRadiusRatio = Math.max(
    MINIMUM_CORRIDOR_RADIUS_UNITS,
    safetyRadiusRatio + halfThicknessUnits + 0.06,
  )
  const innerRadiusUnits = corridorRadiusRatio - halfThicknessUnits
  const minimumPathClearanceRatio = Math.min(...boundaries.map((direction) => {
    return pointToSegmentDistance(
      [0, 0, 0],
      [ORIGIN_X_UNITS, 0, 0],
      [
        -direction[0] * innerRadiusUnits,
        -direction[1] * innerRadiusUnits,
        -direction[2] * innerRadiusUnits,
      ],
    )
  }))
  const clearanceBlocked = minimumPathClearanceRatio <= safetyRadiusRatio
  const sourceAxisSeparationDeg = Math.acos(Math.max(-1, Math.min(1, center[0]))) * 180 / Math.PI
  const behindOrigin = sourceAxisSeparationDeg
    + Math.max(definition.horizontalHalfAngleDeg, definition.verticalHalfAngleDeg) >= 90
  const reasons = [
    ...(clearanceBlocked
      ? ['Minimale Anfluggrenze unterschreitet den Mindestabstand inklusive Gravitationsreserve.']
      : []),
    ...(behindOrigin
      ? ['Zielkorridor liegt auf der vom Ursprung abgewandten Rückseite.']
      : []),
  ]
  const radiusKm = target.radiusKm && target.radiusKm > 0 ? target.radiusKm : null

  return {
    blocked: definition.enabled && reasons.length > 0,
    reasons,
    minimumPathClearanceRatio,
    safetyRadiusRatio,
    corridorRadiusRatio,
    minimumPathClearanceKm: radiusKm ? minimumPathClearanceRatio * radiusKm : null,
    safetyRadiusKm: radiusKm ? safetyRadiusRatio * radiusKm : null,
    gravityReserveKm: radiusKm ? gravityReserveRatio * radiusKm : null,
  }
}

export function withCorridorFeasibility(
  definition: EntryCorridorDefinition,
  target: CorridorTargetPhysics,
): EntryCorridorDefinition {
  const feasibility = evaluateCorridorFeasibility(definition, target)
  return {
    ...definition,
    blocked: feasibility.blocked,
    blockReasons: feasibility.reasons,
  }
}

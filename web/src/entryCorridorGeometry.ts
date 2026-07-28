import * as THREE from 'three'

export type CorridorTuple = [number, number, number]
export type CorridorMainProjection = 'side' | 'top'

export interface EntryCorridorDefinition {
  enabled: boolean
  centerDirection: CorridorTuple
  horizontalHalfAngleDeg: number
  verticalHalfAngleDeg: number
  rotationDeg: number
  mainProjection?: CorridorMainProjection
  blocked?: boolean
  blockReasons?: string[]
}

export const DEFAULT_ENTRY_CORRIDOR: EntryCorridorDefinition = {
  enabled: false,
  centerDirection: [1, 0, 0],
  horizontalHalfAngleDeg: 8,
  verticalHalfAngleDeg: 5,
  rotationDeg: 0,
  mainProjection: 'side',
}

function normalized(values: CorridorTuple) {
  const direction = new THREE.Vector3(...values)
  return direction.lengthSq() > 0 ? direction.normalize() : new THREE.Vector3(1, 0, 0)
}

export function corridorBasis(definition: EntryCorridorDefinition) {
  const center = normalized(definition.centerDirection)
  const reference = Math.abs(center.z) < 0.9
    ? new THREE.Vector3(0, 0, 1)
    : new THREE.Vector3(0, 1, 0)
  const right = reference.cross(center).normalize()
  const up = center.clone().cross(right).normalize()
  const rotation = THREE.MathUtils.degToRad(definition.rotationDeg)
  return {
    center,
    right: right.clone().multiplyScalar(Math.cos(rotation)).addScaledVector(up, Math.sin(rotation)).normalize(),
    up: up.clone().multiplyScalar(Math.cos(rotation)).addScaledVector(right, -Math.sin(rotation)).normalize(),
  }
}

export function corridorDirection(
  definition: EntryCorridorDefinition,
  horizontalOffsetDeg: number,
  verticalOffsetDeg: number,
) {
  const { center, right, up } = corridorBasis(definition)
  return center
    .addScaledVector(right, Math.tan(THREE.MathUtils.degToRad(horizontalOffsetDeg)))
    .addScaledVector(up, Math.tan(THREE.MathUtils.degToRad(verticalOffsetDeg)))
    .normalize()
}

function sampledArc(
  definition: EntryCorridorDefinition,
  fixedOffsetDeg: number,
  varyingLimitDeg: number,
  fixedIsHorizontal: boolean,
  radius: number,
  segments: number,
) {
  return Array.from({ length: segments + 1 }, (_, index) => {
    const varying = -varyingLimitDeg + index / segments * varyingLimitDeg * 2
    const direction = fixedIsHorizontal
      ? corridorDirection(definition, fixedOffsetDeg, varying)
      : corridorDirection(definition, varying, fixedOffsetDeg)
    return direction.multiplyScalar(radius)
  })
}

export function corridorArcs(
  definition: EntryCorridorDefinition,
  radius = 1,
  segments = 48,
) {
  const horizontal = definition.horizontalHalfAngleDeg
  const vertical = definition.verticalHalfAngleDeg
  return [
    sampledArc(definition, -horizontal, vertical, true, radius, segments),
    sampledArc(definition, horizontal, vertical, true, radius, segments),
    sampledArc(definition, -vertical, horizontal, false, radius, segments),
    sampledArc(definition, vertical, horizontal, false, radius, segments),
  ]
}

export function physicsToScene(direction: THREE.Vector3) {
  return new THREE.Vector3(direction.x, direction.z, direction.y)
}

export function sceneToPhysics(direction: THREE.Vector3): CorridorTuple {
  const normalizedDirection = direction.clone().normalize()
  return [normalizedDirection.x, normalizedDirection.z, normalizedDirection.y]
}

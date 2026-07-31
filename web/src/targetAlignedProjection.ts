export type Vector3Tuple = [number, number, number]

export interface TargetAlignedBasis {
  forward: Vector3Tuple
  right: Vector3Tuple
  up: Vector3Tuple
}

export interface TargetPlanePoint {
  right: number
  up: number
  depth: number
}

function dot(a: Vector3Tuple, b: Vector3Tuple) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

function cross(a: Vector3Tuple, b: Vector3Tuple): Vector3Tuple {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ]
}

export function normalizeTuple(vector: Vector3Tuple, fallback: Vector3Tuple = [1, 0, 0]): Vector3Tuple {
  const length = Math.hypot(...vector)
  return length > 1e-10
    ? [vector[0] / length, vector[1] / length, vector[2] / length]
    : fallback
}

export function targetAlignedBasis(sunToTargetDirection: Vector3Tuple): TargetAlignedBasis {
  const forward = normalizeTuple(sunToTargetDirection)
  const referenceUp: Vector3Tuple = Math.abs(dot(forward, [0, 0, 1])) < 0.94
    ? [0, 0, 1]
    : [0, 1, 0]
  const right = normalizeTuple(cross(referenceUp, forward), [0, 1, 0])
  const up = normalizeTuple(cross(forward, right), [0, 0, 1])
  return { forward, right, up }
}

export function projectToTargetPlane(direction: Vector3Tuple, basis: TargetAlignedBasis): TargetPlanePoint {
  const normalized = normalizeTuple(direction)
  return {
    right: dot(normalized, basis.right),
    up: dot(normalized, basis.up),
    depth: dot(normalized, basis.forward),
  }
}

export function directionFromTargetPlane(
  right: number,
  up: number,
  depthSign: number,
  basis: TargetAlignedBasis,
): Vector3Tuple {
  const transverseLength = Math.hypot(right, up)
  const scale = transverseLength > 0.999 ? 0.999 / transverseLength : 1
  const clampedRight = right * scale
  const clampedUp = up * scale
  const depth = (depthSign < 0 ? -1 : 1)
    * Math.sqrt(Math.max(0, 1 - clampedRight ** 2 - clampedUp ** 2))
  return normalizeTuple([
    basis.right[0] * clampedRight + basis.up[0] * clampedUp + basis.forward[0] * depth,
    basis.right[1] * clampedRight + basis.up[1] * clampedUp + basis.forward[1] * depth,
    basis.right[2] * clampedRight + basis.up[2] * clampedUp + basis.forward[2] * depth,
  ])
}

import assert from 'node:assert/strict'

import {
  directionFromTargetPlane,
  normalizeTuple,
  projectToTargetPlane,
  targetAlignedBasis,
} from '../src/targetAlignedProjection.ts'

const epsilon = 1e-9
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const close = (actual, expected, tolerance = epsilon) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`)
}

for (const forward of [[0.83, -0.41, 0.37], [0.01, 0.02, 0.9997]]) {
  const basis = targetAlignedBasis(forward)
  close(Math.hypot(...basis.forward), 1)
  close(Math.hypot(...basis.right), 1)
  close(Math.hypot(...basis.up), 1)
  close(dot(basis.forward, basis.right), 0)
  close(dot(basis.forward, basis.up), 0)
  close(dot(basis.right, basis.up), 0)

  for (const direction of [[-0.61, 0.48, -0.63], [0.3, -0.8, 0.52]]) {
    const expected = normalizeTuple(direction)
    const projected = projectToTargetPlane(direction, basis)
    close(projected.right ** 2 + projected.up ** 2 + projected.depth ** 2, 1)
    const reconstructed = directionFromTargetPlane(
      projected.right,
      projected.up,
      projected.depth,
      basis,
    )
    reconstructed.forEach((component, index) => close(component, expected[index]))
  }
}

console.log('target-aligned projection consistency: ok')

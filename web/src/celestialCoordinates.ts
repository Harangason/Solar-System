import * as THREE from 'three'

import type { InterstellarTarget } from './interstellarTargets'

const EARTH_OBLIQUITY_J2000_DEG = 23.43928

export function equatorialDirection(rightAscensionDeg: number, declinationDeg: number) {
  const rightAscension = THREE.MathUtils.degToRad(rightAscensionDeg)
  const declination = THREE.MathUtils.degToRad(declinationDeg)
  const obliquity = THREE.MathUtils.degToRad(EARTH_OBLIQUITY_J2000_DEG)
  const equatorialX = Math.cos(declination) * Math.cos(rightAscension)
  const equatorialY = Math.cos(declination) * Math.sin(rightAscension)
  const equatorialZ = Math.sin(declination)

  return new THREE.Vector3(
    equatorialX,
    -equatorialY * Math.sin(obliquity) + equatorialZ * Math.cos(obliquity),
    equatorialY * Math.cos(obliquity) + equatorialZ * Math.sin(obliquity),
  ).normalize()
}

export function interstellarTargetDirection(target: InterstellarTarget) {
  return equatorialDirection(target.rightAscensionDeg, target.declinationDeg)
}

export function interstellarTargetPosition(target: InterstellarTarget) {
  const displayDistance = 42 + Math.log10(target.distanceLy) * 32
  return interstellarTargetDirection(target).multiplyScalar(displayDistance)
}

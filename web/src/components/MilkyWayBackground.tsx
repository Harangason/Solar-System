import { useTexture } from '@react-three/drei'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'

import { equatorialDirection, interstellarTargetDirection } from '../celestialCoordinates'
import { INTERSTELLAR_TARGETS } from '../interstellarTargets'

const GALACTIC_NORTH_POLE_J2000 = { rightAscensionDeg: 192.85948, declinationDeg: 27.12825 }

export function MilkyWayBackground() {
  const texture = useTexture('/assets/milky-way-sgra-background.png')
  const transform = useMemo(() => {
    const sgrA = INTERSTELLAR_TARGETS.find((target) => target.id === 'milky-way-center')
    if (!sgrA) return null

    const direction = interstellarTargetDirection(sgrA)
    const galacticNorth = equatorialDirection(
      GALACTIC_NORTH_POLE_J2000.rightAscensionDeg,
      GALACTIC_NORTH_POLE_J2000.declinationDeg,
    )
    const up = galacticNorth
      .sub(direction.clone().multiplyScalar(galacticNorth.dot(direction)))
      .normalize()
    const forward = direction.clone().negate()
    const right = up.clone().cross(forward).normalize()
    const rotation = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(right, up, forward),
    )

    return {
      position: direction.multiplyScalar(245),
      rotation,
    }
  }, [])

  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 8
    texture.needsUpdate = true
  }, [texture])

  if (!transform) return null

  return (
    <mesh
      position={transform.position}
      quaternion={transform.rotation}
      renderOrder={-20}
      raycast={() => null}
    >
      <planeGeometry args={[300, 150]} />
      <meshBasicMaterial
        map={texture}
        color="#d7ddff"
        transparent
        opacity={0.72}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        side={THREE.DoubleSide}
        toneMapped={false}
      />
    </mesh>
  )
}

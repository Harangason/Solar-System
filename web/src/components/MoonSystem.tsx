import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'

import { moonDisplayDistance, moonOrbitVertices, moonPositionAt } from '../moonMath'
import { planetPositionAt } from '../orbitalMath'
import type { MoonData, PlanetData } from '../types'

const MAJOR_MOON_RADII: Record<string, number> = {
  moon: 1737, io: 1822, europa: 1561, ganymede: 2634, callisto: 2410,
  amalthea: 84, mimas: 198, enceladus: 252, tethys: 531, dione: 561,
  rhea: 764, titan: 2575, iapetus: 735, miranda: 236, ariel: 579,
  umbriel: 585, titania: 789, oberon: 761, triton: 1353, nereid: 170,
  proteus: 210, phobos: 11, deimos: 6,
}

interface MoonSystemProps {
  moons: MoonData[]
  planet: PlanetData
  planetSize: number
  timestampMs: number
  distanceScale: number
  inclinationScale: number
  onSelectMoon: (moon: MoonData) => void
}

export function MoonSystem({ moons, planet, planetSize, timestampMs, distanceScale, inclinationScale, onSelectMoon }: MoonSystemProps) {
  const groupRef = useRef<THREE.Group>(null)
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const knownDistances = useMemo(
    () => moons.flatMap((moon) => moon.semiMajorAxisKm ? [moon.semiMajorAxisKm] : []),
    [moons],
  )
  const displayDistances = useMemo(
    () => moons.map((moon, index) => moonDisplayDistance(moon, index, moons.length, planetSize, knownDistances)),
    [knownDistances, moons, planetSize],
  )
  const orbitVertices = useMemo(() => moonOrbitVertices(moons, planetSize), [moons, planetSize])

  useFrame(() => {
    groupRef.current?.position.copy(planetPositionAt(planet, timestampMs, distanceScale, inclinationScale))
    if (!meshRef.current) return
    moons.forEach((moon, index) => {
      dummy.position.copy(moonPositionAt(moon, timestampMs, displayDistances[index]))
      const radiusKm = MAJOR_MOON_RADII[moon.name.toLowerCase()] ?? 3
      const physicalRatio = radiusKm / planet.radiusKm
      const readableRatio = Math.max(physicalRatio, Math.sqrt(physicalRatio) * 0.16)
      // Monde duerfen fuer die Lesbarkeit leicht ueberhoeht sein, aber niemals
      // mit einer vom Mutterplaneten unabhaengigen Riesengroesse erscheinen.
      const size = Math.max(0.006, Math.min(planetSize * 0.45, planetSize * readableRatio))
      dummy.scale.setScalar(size)
      dummy.updateMatrix()
      meshRef.current?.setMatrixAt(index, dummy.matrix)
    })
    meshRef.current.instanceMatrix.needsUpdate = true
  })

  return (
    <group ref={groupRef}>
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[orbitVertices, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color="#8bb8d8" transparent opacity={0.2} />
      </lineSegments>
      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, moons.length]}
        onClick={(event) => {
          event.stopPropagation()
          if (event.instanceId !== undefined) onSelectMoon(moons[event.instanceId])
        }}
      >
        <sphereGeometry args={[1, 10, 10]} />
        <meshStandardMaterial color="#dce8f0" roughness={0.9} />
      </instancedMesh>
    </group>
  )
}

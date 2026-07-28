import type { SunData } from '../types'

const AU_KM = 149_597_870.7

// Positions and trajectories use orbitScale * sqrt(AE). The Sun must use the
// same transform; a decorative fixed radius would make safe perihelia look as
// if they crossed the body.
export function sunSceneRadius(radiusKm: number, orbitScale: number) {
  return orbitScale * Math.sqrt(radiusKm / AU_KM)
}

interface SunProps {
  sun: SunData
  orbitScale: number
  sizeScale?: number
}

export function Sun({ sun, orbitScale, sizeScale = 1 }: SunProps) {
  const radius = sunSceneRadius(sun.radiusKm, orbitScale)
  return (
    <mesh scale={sizeScale}>
      <sphereGeometry args={[radius, 48, 48]} />
      <meshBasicMaterial color={sun.color} />
      <pointLight
        color="#ffd37a"
        intensity={180}
        distance={120}
        decay={1.35}
      />
    </mesh>
  )
}

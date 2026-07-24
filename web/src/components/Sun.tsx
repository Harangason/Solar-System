import type { SunData } from '../types'

// Die Bahnradien werden mit sqrt(AE) komprimiert. Eine groessere, rein
// dekorative Sonne wuerde deshalb selbst eine physikalisch sichere
// Perihelbahn (hier 0,05 AE) optisch verschlucken.
export const SUN_SCENE_RADIUS = 0.85

interface SunProps {
  sun: SunData
  sizeScale?: number
}

export function Sun({ sun, sizeScale = 1 }: SunProps) {
  return (
    <mesh scale={sizeScale}>
      <sphereGeometry args={[SUN_SCENE_RADIUS, 48, 48]} />
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

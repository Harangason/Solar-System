import { Line } from '@react-three/drei'
import { useMemo } from 'react'

import { createOrbitPoints } from '../orbitalMath'
import type { PlanetData } from '../types'

interface OrbitProps {
  planet: PlanetData
  distanceScale: number
  inclinationScale: number
}

export function Orbit({ planet, distanceScale, inclinationScale }: OrbitProps) {
  const points = useMemo(
    () => createOrbitPoints(planet, distanceScale, inclinationScale),
    [distanceScale, inclinationScale, planet],
  )
  return <Line points={points} color="#71809a" transparent opacity={0.32} lineWidth={0.7} />
}

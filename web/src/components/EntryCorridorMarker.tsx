import { Html, Line } from '@react-three/drei'
import { useMemo } from 'react'
import * as THREE from 'three'

import {
  corridorArcs,
  corridorDirection,
  physicsToScene,
  type EntryCorridorDefinition,
} from '../entryCorridorGeometry'

interface EntryCorridorMarkerProps {
  position: THREE.Vector3
  radius: number
  definition: EntryCorridorDefinition
}

const HORIZONTAL_STEPS = 18
const VERTICAL_STEPS = 12

export function EntryCorridorMarker({
  position,
  radius,
  definition,
}: EntryCorridorMarkerProps) {
  const geometry = useMemo(() => {
    const positions: number[] = []
    const indices: number[] = []
    for (let verticalIndex = 0; verticalIndex <= VERTICAL_STEPS; verticalIndex += 1) {
      const vertical = -definition.verticalHalfAngleDeg
        + verticalIndex / VERTICAL_STEPS * definition.verticalHalfAngleDeg * 2
      for (let horizontalIndex = 0; horizontalIndex <= HORIZONTAL_STEPS; horizontalIndex += 1) {
        const horizontal = -definition.horizontalHalfAngleDeg
          + horizontalIndex / HORIZONTAL_STEPS * definition.horizontalHalfAngleDeg * 2
        const point = physicsToScene(corridorDirection(definition, horizontal, vertical))
          .multiplyScalar(radius)
        positions.push(point.x, point.y, point.z)
      }
    }
    const rowLength = HORIZONTAL_STEPS + 1
    for (let verticalIndex = 0; verticalIndex < VERTICAL_STEPS; verticalIndex += 1) {
      for (let horizontalIndex = 0; horizontalIndex < HORIZONTAL_STEPS; horizontalIndex += 1) {
        const current = verticalIndex * rowLength + horizontalIndex
        const nextRow = current + rowLength
        indices.push(current, nextRow, current + 1, current + 1, nextRow, nextRow + 1)
      }
    }
    const patch = new THREE.BufferGeometry()
    patch.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    patch.setIndex(indices)
    patch.computeVertexNormals()
    return patch
  }, [definition, radius])
  const arcs = useMemo(
    () => corridorArcs(definition, radius * 1.006).map((arc) => arc.map(physicsToScene)),
    [definition, radius],
  )
  const center = useMemo(
    () => physicsToScene(corridorDirection(definition, 0, 0)).multiplyScalar(radius * 1.035),
    [definition, radius],
  )

  return (
    <group position={position}>
      <mesh geometry={geometry}>
        <meshBasicMaterial
          color="#ffda67"
          transparent
          opacity={0.24}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      {arcs.map((arc, index) => (
        <Line
          key={`corridor-boundary-${index}`}
          points={arc}
          color="#ffda67"
          lineWidth={2.3}
          transparent
          opacity={0.98}
          depthWrite={false}
        />
      ))}
      <mesh position={center}>
        <sphereGeometry args={[Math.max(radius * 0.035, 0.025), 16, 16]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <Html center position={center.clone().multiplyScalar(1.08)}>
        <span className="encounter-anchor-tooltip">2D-Zielkorridor</span>
      </Html>
    </group>
  )
}

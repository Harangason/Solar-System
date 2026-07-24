import { Line } from '@react-three/drei'
import { useMemo } from 'react'
import type { Vector3 } from 'three'

import { interstellarTargetPosition } from '../celestialCoordinates'
import type { InterstellarTarget } from '../interstellarTargets'
import { DraggableInfoLabel } from './DraggableInfoLabel'

interface InterstellarTargetsProps {
  targets: InterstellarTarget[]
  selectedId: string
  onSelect: (target: InterstellarTarget) => void
  guideStart?: Vector3
  selectedPositionOverride?: Vector3
  hideGuide?: boolean
  onInfoDragChange?: (label: string, active: boolean) => void
}

export function InterstellarTargets({ targets, selectedId, onSelect, guideStart, selectedPositionOverride, hideGuide = false, onInfoDragChange }: InterstellarTargetsProps) {
  const positions = useMemo(
    () => new Map(targets.map((target) => [
      target.id,
      target.id === selectedId && selectedPositionOverride
        ? selectedPositionOverride.clone()
        : interstellarTargetPosition(target),
    ])),
    [selectedId, selectedPositionOverride, targets],
  )
  const selected = targets.find((target) => target.id === selectedId)
  const selectedPosition = selected ? positions.get(selected.id) : undefined

  return (
    <group>
      {selectedPosition && !hideGuide && (
        <Line points={[guideStart ?? [0, 0, 0], selectedPosition]} color="#79e4ff" lineWidth={1.15} dashed dashSize={1.1} gapSize={0.65} transparent opacity={0.78} />
      )}
      {targets.map((target) => {
        const position = positions.get(target.id)
        if (!position) return null
        const selectedTarget = target.id === selectedId
        const markerSize = target.kind === 'galactic-center' ? 2.4 : selectedTarget ? 1.25 : 0.72
        return (
          <group key={target.id} position={position}>
            <mesh
              scale={selectedTarget ? 1.25 : 1}
              onClick={(event) => {
                event.stopPropagation()
                onSelect(target)
              }}
            >
              <sphereGeometry args={[markerSize, 20, 20]} />
              <meshBasicMaterial color={target.color} toneMapped={false} />
            </mesh>
            {selectedTarget && (
              <DraggableInfoLabel initialOffset={[-85, -78]} label={target.name} onDragChange={onInfoDragChange}>
                <span className="interstellar-label"><strong>{target.name}</strong><small>{target.distanceLy.toLocaleString('de-DE')} Lj · {target.spectralType}</small></span>
              </DraggableInfoLabel>
            )}
          </group>
        )
      })}
    </group>
  )
}

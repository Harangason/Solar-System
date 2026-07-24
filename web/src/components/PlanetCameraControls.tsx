import { OrbitControls } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'

export type CameraFocusRequest =
  | { kind: 'overview'; view: 'perspective' | 'top' | 'front' | 'side'; requestId: number }
  | { kind: 'planet'; planetId: string; requestId: number }

interface PlanetCameraControlsProps {
  request: CameraFocusRequest
  focusPosition: THREE.Vector3 | null
  focusRadius: number
  navigationMode: 'rotate' | 'pan'
  enabled: boolean
}

const OVERVIEW_POSITIONS = {
  perspective: new THREE.Vector3(46, 38, 58),
  top: new THREE.Vector3(0, 78, 0),
  front: new THREE.Vector3(0, 0, 78),
  side: new THREE.Vector3(78, 0, 0),
} as const

export function PlanetCameraControls({
  request,
  focusPosition,
  focusRadius,
  navigationMode,
  enabled,
}: PlanetCameraControlsProps) {
  const controlsRef = useRef<OrbitControlsImpl>(null)
  const lastRequestId = useRef(-1)
  const lastPlanetPosition = useRef<THREE.Vector3 | null>(null)
  const { camera } = useThree()
  const overviewMaxDistance = 5000
  const overviewFar = 10_000
  const planetMinDistance = Math.max(focusRadius * 1.12, 0.0015)
  const planetMaxDistance = Math.max(focusRadius * 5_000, 1_200)
  const planetFar = Math.max(focusRadius * 30_000, 6_000)

  useEffect(() => {
    const controls = controlsRef.current
    if (!controls) return

    const isNewRequest = request.requestId !== lastRequestId.current
    if (request.kind === 'overview') {
      if (isNewRequest) {
        controls.target.set(0, 0, 0)
        camera.up.set(0, request.view === 'top' ? 0 : 1, request.view === 'top' ? -1 : 0)
        camera.position.copy(OVERVIEW_POSITIONS[request.view])
        camera.near = 0.0001
        camera.far = overviewFar
        camera.updateProjectionMatrix()
        controls.update()
        lastPlanetPosition.current = null
      }
      lastRequestId.current = request.requestId
      return
    }

    if (!focusPosition) return
    if (isNewRequest) {
      const viewDirection = camera.position.clone().sub(controls.target)
      if (viewDirection.lengthSq() < 1e-8) viewDirection.set(1, 0.55, 1)
      viewDirection.normalize()
      const viewingDistance = Math.max(focusRadius * 7, 0.025)

      controls.target.copy(focusPosition)
      camera.position.copy(focusPosition).addScaledVector(viewDirection, viewingDistance)
      camera.near = Math.max(focusRadius / 80, 0.00001)
      camera.far = planetFar
      camera.updateProjectionMatrix()
      controls.update()
    } else if (lastPlanetPosition.current) {
      // Keep a focused planet centered while mission time advances, without
      // destroying a manual orbit/pan offset chosen by the user.
      const motion = focusPosition.clone().sub(lastPlanetPosition.current)
      controls.target.add(motion)
      camera.position.add(motion)
      controls.update()
    }

    lastRequestId.current = request.requestId
    lastPlanetPosition.current = focusPosition.clone()
  }, [camera, focusPosition, focusPosition?.x, focusPosition?.y, focusPosition?.z, focusRadius, request])

  const minimumDistance = request.kind === 'planet' ? planetMinDistance : 0.0015

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      minDistance={minimumDistance}
      maxDistance={request.kind === 'planet' ? planetMaxDistance : overviewMaxDistance}
      enabled={enabled}
      enableDamping
      enablePan
      enableZoom
      zoomToCursor
      screenSpacePanning
      panSpeed={1.2}
      rotateSpeed={0.7}
      zoomSpeed={1.45}
      mouseButtons={{
        LEFT: navigationMode === 'pan' ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: navigationMode === 'pan' ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN,
      }}
      touches={{
        ONE: navigationMode === 'pan' ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE,
        TWO: THREE.TOUCH.DOLLY_PAN,
      }}
    />
  )
}

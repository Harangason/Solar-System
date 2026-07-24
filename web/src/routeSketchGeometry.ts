import * as THREE from 'three'

export type SceneTuple = [number, number, number]

export interface OrientedCircleGeometry {
  center: SceneTuple
  radius: number
  rotation: SceneTuple
}

export function sceneVector(point: SceneTuple) {
  return new THREE.Vector3(...point)
}

export function sceneTuple(vector: THREE.Vector3): SceneTuple {
  return [vector.x, vector.y, vector.z]
}

export function circleEuler(rotation: SceneTuple) {
  return new THREE.Euler(...rotation)
}

export function circleLocalPoints(radius: number, segments = 96) {
  return Array.from({ length: segments + 1 }, (_, index) => {
    const angle = index / segments * Math.PI * 2
    return new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius)
  })
}

export function circleWorldPoints(circle: OrientedCircleGeometry, segments = 96) {
  const center = sceneVector(circle.center)
  const rotation = circleEuler(circle.rotation)
  return circleLocalPoints(circle.radius, segments).map((point) => point.applyEuler(rotation).add(center))
}

export function circleWorldNormal(rotation: SceneTuple) {
  return new THREE.Vector3(0, 1, 0).applyEuler(circleEuler(rotation)).normalize()
}

export function circleWorldEdge(circle: OrientedCircleGeometry) {
  return sceneVector(circle.center).add(
    new THREE.Vector3(circle.radius, 0, 0).applyEuler(circleEuler(circle.rotation)),
  )
}

export function rayAxisScalar(ray: THREE.Ray, origin: THREE.Vector3, axis: THREE.Vector3) {
  const start = origin.clone().addScaledVector(axis, -2_000)
  const end = origin.clone().addScaledVector(axis, 2_000)
  const pointOnAxis = new THREE.Vector3()
  ray.distanceSqToSegment(start, end, new THREE.Vector3(), pointOnAxis)
  return pointOnAxis.sub(origin).dot(axis)
}

export function axisDragPlaneNormal(axis: THREE.Vector3, cameraDirection: THREE.Vector3) {
  const normalizedAxis = axis.clone().normalize()
  const normal = cameraDirection.clone().normalize().addScaledVector(
    normalizedAxis,
    -cameraDirection.clone().normalize().dot(normalizedAxis),
  )
  if (normal.lengthSq() < 1e-8) {
    const fallback = Math.abs(normalizedAxis.y) < 0.8
      ? new THREE.Vector3(0, 1, 0)
      : new THREE.Vector3(1, 0, 0)
    normal.copy(fallback).addScaledVector(normalizedAxis, -fallback.dot(normalizedAxis))
  }
  return normal.normalize()
}

export function rayAxisPlaneScalar(
  ray: THREE.Ray,
  origin: THREE.Vector3,
  axis: THREE.Vector3,
  planeNormal: THREE.Vector3,
) {
  const point = ray.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(planeNormal, origin), new THREE.Vector3())
  return point ? point.sub(origin).dot(axis) : null
}

export function rotatedEulerFromDrag(
  startQuaternion: THREE.Quaternion,
  axisWorld: THREE.Vector3,
  startVector: THREE.Vector3,
  currentVector: THREE.Vector3,
) {
  const cross = startVector.clone().cross(currentVector)
  const angle = Math.atan2(axisWorld.dot(cross), THREE.MathUtils.clamp(startVector.dot(currentVector), -1, 1))
  const nextQuaternion = new THREE.Quaternion().setFromAxisAngle(axisWorld, angle).multiply(startQuaternion)
  return new THREE.Euler().setFromQuaternion(nextQuaternion, 'XYZ')
}

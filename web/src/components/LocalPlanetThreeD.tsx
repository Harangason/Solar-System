import { Line, OrbitControls, Stars, useTexture } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'

import {
  physicsToScene,
  sceneToPhysics,
  type CorridorTuple,
  type EntryCorridorDefinition,
} from '../entryCorridorGeometry'
import { planetTextureUrl } from '../planetTextures'
import type { RouteBoundaryBehavior, RoutePassageDefinition, RoutePassageDirection } from '../routeSections'
import type { MoonData, PlanetData } from '../types'

interface LocalPlanetThreeDProps {
  planet: PlanetData
  moons: MoonData[]
  epochLabel: string
  corridorDefinition: EntryCorridorDefinition
  actualEntryDirection?: CorridorTuple | null
  exitDirection?: CorridorTuple | null
  passage: RoutePassageDefinition
}

const MAX_VISIBLE_MOONS = 18

function PlanetBody({ planet }: { planet: PlanetData }) {
  const body = useRef<THREE.Mesh>(null)
  const texture = useTexture(planetTextureUrl(planet.id))

  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 8
    texture.needsUpdate = true
  }, [texture])

  useFrame((_, delta) => {
    if (body.current) body.current.rotation.y += delta * 0.08
  })

  return (
    <group rotation={[THREE.MathUtils.degToRad(planet.inclinationDeg ?? 0), 0, 0]}>
      <mesh ref={body} castShadow receiveShadow>
        <sphereGeometry args={[1.7, 64, 64]} />
        <meshStandardMaterial map={texture} color="#ffffff" roughness={0.82} metalness={0.01} />
      </mesh>
      <mesh scale={1.012}>
        <sphereGeometry args={[1.7, 48, 48]} />
        <meshBasicMaterial
          color={planet.id === 'earth' ? '#5fb7ff' : planet.color}
          transparent
          opacity={planet.id === 'earth' ? 0.18 : 0.1}
          side={THREE.BackSide}
        />
      </mesh>
      {planet.hasRings && (
        <mesh rotation={[Math.PI / 2, 0, 0]} receiveShadow>
          <ringGeometry args={[2.15, 3.15, 96]} />
          <meshStandardMaterial color="#d8c59f" transparent opacity={0.62} roughness={0.9} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  )
}

function stableSeed(value: string) {
  let seed = 2166136261
  for (const character of value) {
    seed ^= character.charCodeAt(0)
    seed = Math.imul(seed, 16777619)
  }
  return seed >>> 0
}

function createMoonSurfaceTexture(moonId: string) {
  const width = 64
  const height = 32
  const pixels = new Uint8Array(width * height * 4)
  let state = stableSeed(moonId)
  const random = () => {
    state = Math.imul(state ^ (state >>> 15), 1 | state)
    state ^= state + Math.imul(state ^ (state >>> 7), 61 | state)
    return ((state ^ (state >>> 14)) >>> 0) / 4_294_967_295
  }
  const craters = Array.from({ length: 16 }, () => ({
    x: random() * width,
    y: random() * height,
    radius: 1.2 + random() * 4.5,
  }))
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const noise = (random() - 0.5) * 36
      const craterShade = craters.reduce((shade, crater) => {
        const wrappedX = Math.min(Math.abs(x - crater.x), width - Math.abs(x - crater.x))
        const distance = Math.hypot(wrappedX, y - crater.y)
        if (distance > crater.radius) return shade
        const rim = Math.abs(distance - crater.radius * 0.82) < 0.5 ? 22 : -28 * (1 - distance / crater.radius)
        return shade + rim
      }, 0)
      const value = Math.max(55, Math.min(215, 142 + noise + craterShade))
      const offset = (y * width + x) * 4
      pixels[offset] = value
      pixels[offset + 1] = value * 0.97
      pixels[offset + 2] = value * 0.91
      pixels[offset + 3] = 255
    }
  }
  const texture = new THREE.DataTexture(pixels, width, height, THREE.RGBAFormat)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.needsUpdate = true
  return texture
}

interface LocalMoonProps {
  moon: MoonData
  index: number
  orbitRadius: number
}

function LocalMoon({ moon, index, orbitRadius }: LocalMoonProps) {
  const moonRef = useRef<THREE.Mesh>(null)
  const surfaceTexture = useMemo(() => createMoonSurfaceTexture(moon.id), [moon.id])
  const initialAngle = index * 2.399963 + THREE.MathUtils.degToRad(moon.meanAnomalyEpochDeg ?? 0)
  const periodSeconds = Math.max(7, Math.min(38, 7 + Math.sqrt(Math.abs(moon.orbitalPeriodDays ?? 30)) * 2.2))
  const direction = Math.abs(moon.inclinationDeg ?? 0) > 90 ? -1 : 1
  const inclination = THREE.MathUtils.degToRad(Math.min(28, Math.abs(moon.inclinationDeg ?? 0)))

  useEffect(() => () => surfaceTexture.dispose(), [surfaceTexture])
  useFrame(({ clock }, delta) => {
    if (!moonRef.current) return
    const angle = initialAngle + direction * clock.elapsedTime * Math.PI * 2 / periodSeconds
    moonRef.current.position.set(Math.cos(angle) * orbitRadius, 0, Math.sin(angle) * orbitRadius)
    moonRef.current.rotation.y += delta * 0.18
  })

  return (
    <group rotation={[inclination, THREE.MathUtils.degToRad(moon.ascendingNodeDeg ?? 0), 0]}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[orbitRadius - 0.006, orbitRadius + 0.006, 96]} />
        <meshBasicMaterial color="#77b9d8" transparent opacity={0.25} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={moonRef}>
        <sphereGeometry args={[Math.max(0.055, 0.115 - index * 0.0025), 24, 24]} />
        <meshStandardMaterial map={surfaceTexture} color="#ffffff" roughness={0.92} />
      </mesh>
    </group>
  )
}

function LocalMoons({ moons }: { moons: MoonData[] }) {
  const visibleMoons = useMemo(
    () => moons
      .filter((moon) => Number.isFinite(moon.semiMajorAxisKm))
      .sort((a, b) => (a.semiMajorAxisKm ?? 0) - (b.semiMajorAxisKm ?? 0))
      .slice(0, MAX_VISIBLE_MOONS),
    [moons],
  )
  const maximumAxis = Math.max(...visibleMoons.map((moon) => moon.semiMajorAxisKm ?? 1), 1)

  return visibleMoons.map((moon, index) => {
    const normalizedAxis = Math.log10(1 + (moon.semiMajorAxisKm ?? 1)) / Math.log10(1 + maximumAxis)
    const orbitRadius = 2.65 + normalizedAxis * 3.1
    return (
      <LocalMoon key={moon.id} moon={moon} index={index} orbitRadius={orbitRadius} />
    )
  })
}

interface CorridorEnvelopeProps {
  definition: EntryCorridorDefinition
  anchor: THREE.Vector3
  velocity: THREE.Vector3
  phase: 'entry' | 'exit'
  color: string
  centerColor: string
}

function CorridorEnvelope({ definition, anchor, velocity, phase, color, centerColor }: CorridorEnvelopeProps) {
  const geometry = useMemo(() => {
    const flightDirection = velocity.clone().normalize()
    const corridorLength = 3.7
    const start = phase === 'entry'
      ? anchor.clone().addScaledVector(flightDirection, -corridorLength)
      : anchor.clone()
    const end = phase === 'entry'
      ? anchor.clone()
      : anchor.clone().addScaledVector(flightDirection, corridorLength)
    const reference = Math.abs(flightDirection.y) < 0.9
      ? new THREE.Vector3(0, 1, 0)
      : new THREE.Vector3(1, 0, 0)
    const horizontal = new THREE.Vector3().crossVectors(flightDirection, reference).normalize()
    const vertical = new THREE.Vector3().crossVectors(horizontal, flightDirection).normalize()
    const rotation = THREE.MathUtils.degToRad(definition.rotationDeg)
    horizontal.applyAxisAngle(flightDirection, rotation)
    vertical.applyAxisAngle(flightDirection, rotation)
    const broadHorizontal = Math.max(0.24, Math.tan(THREE.MathUtils.degToRad(definition.horizontalHalfAngleDeg)) * corridorLength)
    const broadVertical = Math.max(0.18, Math.tan(THREE.MathUtils.degToRad(definition.verticalHalfAngleDeg)) * corridorLength)
    const narrowHorizontal = 0.065
    const narrowVertical = 0.05
    const section = (center: THREE.Vector3, halfHorizontal: number, halfVertical: number) => [
      center.clone().addScaledVector(horizontal, -halfHorizontal).addScaledVector(vertical, -halfVertical),
      center.clone().addScaledVector(horizontal, -halfHorizontal).addScaledVector(vertical, halfVertical),
      center.clone().addScaledVector(horizontal, halfHorizontal).addScaledVector(vertical, halfVertical),
      center.clone().addScaledVector(horizontal, halfHorizontal).addScaledVector(vertical, -halfVertical),
    ]
    const startSection = section(start, broadHorizontal, broadVertical)
    const endSection = section(end, narrowHorizontal, narrowVertical)
    return {
      sections: [
        [...startSection, startSection[0]],
        [...endSection, endSection[0]],
      ],
      rails: startSection.map((point, index) => [point, endSection[index]]),
      center: [start, end],
    }
  }, [
    anchor.x,
    anchor.y,
    anchor.z,
    definition.horizontalHalfAngleDeg,
    definition.rotationDeg,
    definition.verticalHalfAngleDeg,
    phase,
    velocity.x,
    velocity.y,
    velocity.z,
  ])

  return (
    <group>
      {geometry.sections.map((points, index) => (
        <Line key={`section-${index}`} points={points} color={color} lineWidth={1.25} transparent opacity={0.78} />
      ))}
      {geometry.rails.map((points, index) => (
        <Line key={`rail-${index}`} points={points} color={color} lineWidth={1} transparent opacity={0.52} />
      ))}
      <Line points={geometry.center} color={centerColor} lineWidth={2.1} dashed dashSize={0.12} gapSize={0.08} />
    </group>
  )
}

function passageFrame(entryDirection: CorridorTuple, orbitDirection: RoutePassageDirection) {
  const radial = physicsToScene(new THREE.Vector3(...entryDirection).normalize())
  const reference = Math.abs(radial.y) < 0.88
    ? new THREE.Vector3(0, 1, 0)
    : new THREE.Vector3(1, 0, 0)
  const normal = reference.cross(radial).normalize()
  if (orbitDirection === 'retrograde') normal.negate()
  const tangent = normal.clone().cross(radial).normalize()
  return { radial, normal, tangent }
}

function fallbackPassageExitDirection(entryDirection: CorridorTuple, passage: RoutePassageDefinition) {
  if (passage.mode === 'direct') {
    return [...entryDirection] as CorridorTuple
  }
  const { radial, normal } = passageFrame(entryDirection, passage.orbitDirection)
  const angleDeg = passage.mode === 'full-orbit' ? 360 : passage.orbitAngleDeg
  return sceneToPhysics(radial.applyAxisAngle(normal, THREE.MathUtils.degToRad(angleDeg)))
}

function boundaryVelocity(
  behavior: RouteBoundaryBehavior,
  radial: THREE.Vector3,
  orbitTangent: THREE.Vector3,
  isExit: boolean,
) {
  const progradeFrame = passageFrame(sceneToPhysics(radial), 'prograde')
  if (behavior === 'tangential-prograde') return progradeFrame.tangent
  if (behavior === 'tangential-retrograde') return progradeFrame.tangent.negate()
  if (behavior === 'tangential-accelerate') return orbitTangent.clone()
  if (behavior === 'radial') return radial.clone().multiplyScalar(isExit ? 1 : -1)
  return orbitTangent.clone()
}

interface PassageTrajectoryProps {
  geometry: PassageGeometry
}

function PassageTrajectory({ geometry }: PassageTrajectoryProps) {
  return (
    <group>
      <Line points={geometry.entryVector} color="#67dcff" lineWidth={3} />
      {geometry.orbitPoints.length > 1 && <Line points={geometry.orbitPoints} color="#fff06f" lineWidth={3.4} />}
      {geometry.directFlyby.length > 1 && <Line points={geometry.directFlyby} color="#fff06f" lineWidth={5.2} transparent opacity={0.34} />}
      {geometry.safetyBoundary.length > 1 && <Line points={geometry.safetyBoundary} color="#65f0b7" lineWidth={1.25} dashed dashSize={0.08} gapSize={0.07} transparent opacity={0.64} />}
      <Line points={geometry.exitVector} color="#ff9f67" lineWidth={3} />
      <mesh position={geometry.entryPoint}>
        <sphereGeometry args={[0.065, 18, 18]} />
        <meshBasicMaterial color="#67dcff" />
      </mesh>
      <mesh position={geometry.exitPoint}>
        <sphereGeometry args={[0.065, 18, 18]} />
        <meshBasicMaterial color="#ff9f67" />
      </mesh>
    </group>
  )
}

function createPassageGeometry(
  entryDirection: CorridorTuple,
  exitDirection: CorridorTuple,
  passage: RoutePassageDefinition,
) {
  const orbitRadius = passage.mode === 'direct' ? 2.28 : 2.16
  const { radial: entryRadial, normal, tangent: entryTangent } = passageFrame(entryDirection, passage.orbitDirection)
  const entryPoint = entryRadial.clone().multiplyScalar(orbitRadius)
  const angleDeg = passage.mode === 'full-orbit'
    ? 360
    : passage.mode === 'partial-orbit'
      ? passage.orbitAngleDeg
      : 0
  const orbitPointCount = Math.max(73, Math.ceil(Math.abs(angleDeg) / 2) + 1)
  const orbitPoints = passage.mode === 'direct'
    ? []
    : Array.from({ length: orbitPointCount }, (_, index) => (
        entryRadial.clone()
          .applyAxisAngle(normal, THREE.MathUtils.degToRad(angleDeg * index / (orbitPointCount - 1)))
          .multiplyScalar(orbitRadius)
      ))
  const exitRadial = passage.mode === 'direct'
    ? entryRadial.clone()
    : physicsToScene(new THREE.Vector3(...exitDirection).normalize())
  const exitPoint = exitRadial.clone().multiplyScalar(orbitRadius)
  const exitTangent = normal.clone().cross(exitRadial).normalize()
  const entryVelocity = passage.mode === 'direct' && passage.entryBehavior === 'ballistic'
    ? entryTangent.clone()
    : boundaryVelocity(passage.entryBehavior, entryRadial, entryTangent, false)
  const exitVelocity = passage.mode === 'direct' && passage.exitBehavior === 'ballistic'
    ? entryTangent.clone()
    : boundaryVelocity(passage.exitBehavior, exitRadial, exitTangent, true)
  const entryVector = [entryPoint.clone().addScaledVector(entryVelocity, -2.15), entryPoint]
  const exitVector = [exitPoint, exitPoint.clone().addScaledVector(exitVelocity, 2.15)]
  const safetyBoundary = passage.mode === 'direct'
    ? Array.from({ length: 145 }, (_, index) => (
        entryRadial.clone().applyAxisAngle(normal, Math.PI * 2 * index / 144).multiplyScalar(orbitRadius)
      ))
    : []
  return {
    entryPoint,
    exitPoint,
    entryVelocity,
    exitVelocity,
    orbitPoints,
    entryVector,
    exitVector,
    directFlyby: passage.mode === 'direct' ? [entryVector[0], entryPoint, exitVector[1]] : [],
    safetyBoundary,
  }
}

type PassageGeometry = ReturnType<typeof createPassageGeometry>

function LocalPlanetScene({
  planet,
  moons,
  corridorDefinition,
  actualEntryDirection = null,
  exitDirection = null,
  passage,
}: Omit<LocalPlanetThreeDProps, 'epochLabel'>) {
  const selectedEntryDirection = actualEntryDirection ?? corridorDefinition.centerDirection
  const fallbackExitDirection = fallbackPassageExitDirection(selectedEntryDirection, passage)
  const selectedExitDirection = exitDirection ?? fallbackExitDirection
  const passageGeometry = useMemo(
    () => createPassageGeometry(selectedEntryDirection, selectedExitDirection, passage),
    [
      selectedEntryDirection[0],
      selectedEntryDirection[1],
      selectedEntryDirection[2],
      selectedExitDirection[0],
      selectedExitDirection[1],
      selectedExitDirection[2],
      passage.entryBehavior,
      passage.exitBehavior,
      passage.mode,
      passage.orbitAngleDeg,
      passage.orbitDirection,
    ],
  )
  return (
    <>
      <color attach="background" args={['#020712']} />
      <fog attach="fog" args={['#020712', 15, 32]} />
      <Stars radius={45} depth={18} count={1000} factor={2.2} saturation={0.2} fade speed={0.15} />
      <ambientLight intensity={0.38} />
      <directionalLight position={[-6, 5, 7]} intensity={2.2} castShadow />
      <pointLight position={[5, -2, -4]} intensity={0.25} color="#79e4ff" />
      <PlanetBody planet={planet} />
      <LocalMoons moons={moons} />
      <CorridorEnvelope
        definition={corridorDefinition}
        anchor={passageGeometry.entryPoint}
        velocity={passageGeometry.entryVelocity}
        phase="entry"
        color={corridorDefinition.blocked ? '#ff6f7f' : '#65f0b7'}
        centerColor="#b8ffe0"
      />
      <CorridorEnvelope
        definition={corridorDefinition}
        anchor={passageGeometry.exitPoint}
        velocity={passageGeometry.exitVelocity}
        phase="exit"
        color="#ffbf66"
        centerColor="#ffe1a8"
      />
      <PassageTrajectory geometry={passageGeometry} />
      <OrbitControls makeDefault enablePan={false} enableDamping dampingFactor={0.08} minDistance={4.2} maxDistance={15} />
    </>
  )
}

export function LocalPlanetThreeD({
  planet,
  moons,
  epochLabel,
  corridorDefinition,
  actualEntryDirection = null,
  exitDirection = null,
  passage,
}: LocalPlanetThreeDProps) {
  const representedMoons = Math.min(
    MAX_VISIBLE_MOONS,
    moons.filter((moon) => Number.isFinite(moon.semiMajorAxisKm)).length,
  )
  return (
    <section className="local-planet-three-d" aria-labelledby="local-planet-three-d-title">
      <header>
        <div>
          <small>Planetenzentrierte Ansicht · {epochLabel}</small>
          <h2 id="local-planet-three-d-title">{planet.name} lokal in 3D</h2>
        </div>
        <span>{representedMoons} / {moons.length} Monde dargestellt</span>
      </header>
      <div className="local-planet-three-d-canvas" role="img" aria-label={`Lokale dreidimensionale Ansicht von ${planet.name}`}>
        <Canvas shadows camera={{ position: [0, 3.4, 8.8], fov: 46, near: 0.05, far: 80 }}>
          <LocalPlanetScene
            planet={planet}
            moons={moons}
            corridorDefinition={corridorDefinition}
            actualEntryDirection={actualEntryDirection}
            exitDirection={exitDirection}
            passage={passage}
          />
        </Canvas>
      </div>
      <footer className="local-three-d-legend" aria-label="Legende der lokalen 3D-Ansicht">
        <span className="entry">Zielkorridor / Eintritt</span>
        <span className="exit">Austrittskorridor</span>
        <span className="entry-vector">Eintrittsvektor · {passage.entryBehavior}</span>
        <span className="passage">{passage.mode === 'full-orbit' ? 'Volle Umrundung · 360°' : passage.mode === 'partial-orbit' ? `Teilumrundung · ${passage.orbitAngleDeg}°` : 'Direkter Vorbeiflug · ungebunden'}</span>
        {passage.mode === 'direct' && <span className="safe">Sicherheitsgrenze · keine Einfangbahn</span>}
        <span className="moons">Monde · animierter Zeitraffer</span>
      </footer>
    </section>
  )
}

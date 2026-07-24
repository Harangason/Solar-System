import assert from 'node:assert/strict'

import {
  circleWorldEdge,
  circleWorldNormal,
  circleWorldPoints,
  axisDragPlaneNormal,
  rayAxisPlaneScalar,
  rotatedEulerFromDrag,
  sceneTuple,
  sceneVector,
} from '../src/routeSketchGeometry.ts'
import * as THREE from 'three'
import { popSketchHistory, removeSketchSelection, updateSketchLineEndpoint } from '../src/routeSketchState.ts'

const tolerance = 1e-9
const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} != ${expected}`)

const circle = {
  center: [3.25, -1.5, 7.75],
  radius: 4.2,
  rotation: [0.71, -0.43, 1.17],
}

const center = sceneVector(circle.center)
assert.deepEqual(sceneTuple(center), circle.center, 'Tuple/Vector-Rundlauf muss verlustfrei sein')

const points = circleWorldPoints(circle)
assert.equal(points.length, 97, 'Ein Kreis muss 96 Segmente plus Schlusspunkt besitzen')
assert.ok(points[0].distanceTo(points.at(-1)) <= tolerance, 'Der Kreis muss geometrisch geschlossen sein')

const normal = circleWorldNormal(circle.rotation)
close(normal.length(), 1, 'Die Ebenennormale muss normiert sein')
for (const [index, point] of points.entries()) {
  const relative = point.clone().sub(center)
  close(relative.length(), circle.radius, `Punkt ${index} muss den Radius erhalten`)
  close(relative.dot(normal), 0, `Punkt ${index} muss in der gedrehten Kreisebene liegen`)
}

const edge = circleWorldEdge(circle)
close(edge.distanceTo(center), circle.radius, 'Der Radiusgriff muss auf dem Kreis liegen')
close(edge.clone().sub(center).dot(normal), 0, 'Der Radiusgriff muss der gedrehten Ebene folgen')

const baseNormal = circleWorldNormal([0, 0, 0])
assert.ok(baseNormal.distanceTo(normal) > 0.25, 'Eine 3D-Rotation muss die Ebenennormale sichtbar verändern')

const xQuarterTurn = circleWorldNormal([Math.PI / 2, 0, 0])
close(xQuarterTurn.x, 0, 'X-90°: Normale X')
close(xQuarterTurn.y, 0, 'X-90°: Normale Y')
close(xQuarterTurn.z, 1, 'X-90°: Normale Z')

const xAxis = new THREE.Vector3(1, 0, 0)
const origin = new THREE.Vector3(0, 0, 0)
const startRay = new THREE.Ray(new THREE.Vector3(1, 5, 5), new THREE.Vector3(0, -1, -1).normalize())
const movedRay = new THREE.Ray(new THREE.Vector3(4.5, 5, 5), new THREE.Vector3(0, -1, -1).normalize())
const dragPlaneNormal = axisDragPlaneNormal(xAxis, new THREE.Vector3(0, 1, 1))
const startScalar = rayAxisPlaneScalar(startRay, origin, xAxis, dragPlaneNormal)
const movedScalar = rayAxisPlaneScalar(movedRay, origin, xAxis, dragPlaneNormal)
close(dragPlaneNormal.dot(xAxis), 0, 'Die Ziehebene muss die Bewegungsachse enthalten')
close(startScalar, 1, 'Achsen-Drag muss den Startwert treffen')
close(movedScalar, 4.5, 'Achsen-Drag muss die 3D-Zeigerbewegung projizieren')
close(movedScalar - startScalar, 3.5, 'Achsen-Drag muss die korrekte Verschiebung liefern')
const parallelFallbackNormal = axisDragPlaneNormal(xAxis, new THREE.Vector3(1, 0, 0))
close(parallelFallbackNormal.length(), 1, 'Parallelansicht benötigt eine stabile Ersatzebene')
close(parallelFallbackNormal.dot(xAxis), 0, 'Auch die Ersatzebene muss die Achse enthalten')

const draggedRotation = rotatedEulerFromDrag(
  new THREE.Quaternion(),
  new THREE.Vector3(0, 0, 1),
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(0, 1, 0),
)
close(draggedRotation.x, 0, 'Drehring X-Komponente')
close(draggedRotation.y, 0, 'Drehring Y-Komponente')
close(draggedRotation.z, Math.PI / 2, 'Drehring muss 90° um Z ergeben')

const sketch = {
  nodes: [
    { id: 'locked', label: 'Anker', position: [0, 0, 0], locked: true, anchor: 'sun' },
    { id: 'free', label: 'Stützpunkt', position: [1, 2, 3], locked: false, anchor: 'control' },
  ],
  lines: [{ id: 'line', start: [0, 0, 0], end: [1, 2, 3] }],
  circles: [{ id: 'circle', center: [0, 0, 0], radius: 2, rotation: [0, 0, 0], label: 'Kreis' }],
}

assert.strictEqual(removeSketchSelection(sketch, { kind: 'node', id: 'locked' }), sketch, 'Gesperrte Ephemeridenanker dürfen nicht gelöscht werden')
assert.equal(removeSketchSelection(sketch, { kind: 'node', id: 'free' }).nodes.length, 1, 'Entf muss freie Stützpunkte löschen')
assert.equal(removeSketchSelection(sketch, { kind: 'line-end', id: 'line' }).lines.length, 0, 'Entf muss die ausgewählte Linie löschen')
assert.equal(removeSketchSelection(sketch, { kind: 'circle-radius', id: 'circle' }).circles.length, 0, 'Entf am Radiusgriff muss den Kreis löschen')

const movedLine = updateSketchLineEndpoint(sketch, 'line', 'end', [4.5, 2, 3])
assert.deepEqual(movedLine.lines[0].start, sketch.lines[0].start, 'Beim Ziehen darf der andere Linienpunkt nicht springen')
assert.deepEqual(movedLine.lines[0].end, [4.5, 2, 3], 'Nur der ausgewählte Linienpunkt darf aktualisiert werden')
assert.deepEqual(sketch.lines[0].end, [1, 2, 3], 'Der vorherige Zustand muss für Strg+Z unverändert bleiben')

const history = [sketch, { ...sketch, lines: [] }]
const undo = popSketchHistory(history)
assert.strictEqual(undo.previous, history[1], 'Strg+Z muss den jüngsten vollständigen Zustand liefern')
assert.equal(undo.remaining.length, 1, 'Strg+Z muss genau einen Historieneintrag entfernen')

console.log(JSON.stringify({
  status: 'passed',
  checks: 2 * points.length + 28,
  normal: sceneTuple(normal),
  edge: sceneTuple(edge),
}))

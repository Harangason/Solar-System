import type { RouteSketch, RouteSketchSelection } from './components/RoutePlanPreview'
import type { SceneTuple } from './routeSketchGeometry'

export function updateSketchLineEndpoint(
  sketch: RouteSketch,
  lineId: string,
  endpoint: 'start' | 'end',
  position: SceneTuple,
) {
  if (!sketch.lines.some((line) => line.id === lineId)) return sketch
  return {
    ...sketch,
    lines: sketch.lines.map((line) => line.id === lineId ? { ...line, [endpoint]: position } : line),
  }
}

export function removeSketchSelection(sketch: RouteSketch, selection: RouteSketchSelection) {
  if (!selection) return sketch
  if (selection.kind === 'node') {
    const selectedNode = sketch.nodes.find((node) => node.id === selection.id)
    if (!selectedNode || selectedNode.locked) return sketch
    return { ...sketch, nodes: sketch.nodes.filter((node) => node.id !== selection.id) }
  }
  if (selection.kind === 'line-start' || selection.kind === 'line-end') {
    if (!sketch.lines.some((line) => line.id === selection.id)) return sketch
    return { ...sketch, lines: sketch.lines.filter((line) => line.id !== selection.id) }
  }
  if (!sketch.circles.some((circle) => circle.id === selection.id)) return sketch
  return { ...sketch, circles: sketch.circles.filter((circle) => circle.id !== selection.id) }
}

export function popSketchHistory(history: RouteSketch[]) {
  if (history.length === 0) return { previous: null, remaining: history }
  return { previous: history.at(-1) ?? null, remaining: history.slice(0, -1) }
}

import { type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode, useLayoutEffect, useRef, useState } from 'react'

interface Position {
  x: number
  y: number
}

interface DragState {
  pointerId: number
  pointerX: number
  pointerY: number
  panelX: number
  panelY: number
}

interface DraggableOverlayPanelProps {
  ariaLabel: string
  children: ReactNode
  className: string
  draggable?: boolean
  header: ReactNode
}

function clamp(value: number, minimum: number, maximum: number) {
  if (maximum < minimum) return minimum
  return Math.min(maximum, Math.max(minimum, value))
}

function constrainedPosition(panel: HTMLElement, candidate: Position) {
  const host = panel.closest('.scene-wrap') as HTMLElement | null
  if (!host) return candidate
  const margin = 8
  return {
    x: clamp(candidate.x, margin, Math.max(margin, host.clientWidth - panel.offsetWidth - margin)),
    y: clamp(candidate.y, margin, Math.max(margin, host.clientHeight - panel.offsetHeight - margin)),
  }
}

function isInteractiveTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest('button, input, select, textarea, a, summary'))
}

export function DraggableOverlayPanel({ ariaLabel, children, className, draggable = true, header }: DraggableOverlayPanelProps) {
  const panelRef = useRef<HTMLElement>(null)
  const initialPositionRef = useRef<Position | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const [position, setPosition] = useState<Position | null>(null)

  useLayoutEffect(() => {
    if (!draggable) {
      setPosition(null)
      return undefined
    }
    const panel = panelRef.current
    if (!panel) return undefined
    const initial = { x: panel.offsetLeft, y: panel.offsetTop }
    initialPositionRef.current = initial
    setPosition(constrainedPosition(panel, initial))

    const observer = new ResizeObserver(() => {
      setPosition((current) => current ? constrainedPosition(panel, current) : current)
    })
    observer.observe(panel)
    const host = panel.closest('.scene-wrap')
    if (host) observer.observe(host)
    return () => observer.disconnect()
  }, [draggable])

  const style: CSSProperties | undefined = draggable && position
    ? { left: position.x, right: 'auto', top: position.y }
    : undefined

  const beginDrag = (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0 || isInteractiveTarget(event.target)) return
    const panel = panelRef.current
    if (!panel) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    const current = position ?? { x: panel.offsetLeft, y: panel.offsetTop }
    dragRef.current = {
      pointerId: event.pointerId,
      pointerX: event.clientX,
      pointerY: event.clientY,
      panelX: current.x,
      panelY: current.y,
    }
  }

  const movePanel = (event: PointerEvent<HTMLElement>) => {
    const panel = panelRef.current
    const drag = dragRef.current
    if (!panel || !drag || drag.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    setPosition(constrainedPosition(panel, {
      x: drag.panelX + event.clientX - drag.pointerX,
      y: drag.panelY + event.clientY - drag.pointerY,
    }))
  }

  const endDrag = (event: PointerEvent<HTMLElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    dragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const resetPosition = () => {
    const panel = panelRef.current
    const initial = initialPositionRef.current
    if (panel && initial) setPosition(constrainedPosition(panel, initial))
  }

  const moveWithKeyboard = (event: KeyboardEvent<HTMLElement>) => {
    const panel = panelRef.current
    if (!panel) return
    if (event.key === 'Escape') {
      event.preventDefault()
      resetPosition()
      return
    }
    const step = event.shiftKey ? 32 : 10
    const movement: Record<string, Position> = {
      ArrowLeft: { x: -step, y: 0 },
      ArrowRight: { x: step, y: 0 },
      ArrowUp: { x: 0, y: -step },
      ArrowDown: { x: 0, y: step },
    }
    const delta = movement[event.key]
    if (!delta) return
    event.preventDefault()
    event.stopPropagation()
    setPosition((current) => constrainedPosition(panel, {
      x: (current?.x ?? panel.offsetLeft) + delta.x,
      y: (current?.y ?? panel.offsetTop) + delta.y,
    }))
  }

  return (
    <aside ref={panelRef} className={`${className} draggable-overlay-panel ${draggable ? 'is-draggable' : 'is-fixed'}`} style={style} aria-label={ariaLabel} data-draggable-panel={draggable ? ariaLabel : undefined}>
      <header
        className="draggable-panel-header"
        tabIndex={draggable ? 0 : undefined}
        title={draggable ? 'Am Kopf ziehen · Doppelklick oder Esc setzt die Position zurück' : 'Feste linke Seitenleiste'}
        onDoubleClick={draggable ? (event) => {
          if (isInteractiveTarget(event.target)) return
          event.preventDefault()
          event.stopPropagation()
          resetPosition()
        } : undefined}
        onKeyDown={draggable ? moveWithKeyboard : undefined}
        onPointerDown={draggable ? beginDrag : undefined}
        onPointerMove={draggable ? movePanel : undefined}
        onPointerUp={draggable ? endDrag : undefined}
        onPointerCancel={draggable ? endDrag : undefined}
        onLostPointerCapture={draggable ? () => { dragRef.current = null } : undefined}
      >
        {header}
        {draggable ? <span className="draggable-panel-grip" aria-hidden="true">⠿</span> : <span className="fixed-panel-badge">FEST</span>}
      </header>
      {children}
    </aside>
  )
}

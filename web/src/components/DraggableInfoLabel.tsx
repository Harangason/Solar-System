import { Html } from '@react-three/drei'
import { type KeyboardEvent, type PointerEvent, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Vector3 } from 'three'

interface DraggableInfoLabelProps {
  children: ReactNode
  initialOffset?: [number, number]
  label: string
  onDragChange?: (label: string, active: boolean) => void
  position?: Vector3 | [number, number, number]
}

interface Offset {
  x: number
  y: number
}

interface DragState {
  pointerId: number
  pointerX: number
  pointerY: number
  offsetX: number
  offsetY: number
}

function leaderEndpoint(offset: Offset, width: number, height: number) {
  const centerX = offset.x + width / 2
  const centerY = offset.y + height / 2
  const halfWidth = width / 2
  const halfHeight = height / 2

  if (Math.abs(centerX) <= halfWidth && Math.abs(centerY) <= halfHeight) return { x: 0, y: 0 }

  const horizontalRatio = centerX === 0 ? Number.POSITIVE_INFINITY : halfWidth / Math.abs(centerX)
  const verticalRatio = centerY === 0 ? Number.POSITIVE_INFINITY : halfHeight / Math.abs(centerY)
  const ratioFromCenterToEdge = Math.min(horizontalRatio, verticalRatio)
  return {
    x: centerX * (1 - ratioFromCenterToEdge),
    y: centerY * (1 - ratioFromCenterToEdge),
  }
}

function clamp(value: number, minimum: number, maximum: number) {
  if (maximum < minimum) return (minimum + maximum) / 2
  return Math.min(maximum, Math.max(minimum, value))
}

function overlapsSource(offset: Offset, width: number, height: number, clearance = 18) {
  return offset.x < clearance
    && offset.x + width > -clearance
    && offset.y < clearance
    && offset.y + height > -clearance
}

export function DraggableInfoLabel({ children, initialOffset = [36, -90], label, onDragChange, position }: DraggableInfoLabelProps) {
  const initialRef = useRef<Offset>({ x: initialOffset[0], y: initialOffset[1] })
  const [offset, setOffset] = useState<Offset>(initialRef.current)
  const [cardSize, setCardSize] = useState({ width: 180, height: 64 })
  const anchorRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)

  useLayoutEffect(() => {
    const card = cardRef.current
    if (!card) return undefined
    const updateSize = () => setCardSize({ width: card.offsetWidth, height: card.offsetHeight })
    updateSize()
    const observer = new ResizeObserver(updateSize)
    observer.observe(card)
    return () => observer.disconnect()
  }, [])

  useEffect(() => () => onDragChange?.(label, false), [label, onDragChange])

  const endpoint = leaderEndpoint(offset, cardSize.width, cardSize.height)
  const resetPosition = () => setOffset(initialRef.current)

  const constrainOffset = (candidate: Offset) => {
    const anchor = anchorRef.current
    const card = cardRef.current
    const host = card?.closest('.scene-wrap') as HTMLElement | null
    if (!anchor || !card || !host) return candidate

    const hostRect = host.getBoundingClientRect()
    const anchorRect = anchor.getBoundingClientRect()
    const width = card.offsetWidth
    const height = card.offsetHeight
    const margin = 12
    const minimumX = hostRect.left + margin - anchorRect.left
    const maximumX = hostRect.right - margin - width - anchorRect.left
    const minimumY = hostRect.top + margin - anchorRect.top
    const maximumY = hostRect.bottom - margin - height - anchorRect.top
    const bound = (value: Offset) => ({
      x: clamp(value.x, minimumX, maximumX),
      y: clamp(value.y, minimumY, maximumY),
    })
    const bounded = bound(candidate)
    if (!overlapsSource(bounded, width, height)) return bounded

    const clearance = 18
    const alternatives = [
      bound({ x: -width - clearance, y: bounded.y }),
      bound({ x: clearance, y: bounded.y }),
      bound({ x: bounded.x, y: -height - clearance }),
      bound({ x: bounded.x, y: clearance }),
    ].filter((value) => !overlapsSource(value, width, height, clearance))
    return alternatives.sort((left, right) => (
      Math.hypot(left.x - bounded.x, left.y - bounded.y)
      - Math.hypot(right.x - bounded.x, right.y - bounded.y)
    ))[0] ?? bounded
  }

  const beginDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      pointerX: event.clientX,
      pointerY: event.clientY,
      offsetX: offset.x,
      offsetY: offset.y,
    }
    onDragChange?.(label, true)
  }

  const moveCard = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    setOffset(constrainOffset({
      x: drag.offsetX + event.clientX - drag.pointerX,
      y: drag.offsetY + event.clientY - drag.pointerY,
    }))
  }

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    dragRef.current = null
    onDragChange?.(label, false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const moveWithKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 30 : 8
    const movement: Record<string, Offset> = {
      ArrowLeft: { x: -step, y: 0 },
      ArrowRight: { x: step, y: 0 },
      ArrowUp: { x: 0, y: -step },
      ArrowDown: { x: 0, y: step },
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      resetPosition()
      return
    }
    const delta = movement[event.key]
    if (!delta) return
    event.preventDefault()
    event.stopPropagation()
    setOffset((current) => constrainOffset({ x: current.x + delta.x, y: current.y + delta.y }))
  }

  return (
    <Html position={position} style={{ pointerEvents: 'none' }} zIndexRange={[2, 1]}>
      <div ref={anchorRef} className="draggable-info-anchor" data-info-source={label}>
        <svg className="draggable-info-leader" aria-hidden="true">
          <line x1="0" y1="0" x2={endpoint.x} y2={endpoint.y} />
          <circle cx="0" cy="0" r="3" />
        </svg>
        <div
          ref={cardRef}
          className="draggable-info-card"
          data-draggable-info={label}
          style={{ transform: `translate3d(${offset.x}px, ${offset.y}px, 0)` }}
          role="group"
          aria-label={`${label} – verschiebbare Information`}
          tabIndex={0}
          title="Ziehen zum Verschieben · Doppelklick oder Esc setzt die Position zurück"
          onDoubleClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            resetPosition()
          }}
          onKeyDown={moveWithKeyboard}
          onPointerDown={beginDrag}
          onPointerMove={moveCard}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onLostPointerCapture={() => {
            dragRef.current = null
            onDragChange?.(label, false)
          }}
          onWheel={(event) => event.stopPropagation()}
        >
          <span className="draggable-info-grip" aria-hidden="true">⠿</span>
          {children}
        </div>
      </div>
    </Html>
  )
}

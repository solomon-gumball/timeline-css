import { CSSProperties, useState, useLayoutEffect } from 'react'

function blockAllPointerEvents(cursor: CSSProperties['cursor']) {
  const children = document.body.children
  for (const child of children) {
    if (child instanceof HTMLElement) {
      child.style.pointerEvents = 'none'
    }
  }
  cursor && document.body.style.setProperty('cursor', cursor, 'important')

  return () => {
    for (const child of children) {
      if (child instanceof HTMLElement) {
        child.style.pointerEvents = ''
      }
    }
    document.body.style.setProperty('cursor', '', 'important')
  }
}

export function useKeysPressed() {
  const [keypressMap] = useState(() => new Set<string>())
  useLayoutEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      keypressMap.add(e.key)
    }
    function handleKeyUp(e: KeyboardEvent) {
      keypressMap.delete(e.key)
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('keyup', handleKeyUp)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('keyup', handleKeyUp)
    }
  })
  return keypressMap
}

const drag = <ElementType extends SVGGraphicsElement | HTMLElement>(callback: DragHandler<ElementType>, cursor: CSSProperties['cursor']) => (e: React.MouseEvent<ElementType>) => {
  e.stopPropagation()
  const dragThreshold = 3
  const selectedElement = e.currentTarget

  if (selectedElement instanceof SVGGraphicsElement) {
    let svg: SVGElement = selectedElement
    while (svg.parentNode instanceof SVGElement) { svg = svg.parentNode }
    if (svg instanceof SVGSVGElement) {
      const container = svg
      const transform = selectedElement.transform.baseVal.numberOfItems > 0 ? selectedElement.transform.baseVal.getItem(0) : undefined
      const offset = getMousePosition(container, e.clientX, e.clientY)
      const initialPosition: [number, number] = transform ? [transform.matrix.e, transform.matrix.f] : [0, 0]
      let lastPosition: [number, number] = [...initialPosition]
      offset.x -= initialPosition[0]
      offset.y -= initialPosition[1]

      let didDrag = false
      const onDragCallback = callback(e.target as ElementType, initialPosition, [offset.x, offset.y])
      if (onDragCallback == null) { return }
      let resetPointerEvents = () => {}
      const handleDrag = (e: MouseEvent) => {
        e.preventDefault()
        const coord = getMousePosition(container, e.clientX, e.clientY)
        const position: [number, number] = [coord.x - offset.x, coord.y - offset.y]
        // const delta = [position[0], position[1]]
        const maxDelta = Math.max(Math.abs(position[0]), Math.abs(position[1]))
        // console.log(maxDelta, dragThreshold)
        if (!didDrag && maxDelta > dragThreshold) {
          resetPointerEvents = blockAllPointerEvents(cursor)

          document.body.addEventListener('click', e => {
            if (didDrag) {
              e.preventDefault()
              e.stopPropagation()
              e.stopImmediatePropagation()
            }
          }, { once: true })

          onDragCallback?.onDragStart?.()
          didDrag = true
        }
        if (didDrag) {
          onDragCallback?.onDrag?.({ delta: [lastPosition[0] - position[0], lastPosition[1] - position[1]], position })
        }
        lastPosition = [...position]
      }

      document.body.addEventListener('mousemove', handleDrag)
      document.body.addEventListener('mouseup', e => {
        e.preventDefault()
        e.stopImmediatePropagation()
        e.stopPropagation()
        onDragCallback?.onDragEnd?.(lastPosition)
        document.body.removeEventListener('mousemove', handleDrag)
        resetPointerEvents()
      }, { once: true })
    }
  } else if (e.target instanceof HTMLElement) {
    const container = document
    const selectedElement = e.target
    const initialPosition: [number, number] = [e.pageX, e.pageY]
    let lastPosition: [number, number] = [...initialPosition]

    let didDrag = false
    const onDragCallback = callback(e.target as ElementType, initialPosition, initialPosition)
    if (onDragCallback == null) { return }
    const resetPointerEvents = blockAllPointerEvents(cursor)
    const handleDrag = (e: MouseEvent) => {
      e.preventDefault()
      if (!didDrag) {
        selectedElement.addEventListener('click', e => {
          if (didDrag) {
            e.stopImmediatePropagation()
          }
        }, { once: true })

        didDrag = true
      }

      const position: [number, number] = [e.pageX, e.pageY]
      onDragCallback?.onDrag?.({ delta: [lastPosition[0] - position[0], lastPosition[1] - position[1]], position })
      lastPosition = [...position]
    }

    container.addEventListener('mousemove', handleDrag)
    container.addEventListener('mouseup', () => {
      resetPointerEvents()
      onDragCallback?.onDragEnd?.(lastPosition)
      container.removeEventListener('mousemove', handleDrag)
    }, { once: true })
  }
}

export const BezierCurve = (p0: [number, number], p1: [number, number], p2: [number, number], p3: [number, number]) => (t: number) => {
  const cX = 3 * (p1[0] - p0[0]),
    bX = 3 * (p2[0] - p1[0]) - cX,
    aX = p3[0] - p0[0] - cX - bX

  const cY = 3 * (p1[1] - p0[1]),
    bY = 3 * (p2[1] - p1[1]) - cY,
    aY = p3[1] - p0[1] - cY - bY

  const x = (aX * Math.pow(t, 3)) + (bX * Math.pow(t, 2)) + (cX * t) + p0[0]
  const y = (aY * Math.pow(t, 3)) + (bY * Math.pow(t, 2)) + (cY * t) + p0[1]

  return {x: x, y: y}
}

export type DragHandler<ElementType> = (element: ElementType, initialVal: [number, number], mousePos: [number, number]) => DragTriggers | undefined
export type DragTriggers = {
  onDragStart?: () => void,
  onDrag?: (event: { delta: [number, number], position: [number, number] }) => void,
  onDragEnd?: (position: [number, number]) => void,
}

export function getMousePosition (container: SVGSVGElement, clientX: number, clientY: number) {
  const CTM = container.getScreenCTM()
  if (CTM == null) { return { x: 0, y: 0 } }
  return {
    x: (clientX - CTM.e) / CTM.a,
    y: (clientY - CTM.f) / CTM.d,
  }
}

export default drag
import React, { useEffect, PropsWithChildren, useRef, useState, useLayoutEffect, ReactNode, ReactElement, useMemo } from 'react'
import ReactDOM from 'react-dom'
import { v4 } from 'uuid'
import { classNames, useUpdateTrigger } from './util'
import styles from './css/popover.scss'

interface Position {
  vertical: 'top' | 'center' | 'bottom',
  horizontal: 'left' | 'center' | 'right',
}

export interface PopoverState {
  anchorOrigin: Position,
  transformOrigin: Position,
}

type ContentSize = { width: number, height: number }
type AnchorRef = React.RefObject<Element>
type AnchorFactory = (popoverState: PopoverState) => ReactNode
type PopupPositionState = { anchorOrigin: Position, transformOrigin: Position }

interface PopoverProps {
  children: ReactNode | ((popoverState: PopoverState) => ReactNode),
  boundaryElement?: HTMLElement | SVGElement,
  anchor: Element | AnchorRef | AnchorFactory | ReactElement | null,
  anchorOrigin?: Position,
  transformOrigin?: Position,
  pointerEvents?: boolean,
  onBlur?: () => void,
  isVisible?: boolean,
  margins?: { vertical?: number, horizontal?: number },
  disableReposition?: boolean,
  externalStyles?: React.CSSProperties | ((popoverState: PopoverState) => React.CSSProperties),
}

/*
 * Function whose job is to handle any one of the supported anchor types and return
 * a React RefObject that points to the underlying DOM element used for positioning
 * of the popover content as well as an optional factory function if anchor props is an `AnchorFactory`
 */
function useRefAndAnchorElement(anchor: AnchorRef | AnchorFactory | ReactElement | Element | null): [AnchorRef, AnchorFactory | null] {
  const ref = useRef<Element | null>(null)

  // If anchor source is a function, call that function with popup state
  // and clone resulting element to capture ref
  if (anchor instanceof Function) {
    const useAnchorFactory = (popupState: PopoverState) => {
      let element = anchor(popupState)
      if (React.isValidElement(element)) {
        element = React.cloneElement(element, { ref })
      }
      return element
    }
    return [ref, useAnchorFactory]

  // If anchor react element simply clone that element to capture ref
  } else if (React.isValidElement(anchor)) {
    const element = React.cloneElement(anchor, { ref })
    return [ref, () => element]

  // If anchor source is an DOM element, manually assign the element to the
  // 'current' property of the ref
  } else if (anchor instanceof Element || anchor === null) {
    ref.current = anchor
    return [ref, null]

  // Finally, if anchor is a React RefObject, simply return that ref object instead
  } else {
    return [anchor, null]
  }
}

const multipliers = { top: 0, left: 0, center: 0.5, right: 1, bottom: 1 }
const BOUNDARY_PADDING = 15

interface AlingmentStateOutput {
  transform?: string,
  adjustedPopupState: PopupPositionState,
}

function calculateAlignmentState(anchorRef: Element | null, contentSize: ContentSize | undefined, popupState: PopupPositionState, boundaries: BoundingBox, margins: { vertical?: number, horizontal?: number }, force: boolean = false): AlingmentStateOutput {
  if (anchorRef == null || contentSize === undefined) {
    return { transform: 'translate3d(0px, 0px, 0px)', adjustedPopupState: popupState }
  }

  const { anchorOrigin, transformOrigin } = popupState
  const anchorRect = anchorRef.getBoundingClientRect()
  const { scrollX, scrollY } = window

  const horizontalMargin = -1 * (multipliers[anchorOrigin.horizontal] - 0.5) * 2 * (margins.horizontal ?? 0)
  const verticalMargin = (multipliers[anchorOrigin.vertical] - 0.5) * 2 * (margins.vertical ?? 0)

  const leftValue = (anchorRect.left + multipliers[anchorOrigin.horizontal] * anchorRect.width) + scrollX + horizontalMargin
  const topValue = (anchorRect.top + multipliers[anchorOrigin.vertical] * anchorRect.height) + scrollY + verticalMargin
  const translateX = -1 * multipliers[transformOrigin.horizontal]
  const translateY = -1 * multipliers[transformOrigin.vertical]

  const clearance = {
    top: (anchorRect.top + scrollY) - boundaries.top - Math.abs(verticalMargin),
    bottom: (boundaries.top + boundaries.height) - (anchorRect.bottom + scrollY) - Math.abs(verticalMargin),
    left: (anchorRect.left + scrollX) - boundaries.left - Math.abs(horizontalMargin),
    right: (boundaries.left + boundaries.width) - (anchorRect.right + scrollX) - Math.abs(horizontalMargin),
  }

  if (!force) {
    let outputState = popupState
    const computedContentLeft = leftValue + contentSize.width * translateX
    const computedContentRight = computedContentLeft + contentSize.width
    const computedContentTop = topValue + contentSize.height * translateY
    const computedContentBottom = computedContentTop + contentSize.height

    if (computedContentLeft < boundaries.left && clearance.left > clearance.right) {
      outputState = {
        anchorOrigin: { ...outputState.anchorOrigin, horizontal: 'left'  },
        transformOrigin: { ...outputState.transformOrigin, horizontal: 'right' },
      }
    } else if (computedContentRight > boundaries.left + boundaries.width && clearance.right > clearance.left) {
      outputState = {
        anchorOrigin: { ...outputState.anchorOrigin, horizontal: 'right'  },
        transformOrigin: { ...outputState.transformOrigin, horizontal: 'left' },
      }
    }
    if (computedContentTop < boundaries.top && clearance.bottom > clearance.top) {
      outputState = {
        anchorOrigin: { ...outputState.anchorOrigin, vertical: 'bottom'  },
        transformOrigin: { ...outputState.transformOrigin, vertical: 'top' },
      }
    } else if (computedContentBottom > boundaries.top + boundaries.height && clearance.top > clearance.bottom) {
      outputState = {
        anchorOrigin: { ...outputState.anchorOrigin, vertical: 'top'  },
        transformOrigin: { ...outputState.transformOrigin, vertical: 'bottom' },
      }
    }
    if (outputState !== popupState) {
      return calculateAlignmentState(anchorRef, contentSize, outputState, boundaries, margins, true)
    }
  }

  return {
    transform: `translate3d(
      calc(${leftValue}px + ${translateX * 100}%),
      calc(${topValue}px + ${translateY * 100}%),
      0
    )`,
    adjustedPopupState: popupState,
  }
}

const DEFAULT_MARGINS = { horizontal: 0, vertical: 0 }
const defaultAnchorOrigin: Position = { vertical: 'top', horizontal: 'center' }
const defaultTransformOrigin: Position = { vertical: 'bottom', horizontal: 'center' }

export default function Popover(props: PopoverProps) {
  const { anchor, pointerEvents = true, anchorOrigin = defaultAnchorOrigin, transformOrigin = defaultTransformOrigin, onBlur, isVisible = true, margins = DEFAULT_MARGINS, disableReposition = false } = props
  const popoverId = useMemo(() => v4(), [])
  const [triggerUpdate] = useUpdateTrigger()
  const contentRef = useRef<HTMLDivElement>(null)
  const [contentSize, setContentSize] = useState<ContentSize>()
  const boundaries = getBoundaries(props.boundaryElement)
  const [anchorRef, anchorFactory] = useRefAndAnchorElement(anchor)
  const lastRenderedPopupState = useRef<PopupPositionState>({ anchorOrigin, transformOrigin })
  const marginsStable = useMemo(() => ({ vertical: margins.vertical, horizontal: margins.horizontal }), [margins.vertical, margins.horizontal])
  const anchorEl = anchorRef.current

  useLayoutEffect(() => {
    if (isVisible && contentRef.current) {
      contentRef.current.scrollTop = 1
      contentRef.current.scrollTop = 0
    }
  }, [isVisible])

  /**
   * Handles onBlur handling by adding click event listener
   * on the body
   */
  useEffect(() => {
    if (onBlur === undefined || !isVisible) { return }

    const handleOnClick = (event: MouseEvent) => {
      const target = event.target
      if (contentRef.current != null && target instanceof Element) {
        if (!contentRef.current.contains(target) && !anchorRef.current?.contains(target)) {
          onBlur()
        }
      }
    }

    document.addEventListener('click', handleOnClick)
    return () => {
      document.removeEventListener('click', handleOnClick)
    }
  }, [onBlur, isVisible, anchorRef])

  useLayoutEffect(() => {
    const contentEl = contentRef.current
    if (contentEl !== null && isVisible) {
      const currSize = {
        width: contentEl.clientWidth,
        height: contentEl.clientHeight,
      }
      setContentSize(prevSize => {
        return deepEquals(currSize, prevSize) ? prevSize : currSize
      })
    }
  }, [isVisible])

  const desiredPopoverState = useMemo(() => ({
    transformOrigin: { horizontal: transformOrigin.horizontal, vertical: transformOrigin.vertical },
    anchorOrigin: { horizontal: anchorOrigin.horizontal, vertical: anchorOrigin.vertical },
  }), [transformOrigin.horizontal, transformOrigin.vertical, anchorOrigin.vertical, anchorOrigin.horizontal])

  useLayoutEffect(() => {
    if (anchorEl === null || !isVisible || contentSize === undefined) { return }
    let hasFixedPositionParent = false

    const syncDropdownPosition = function (this: Element | Window) {
      const boundaries = getBoundaries(props.boundaryElement)
      const { transform, adjustedPopupState } = calculateAlignmentState(anchorEl, contentSize, desiredPopoverState, boundaries, marginsStable, disableReposition)

      if (!deepEquals(lastRenderedPopupState.current, adjustedPopupState)) {
        return triggerUpdate()
      }

      if (this !== window || hasFixedPositionParent) {
        if (styles !== undefined && contentRef.current != null) {
          transform && (contentRef.current.style.transform = transform)
        }
      }
    }

    const scrollableParents: HTMLElement[] = []
    let parent: Node & ParentNode | null = anchorEl
    while ((parent = parent.parentNode) && parent !== document.body) {
      if (parent instanceof HTMLElement) {
        if (isScrollable(parent)) {
          parent.addEventListener('scroll', syncDropdownPosition)
          scrollableParents.push(parent)
        }
        if (getComputedStyle(parent).position === 'fixed') {
          hasFixedPositionParent = true
        }
      }
    }

    // Create an observer instance linked to the callback function
    const observer = new MutationObserver((mutationsList) => {
      triggerUpdate()
    })

    // Start observing the target node for configured mutations
    observer.observe(anchorEl, { attributes: true })

    window.addEventListener('scroll', syncDropdownPosition)

    return () => {
      observer.disconnect()
      window.removeEventListener('scroll', syncDropdownPosition)
      scrollableParents.forEach(parent => parent.removeEventListener('scroll', syncDropdownPosition))
    }
  }, [isVisible, contentSize, props.boundaryElement, anchorEl, triggerUpdate, desiredPopoverState, marginsStable, disableReposition])

  const { transform, adjustedPopupState } = calculateAlignmentState(anchorEl, contentSize, desiredPopoverState, boundaries, marginsStable, disableReposition)
  lastRenderedPopupState.current = adjustedPopupState

  const externalStyles = props.externalStyles && props.externalStyles instanceof Function ? props.externalStyles(adjustedPopupState) : props.externalStyles
  const containerStyles: React.CSSProperties = {
    transform,
    opacity: contentSize === undefined ? 0 : 1,
  }

  function handleContainerClick(e: React.MouseEvent) {
    e.stopPropagation()
    e.nativeEvent.stopImmediatePropagation()
    // triggerChildBlur()
  }

  return (
    <>
      {anchorFactory?.(adjustedPopupState)}
      {isVisible && (
        <Layer
          className={classNames(styles.layerAbsolute, pointerEvents === false && styles.noPointerEvents)}
          layerId={`popover-${popoverId}`}
        >
          <div style={{ ...containerStyles, ...externalStyles }} ref={contentRef} onClick={handleContainerClick}>
            {props.children instanceof Function ? props.children(adjustedPopupState) : props.children}
          </div>
        </Layer>
      )}
    </>
  )
}

const deepEquals = (a: any, b: any) => {
  return JSON.stringify(a) === JSON.stringify(b)
}

const isScrollable = (element: HTMLElement) => (
  ['scroll', 'auto'].includes(getComputedStyle(element).overflowX) ||
  ['scroll', 'auto'].includes(getComputedStyle(element).overflowY)
)

type BoundingBox = { top: number, left: number, width: number, height: number }

function getBoundaries(boundaryElement?: HTMLElement | SVGElement): BoundingBox {
  const { scrollX, scrollY } = window

  if (boundaryElement != null) {
    const boundingRect = boundaryElement.getBoundingClientRect()
    return {
      top: boundingRect.top - scrollY + BOUNDARY_PADDING,
      left: boundingRect.left - scrollX + BOUNDARY_PADDING,
      width: boundingRect.width - (BOUNDARY_PADDING * 2),
      height: boundingRect.height - (BOUNDARY_PADDING * 2),
    }
  }

  return {
    top: scrollY + BOUNDARY_PADDING,
    left: scrollX + BOUNDARY_PADDING,
    width: window.innerWidth - (BOUNDARY_PADDING * 2),
    height: window.innerHeight - (BOUNDARY_PADDING * 2),
  }
}

interface LayerProps {
  layerId: string,
  className?: string,
  onClick?: () => void,
}

const initLayerElement = (layerId: string, className: string = '') => {
  let targetLayerEl = document.getElementById(layerId)
  if (targetLayerEl == null) {
    targetLayerEl = document.createElement('div')
    document.body.appendChild(targetLayerEl)
  }

  targetLayerEl.id = layerId
  targetLayerEl.className = className

  return targetLayerEl
}

export function Layer ({ children, layerId, className, onClick }: PropsWithChildren<LayerProps>) {
  const [layerElement, setLayerElement] = useState<HTMLElement>(() => initLayerElement(layerId, className))
  const onClickRef = useRef<(() => void) | undefined>(onClick)
  onClickRef.current = onClick

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (e.currentTarget instanceof HTMLElement && e.target === layerElement) {
        onClickRef.current?.()
      }
    }
    layerElement.addEventListener('click', handleClick)
    return () => {
      layerElement.removeEventListener('click', handleClick)
    }
  }, [layerElement])

  useEffect(() => {
    const newLayerEl = initLayerElement(layerId, className)
    setLayerElement(newLayerEl)

    return () => {
      const nodeToRemove = document.getElementById(layerId)
      nodeToRemove !== null && document.body.removeChild(nodeToRemove)
    }
  }, [layerId, className])

  return ReactDOM.createPortal(
    children,
    layerElement,
    layerId,
  )
}
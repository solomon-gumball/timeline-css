import { MutableRefObject, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { scaleLinear } from 'd3-scale'
import { range } from 'lodash'
import styles from './css/control-panel.scss'
import { css, useWindowSize } from './util'
import drag from './util/drag'
import { useKeysPressed } from './util/keys'
import { StoreDispatch, StyleRule, ViewState } from './Editor'
import GripHandleIcon from './icons/grip.svg'
import { AnimationControls, PlayState } from './animationControls'
import Popover from './Popover'
import AnimationSegment from './AnimationSegment'

export const MS_PER_PIXEL = 0.5
export const ANIM_ITEM_WIDTH = 125
const TICK_SIZE_MS_MODULO = 20
const MINOR_TICK_RATIO = 2

interface Props extends ViewState {
  dispatch: StoreDispatch,
  onResize: (height: number) => void,
  controls: MutableRefObject<AnimationControls>,
  editorsAreFocused: () => boolean,
}

export enum RowSize {
  Large = 300,
  Medium = 100,
  Small = 40
}

const MAX_TICK_PIXEL_WIDTH = 100
const MAX_MS_PER_PIXEL = 20
const MIN_MS_PER_PIXEL = 0.2
const MIN_DURATION_WIDTH = 50

function calcMsPerPixel(styleRules: StyleRule[], totalLengthMs: number, windowWidth: number) {
  const minDuration = styleRules.reduce((min, rule) => Math.min(rule.duration, min), Infinity)
  let msPerPixel = totalLengthMs / (windowWidth - ANIM_ITEM_WIDTH)
  if (minDuration !== Infinity) {
    msPerPixel = Math.min(msPerPixel, (minDuration / MIN_DURATION_WIDTH))
  }
  return Math.max(MIN_MS_PER_PIXEL, Math.min(MAX_MS_PER_PIXEL, msPerPixel))
}

const rowSizeDisplayValue = (rowSize: RowSize) => {
  switch (rowSize) {
    case RowSize.Small: return 'small'
    case RowSize.Medium: return 'medium'
    case RowSize.Large: return 'large'
  }
}

export default function ControlPanel({ dispatch, onResize, totalLengthMs, styleRules, controls, editorsAreFocused, selectedRuleIds }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [{ width: windowWidth }] = useWindowSize()
  const [rowSize, setRowSize] = useState(RowSize.Medium)
  const graphWidth = windowWidth - ANIM_ITEM_WIDTH
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const defaultMsPerPixel = useMemo(() => calcMsPerPixel(styleRules, totalLengthMs, windowWidth), [totalLengthMs, windowWidth])
  const [msPerPixel = defaultMsPerPixel, setMsPerPixel] = useState<number>()
  const totalDurationWidth = (totalLengthMs / msPerPixel)
  const timelineWidth = Math.max(graphWidth, totalDurationWidth) + 200
  const timelineDuration = timelineWidth * msPerPixel
  const idealNumTicks = Math.ceil(timelineWidth / MAX_TICK_PIXEL_WIDTH)
  const idealTickSizeMs = (timelineWidth / idealNumTicks) * msPerPixel
  const tickSize = idealTickSizeMs - (idealTickSizeMs % TICK_SIZE_MS_MODULO) || TICK_SIZE_MS_MODULO
  const minorTickSize = tickSize / MINOR_TICK_RATIO
  const scaleX = useMemo(() => scaleLinear().domain([0, totalLengthMs]).range([0, totalDurationWidth]), [totalLengthMs, totalDurationWidth])
  const panelContainerRef = useRef<HTMLDivElement>(null)
  const [gridSnapSize = 20, setGridSnapSize] = useState<number>()
  const timelineSVGRef = useRef<SVGSVGElement>(null)
  const scrollToTimeRef = useRef<number>()
  const zoomHeadLabelRef = useRef<HTMLDivElement>(null)
  const zoomHeadEl = useRef<HTMLDivElement>(null)
  const selectionBoxCanvasRef = useRef<HTMLCanvasElement>(null)
  const playState = controls.current.getState()
  const keysPressed = useKeysPressed()
  const scaleY = useMemo(() => (i: number) => 20 + rowSize * i, [rowSize])

  useLayoutEffect(() => {
    if (scrollToTimeRef.current == null || panelContainerRef.current == null) { return }
    scrollToTimeRef.current = undefined
    const playState = controls.current.getState()
    panelContainerRef.current.scrollLeft = (
      scaleX(playState.offsetTime ?? 0) - ((panelContainerRef.current.clientWidth - ANIM_ITEM_WIDTH) * 0.5)
    )
  }, [scaleX, scrollToTimeRef.current])

  useEffect(() => {
    function handleKeypress(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setMsPerPixel(undefined)
      }
    }
    document.addEventListener('keydown', handleKeypress)
    return () => document.removeEventListener('keydown', handleKeypress)
  }, [])

  useEffect(() => {
    function handleKeypress(e: KeyboardEvent) {
      if (editorsAreFocused()) { return }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        scrollToTimeRef.current = 1
        setMsPerPixel(msPerPixel * 1.25)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        scrollToTimeRef.current = 1
        setMsPerPixel(msPerPixel * 0.8)
      }
    }

    document.addEventListener('keydown', handleKeypress)
    return () => {
      document.removeEventListener('keydown', handleKeypress)
    }
  }, [editorsAreFocused, msPerPixel])

  useLayoutEffect(() => {
    function updatePlayState({ status, offsetTime }: PlayState) {
      if (zoomHeadEl.current == null || zoomHeadLabelRef.current == null) { return }
      if (status === 'running' || offsetTime > timelineDuration) {
        zoomHeadEl.current.style.display = 'none'
        zoomHeadLabelRef.current.style.display = 'none'
      } else {
        zoomHeadEl.current.style.display = ''
        zoomHeadLabelRef.current.style.display = ''
        zoomHeadLabelRef.current.innerText = `${Math.round(offsetTime)}ms`
        zoomHeadEl.current.style.transform = `translate3d(${ANIM_ITEM_WIDTH + scaleX(offsetTime)}px, 0px, 0px)`
      }
    }
    updatePlayState(playState)
    return controls.current.onChange(updatePlayState)
  }, [controls.current, scaleX, playState, timelineDuration])

  const onResizeDrag = useMemo(() => drag(() => {
    return {
      onDrag: ({ delta }) => {
        onResize(delta[1])
      },
    }
  }, 'ns-resize'), [onResize])

  const onDragSelect = useMemo(() => drag((element, elementPos, initialPosition) => {
    const context2d = selectionBoxCanvasRef.current?.getContext('2d')
    if (context2d == null) { return }
    context2d.fillStyle = 'rgba(255, 255, 255, 0.1)'
    context2d.strokeStyle = 'rgba(255, 255, 255, 0.5)'
    // let selectionBox = [initialPosition[0], initialPosition[1], initialPosition[0], initialPosition[1]]
    const size = [0, 0] as [number, number]
    const anchorMs = scaleX.invert(initialPosition[0] - ANIM_ITEM_WIDTH)

    function intersectRect(
      r1x1: number, r1y1: number, r1x2: number, r1y2: number,
      r2x1: number, r2y1: number, r2x2: number, r2y2: number) {
      return !(
        r2x1 > r1x2 ||
        r2x2 < r1x1 ||
        r2y1 > r1y2 ||
        r2y2 < r1y1
      )
    }

    return {
      onDrag: ({ position, delta }) => {
        const isShiftDrag = keysPressed.has('Shift')
        context2d.clearRect(0, 0, context2d.canvas.width, context2d.canvas.height)
        size[0] -= delta[0]
        size[1] -= delta[1]

        context2d.beginPath()
        context2d.rect(initialPosition[0], initialPosition[1], ...size)
        context2d.fill()
        context2d.stroke()
        context2d.closePath()

        const headMs = scaleX.invert((initialPosition[0] - ANIM_ITEM_WIDTH) + size[0])
        // anchorMs, initialPosition[1], headMs, initialPosition[1] + size[1],
        const [aX, aY, bX, bY] = [anchorMs, initialPosition[1], headMs, initialPosition[1] + size[1]]
        const [x1, y1, x2, y2] = [Math.min(aX, bX), Math.min(aY, bY), Math.max(aX, bX), Math.max(aY, bY)]
        const selected = styleRules.filter((rule, i) => {
          const ruleStart = rule.delay
          const ruleEnd = rule.delay + rule.duration

          const didIntersect = intersectRect(
            x1, y1, x2, y2,
            ruleStart, scaleY(i), ruleEnd, scaleY(i + 1),
          )

          if (isShiftDrag) {
            if (didIntersect) {
              // Double negative case
              if (selectedRuleIds.has(rule.id)) {
                return false
              }
              return true
            } else {
              return selectedRuleIds.has(rule.id)
            }
          } else {
            return didIntersect
          }
        })
        const selectedIds = selected.map(rule => rule.id)
        dispatch.toggleSelectRules(selectedIds)
      },
      onDragEnd: () => {
        context2d.clearRect(0, 0, context2d.canvas.width, context2d.canvas.height)
      },
    }
  }, 'default'), [scaleX, keysPressed, styleRules, dispatch, scaleY, selectedRuleIds])

  const onDragZoom = useMemo(() => drag((el, startPosition) => {
    const panelEl = panelContainerRef.current
    if (panelEl == null) { return }
    const startScrollOffset = panelEl.scrollLeft

    const dragStartTime = scaleX.invert(startPosition[0] - ANIM_ITEM_WIDTH + startScrollOffset)
    controls.current.pause(dragStartTime)
    return {
      onDrag: ({ delta, position }) => {
        const xTime = scaleX.invert(position[0] - ANIM_ITEM_WIDTH + startScrollOffset)
        controls.current.pause(xTime)
      },
    }
  }, 'grab'), [scaleX, controls])

  const tickEls = useMemo(() => {
    const nTicks = Math.floor(timelineDuration / tickSize)
    return range(nTicks)
      .map((_entry, i) => (
        <div
          key={`tick-${i}`}
          className={styles.tick}
          style={{ left: ANIM_ITEM_WIDTH + scaleX(i * tickSize) }}>
          {`${i * tickSize}ms`}
        </div>
      ))
  }, [scaleX, tickSize, timelineDuration])

  const patternEl = useMemo(() => (
    <pattern id="timeline-grid" x={ANIM_ITEM_WIDTH} width={scaleX(2 * tickSize)} height="100" patternUnits="userSpaceOnUse">
      {range(2 * MINOR_TICK_RATIO).map((_, index) => (
        <line key={`tick-line-${index}`} x1={scaleX(index * minorTickSize)} y1="0" x2={scaleX(index * minorTickSize)} y2="100" stroke="rgb(99, 99, 99)" opacity={0.3} />
      ))}
      {range(MINOR_TICK_RATIO).map((_, index) => (
        <rect key={`tick-rect-${index}`} x={scaleX(index * 2 * minorTickSize)} y={0} width={scaleX(index * 2 * minorTickSize)} height="100px" fill="rgb(0, 0, 0)" opacity={0.1} />
      ))}
    </pattern>
  ), [minorTickSize, scaleX, tickSize])

  const chartHeight = 20 + styleRules.length * rowSize

  return (
    <div className={css(styles.container)} ref={containerRef}>
      <div className={css(styles.panelButtonsContainer)}>
        <select
          name="Zoom"
          className={css(styles.panelButtonSelect)}
          onChange={() => {}}
          value={0}
        >
          <option disabled value={0} hidden>Zoom: {((graphWidth * msPerPixel) / 1000).toFixed(2)}s</option>
          <option value={msPerPixel}>{((graphWidth * msPerPixel) / 1000).toFixed(2)}s</option>
        </select>
        <select
          name="Row Size"
          value={0}
          onChange={e => setRowSize(parseInt(e.target.value))}
          className={css(styles.panelButtonSelect)}
        >
          <option disabled value={0}>Row: {rowSizeDisplayValue(rowSize)}</option>
          <option value={RowSize.Small}>small</option>
          <option value={RowSize.Medium}>medium</option>
          <option value={RowSize.Large}>large</option>
        </select>
        <select
          name="Snap"
          value={0}
          onChange={e => setGridSnapSize(parseInt(e.target.value))}
          className={css(styles.panelButtonSelect)}
        >
          <option disabled value={0}>Snap: {gridSnapSize.toFixed(0)}ms</option>
          <option value={5}>5ms</option>
          <option value={10}>10ms</option>
          <option value={20}>20ms</option>
          <option value={25}>25ms</option>
          <option value={50}>50ms</option>
        </select>
      </div>
      <div className={css(styles.dragHandle)} onMouseDown={onResizeDrag}>
        <GripHandleIcon className={css(styles.gripHandleIcon)}/>
      </div>
      <div ref={panelContainerRef} className={styles.panelContainer}>
        <canvas
          ref={selectionBoxCanvasRef}
          width={timelineWidth + ANIM_ITEM_WIDTH}
          height={chartHeight}
          style={{ pointerEvents: 'none', zIndex: 1, width: timelineWidth + ANIM_ITEM_WIDTH, height: chartHeight, position: 'absolute' }}
        />
        <svg
          ref={timelineSVGRef}
          onClick={() => dispatch.toggleSelectRules([])}
          className={styles.timelineBackgroundSVG}
          onMouseDown={onDragSelect}
          style={{ width: timelineWidth + ANIM_ITEM_WIDTH, minHeight: '100%', height: chartHeight }}
        >
          <pattern id="curve-fill"  style={{ transform: 'rotateZ(-45deg)' }} x={0} width={4} height={4} patternUnits="userSpaceOnUse">
            <line x1="0" y1="2" x2="4" y2="2" stroke="white" opacity={0.3} />
          </pattern>
          {patternEl}
          <rect x={ANIM_ITEM_WIDTH} width={timelineWidth} height="100%" fill="url(#timeline-grid)" />
          {styleRules.map((rule, i) => (
            <g
              key={rule.id}
              style={{ transform: `translate3d(${ANIM_ITEM_WIDTH}px, ${scaleY(i)}px, 0px)` }}
            >
              <AnimationSegment
                dispatch={dispatch}
                selectedRuleIds={selectedRuleIds}
                tickSize={gridSnapSize}
                scaleX={scaleX}
                timelineWidth={timelineWidth}
                key={rule.id}
                rule={rule}
                rowSize={rowSize}
              />
            </g>
          ))}
        </svg>
        <div className={styles.tickContainer} style={{ width: timelineWidth + ANIM_ITEM_WIDTH }} onMouseDown={onDragZoom}>
          <div ref={zoomHeadEl} className={styles.zoomHead} style={{ height: chartHeight}} />
          {tickEls}
        </div>
        <Popover
          anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
          transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}
          margins={{ vertical: -1 }}
          anchor={zoomHeadEl}
          disableReposition
        >
          <div ref={zoomHeadLabelRef} className={styles.zoomHeadPopover} onMouseDown={onDragZoom}></div>
        </Popover>
        <div className={styles.propertyRowsOverlay}>
          {styleRules.map(rule => (
            <RowHeader
              key={rule.id}
              rule={rule}
              rowSize={rowSize}
              dispatch={dispatch}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function RowHeader({ rule, rowSize, dispatch }: { rule: StyleRule, rowSize: RowSize, dispatch: StoreDispatch }) {
  return (
    <div className={styles.rowItemContainer} style={{ height: rowSize }} onMouseUp={() => dispatch.removeHighlight()}>
      <div className={styles.backgroundElement} style={{ backgroundColor: rule.color }} />
      <div className={styles.rowHeader}>
        <button className={css(styles.headerRowButton)} style={{ fontWeight: 'bold', color: rule.color, filter: 'brightness(0.2)' }} onMouseDown={() => dispatch.highlightRule(rule)}>{rule.selector}</button>
        <button className={css(styles.headerRowButton)} onMouseDown={e => {
          dispatch.highlightAnimationSource(rule)
        }} style={{ display: 'block' }}>{rule.animationName}</button>
      </div>
      <div className={styles.rowHeaderBorder} style={{ height: 1, backgroundColor: 'black', opacity: 0.3 }}></div>
    </div>
  )
}

// function cubicBezierPathAndPoints() {
//   let d = `M${scaleCurveX(0)},${rowSize}`
//   d += `C${scaleCurveX(rule.curve[0][0])},${rowSize - (height * rule.curve[0][1])},${scaleCurveX(rule.curve[1][0])},${rowSize - (height * rule.curve[1][1])},${scaleCurveX(1)},${HEADER_HEIGHT}`
// }
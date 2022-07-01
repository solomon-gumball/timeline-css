import { path } from 'd3-path'
import { ScaleLinear, scaleLinear } from 'd3-scale'
import { clamp, cloneDeep, range } from 'lodash'
import React, { useState, useMemo, useRef, useEffect } from 'react'
import { RowSize } from './ControlPanel'
import { StyleRule, TimelineKeyframe } from './core/parseStylesheet'
import { css } from './util'
import drag from './util/drag'
import { useKeysPressed } from './util/keys'
import styles from './css/control-panel.scss'
import { StoreDispatch } from './core/editorControls'

export interface GraphLineProps {
  scaleX: ScaleLinear<number, number>,
  rule: StyleRule,
  timelineWidth: number,
  tickSize: number,
  dispatch: StoreDispatch,
  rowSize: RowSize,
  selectedRuleIds: Set<string>,
}

const HEADER_HEIGHT = 20

export default function AnimationSegment({ tickSize, dispatch, rule, timelineWidth, scaleX, rowSize, selectedRuleIds }: GraphLineProps) {
  const width = scaleX(rule.duration)
  const height = rowSize - HEADER_HEIGHT
  const hasValidKeyframes = !!rule.keyframes
  const rowColor = hasValidKeyframes ? rule.color : 'gray'
  const keysPressed = useKeysPressed()
  const scaleCurveX = useMemo(() => scaleLinear()
    .domain([0, 1])
    .range(rule.direction !== 'reverse' ? [0, width] : [width, 0])
  , [rule.direction, width])
  const scaleCurveY = scaleLinear().domain([0, 1]).range([0, height - HEADER_HEIGHT])

  const onDragMove = useMemo(() => drag<SVGGElement>(() => {
    const originalDelay = rule.delay
    let currDelay = originalDelay
    dispatch.highlightRule(rule)
    return {
      onDragStart: () => {
        if (keysPressed.has('Shift')) {
          if (!selectedRuleIds.has(rule.id)) {
            dispatch.toggleSelectRules([...selectedRuleIds.values(), rule.id])
          }
        } else {
          if (!selectedRuleIds.has(rule.id)) {
            dispatch.toggleSelectRules([rule.id])
          } else {
            dispatch.toggleSelectRules([...selectedRuleIds.values(), rule.id])
          }
        }
      },
      onDrag: ({ position }) => {
        const newDelay = Math.round((originalDelay + scaleX.invert(position[0])) / tickSize) * tickSize
        if (newDelay !== currDelay) {
          dispatch.onChangeDelay(rule.id, newDelay)
          currDelay = newDelay
        }
      },
      onDragEnd: () => {
        dispatch.removeHighlight()
      },
    }
  }, 'grabbing'), [dispatch, keysPressed, rule, scaleX, selectedRuleIds, tickSize])

  // const onMoveStartTime = useMemo(() => drag<SVGGElement>(() => {
  //   const originalDelay = rule.delay
  //   let currDelay = originalDelay
  //   dispatch.highlightRule(rule)
  //   return {
  //     onDrag: ({ position }) => {
  //       const newDelay = Math.round((originalDelay + scaleX.invert(position[0])) / tickSize) * tickSize
  //       if (newDelay !== currDelay) {
  //         dispatch.onChangeDelay(rule, newDelay)
  //         currDelay = newDelay
  //       }
  //     },
  //     onDragEnd: () => {
  //       dispatch.removeHighlight()
  //     },
  //   }
  // }, 'grabbing'), [dispatch, rule, scaleX, tickSize])
  const isSelected = selectedRuleIds.has(rule.id)
  const isUnfocused = selectedRuleIds.size > 0 && !isSelected
  function onClickHeader(e: React.MouseEvent<SVGRectElement>) {
    e.stopPropagation()
    // e.nativeEvent

    if (keysPressed.has('Shift')) {
      if (selectedRuleIds.has(rule.id)) {
        dispatch.toggleSelectRules([...selectedRuleIds.values()].filter(existingId => existingId !== rule.id))
      } else {
        dispatch.toggleSelectRules([...selectedRuleIds.values(), rule.id])
      }
    } else {
      dispatch.toggleSelectRules([rule.id])
    }
  }

  const onDragResize = useMemo(() => drag<SVGGElement>(() => {
    const originalDuration = rule.duration
    let currDuration = originalDuration
    dispatch.highlightRule(rule)
    return {
      onDragStart: () => {
        if (keysPressed.has('Shift')) {
          if (!selectedRuleIds.has(rule.id)) {
            dispatch.toggleSelectRules([...selectedRuleIds.values(), rule.id])
          }
        } else {
          if (!selectedRuleIds.has(rule.id)) {
            dispatch.toggleSelectRules([rule.id])
          } else {
            dispatch.toggleSelectRules([...selectedRuleIds.values(), rule.id])
          }
        }
      },
      onDrag: ({ position }) => {
        const newDuration = Math.round((originalDuration + scaleX.invert(position[0])) / tickSize) * tickSize
        if (newDuration !== currDuration) {
          dispatch.onChangeDuration(rule.id, newDuration)
          currDuration = newDuration
        }
      },
      onDragEnd: () => {
        dispatch.removeHighlight()
      },
    }
  }, 'col-resize'), [rule, dispatch, keysPressed, selectedRuleIds, scaleX, tickSize])

  const [d, dFill, keyframeCoordinates] = useMemo(() => {
    const line = path()
    const frames = rule.keyframes.slice()

    if (frames[0]?.progress !== 0) { frames.unshift({ progress: 0, curve: rule.curve, frame: {} }) }
    if (frames[frames.length - 1]?.progress !== 1) { frames.push({ progress: 1, curve: rule.curve, frame: {} }) }
    const points = frames.map(frame => [scaleCurveX(frame.progress),  HEADER_HEIGHT + (height * (1 - frame.progress))] as [number, number])
    const keyframeCoordinates: {
      start: readonly [number, number],
      cp1?: readonly [number, number],
      cp2?: readonly [number, number],
      end: readonly [number, number],
      path: string,
    }[] = []
    points.forEach((point, i, points) => {
      const nextPoint = points[i + 1]
      if (nextPoint == null) { return }
      if (i === 0) { line.moveTo(point[0], point[1]) }
      const delta = [nextPoint[0] - point[0], nextPoint[1] - point[1]]
      const curve = frames[i].curve
      if (curve.type === 'curve') {
        const cp1 = [
          point[0] + delta[0] * curve.cps[0][0],
          point[1] + delta[1] * curve.cps[0][1],
        ] as const
        const cp2 = [
          point[0] + delta[0] * curve.cps[1][0],
          point[1] + delta[1] * curve.cps[1][1],
        ] as const
        line.bezierCurveTo(
          ...cp1,
          ...cp2,
          nextPoint[0], nextPoint[1],
        )
        keyframeCoordinates.push({
          start: point,
          cp1, cp2,
          end: nextPoint,
          path: `M${point[0]},${height + HEADER_HEIGHT}L${point}M${point}C${cp1},${cp2},${nextPoint}L${nextPoint[0]},${height + HEADER_HEIGHT}L${point[0]},${height + HEADER_HEIGHT}Z`,
        })
      } else {
        if (curve.jumpTerm === 'jump-end') {
          line.lineTo(nextPoint[0], point[1])
          line.lineTo(nextPoint[0], nextPoint[1])
          keyframeCoordinates.push({
            start: point,
            end: nextPoint,
            path: `M${point[0]},${height + HEADER_HEIGHT}L${point}L${nextPoint[0]},${point[1]}L${nextPoint[0]},${height + HEADER_HEIGHT}L${point[0]},${height + HEADER_HEIGHT}Z`,
          })
        } else { // TODO other jumps, this is jump-start
          line.lineTo(point[0], nextPoint[1])
          line.lineTo(nextPoint[0], nextPoint[1])
          keyframeCoordinates.push({
            start: point,
            end: nextPoint,
            path: `M${point[0]},${height + HEADER_HEIGHT}L${point[0]},${nextPoint[1]}L${nextPoint}L${nextPoint[0]},${height + HEADER_HEIGHT}L${point[0]},${height + HEADER_HEIGHT}Z`,
          })
        }
      }
    })

    const d = line.toString()
    line.lineTo(scaleCurveX(1), rowSize) // !
    line.closePath()
    return [d, line.toString(), keyframeCoordinates]
  }, [height, rowSize, rule.curve, rule.keyframes, scaleCurveX])


  const [hoveredKeyframeIndex, setHoveredKeyframeIndex] = useState<number>(-1)
  const hoveredKeyframe = useMemo(() => rule.keyframes[hoveredKeyframeIndex], [hoveredKeyframeIndex, rule.keyframes])
  const hoveredKeyframeCoords = useMemo(() => keyframeCoordinates[hoveredKeyframeIndex], [hoveredKeyframeIndex, keyframeCoordinates])
  const isSelectedRef = useRef(false)
  isSelectedRef.current = isSelected
  useEffect(() => {
    if (!isSelected) {
      setHoveredKeyframeIndex(-1)
    }
  }, [isSelected])

  const isDragginRef = useRef(false)
  const onBackgroundHover = (e:  React.MouseEvent<SVGGElement>) => {
    const element = e.currentTarget
    const boundingBox = element.getBoundingClientRect()
    function handleMouseMove(e: MouseEvent) {

      const offset = clamp((e.clientX - boundingBox.left) / width, 0, 1)
      let keyframeIndex = -1
      let i = rule.keyframes.length
      while (i--) {
        if (rule.keyframes[i].progress < offset) {
          keyframeIndex = i
          break
        }
      }
      setHoveredKeyframeIndex(keyframeIndex)
    }
    element.addEventListener('mousemove', handleMouseMove)
    element.addEventListener('mouseleave', () => {
      element.removeEventListener('mousemove', handleMouseMove)
      if (!isDragginRef.current && !isSelectedRef.current) {
        setHoveredKeyframeIndex(-1)
      }
    }, { once: true })
  }

  const dragControlPoint = (keyframe: TimelineKeyframe, controlPointIndex: 0 | 1) => drag(() => {
    if (isUnfocused) { return }

    if (keyframe.curve.type === 'steps') { return }
    const curve = cloneDeep(keyframe.curve.cps)
    const selectedKeyframeIndex = rule.keyframes.indexOf(keyframe)
    if (selectedKeyframeIndex === -1) { return }
    const currPosition = curve[controlPointIndex].slice()
    const lastSetPosition = curve[controlPointIndex]
    isDragginRef.current = true
    const deltaY = (hoveredKeyframeCoords.start[1] - hoveredKeyframeCoords.end[1])
    const deltaX = (hoveredKeyframeCoords.end[0] - hoveredKeyframeCoords.start[0])

    function roundToNearest(val: number, roundTo: number) {
      return Math.round(val / roundTo) * roundTo
    }
    const incrementAmtX = clamp(roundToNearest(scaleCurveX.invert(2), 0.005), 0.005, 0.5)
    const incrementAmtY = clamp(roundToNearest(scaleCurveY.invert(2), 0.005), 0.005, 0.5)
    return {
      onDrag({ delta }) {
        currPosition[0] -= (delta[0] / deltaX)
        currPosition[1] += (delta[1] / deltaY)
        const roundedPosition = [
          +clamp(roundToNearest(currPosition[0], incrementAmtX), 0, 1).toFixed(3),
          +roundToNearest(currPosition[1], incrementAmtY).toFixed(3),
        ]
        if (lastSetPosition[0] === roundedPosition[0] && lastSetPosition[1] === roundedPosition[1]) {
          return
        }
        lastSetPosition[0] = roundedPosition[0]
        lastSetPosition[1] = roundedPosition[1]

        dispatch.updateEasing(rule.id, selectedKeyframeIndex, curve)
      },
      onDragEnd() {
        isDragginRef.current = false
      },
    }
  }, 'grabbing')
  const iterations = rule.iterationCount == null ? Math.min(Math.ceil(timelineWidth / width), 50) : rule.iterationCount

  return (
    <>
      <line stroke="#101010" x1={0} y1={rowSize} x2={timelineWidth} y2={rowSize}  />
      <g
        style={{ transform: `translate3d(${scaleX(rule.delay)}px, 0px, 0px)` }}
        opacity={isUnfocused ? 0.6 : 1}
        onMouseEnter={onBackgroundHover}
      >
        <rect
          strokeWidth={2}
          width={width}
          height={rowSize}
          strokeOpacity={isSelected ? 1 : 0}
          stroke={rule.color}
          fillOpacity={isSelected ? 0.5 : 0.4}
          fill={rowColor}
          rx={3} ry={3}
        />
        {range(iterations).map(i => (
          <g
            className={styles.iterationGroup}
            key={i}
            style={{
              transform: (i % 2 && rule.direction === 'alternate')
                ? `scaleX(-1.0) translate3d(-${(width * i) + (width)}px, 0px, 0px)`
                : `translate3d(${(width * i)}px, 0px, 0px)`,
            }}
          >
            <path d={dFill} fill="url(#curve-fill)" />
            <path d={d} stroke={rowColor} strokeDasharray={i === 0 ? '' : 10} strokeWidth={2} fill="none" />
          </g>
        ))}
        <rect x={width - 10} className={css(styles.resizeColRect)} height={rowSize} onMouseDown={onDragResize} />
        {/* <rect x={0} opacity={0} width={10} height={rowSize} strokeWidth={1} fill={'blue'} cursor="col-resize" onMouseDown={onMoveStartTime} /> */}
        {rule.keyframes?.map((kf, i) => <circle key={`keyframe-${i}`} fill={rowColor} stroke="none" r={4} cy={HEADER_HEIGHT + ((1 - kf.progress) * height)} cx={scaleCurveX(kf.progress)} />)}
        {/* Segment Header */}
        <g className={styles.headerGroup}>
          <rect
            x={0}
            width={width}
            height={HEADER_HEIGHT}
            strokeWidth={1}
            r={4}
            fill={rowColor}
            className={css(styles.graphSectionHeader, isSelected && styles.graphSectionHeaderSelected)}
            style={{ cursor: 'grab' }}
            onMouseDown={onDragMove}
            onClick={onClickHeader}
          />
          <text
            y={HEADER_HEIGHT - 6}
            x={5}
            textAnchor="top"
            width={width}
            style={{ clipPath: 'inset(0px 0px)', fontSize: 12, fontWeight: 'bold', pointerEvents: 'none', fill: rule.color }}
            className={styles.graphSectionHeaderLabel}
          >
            {rule.animationName}{hasValidKeyframes ? '' : ' (MISSING)'}
          </text>
        </g>
        {hoveredKeyframe && hoveredKeyframeCoords && !isUnfocused && (
          <>
            <path
              d={hoveredKeyframeCoords.path}
              fillOpacity={0.8}
              fill="url(#curve-fill)"
              pointerEvents="none"
              strokeWidth={5}
            />
            <line
              style={{ opacity: hoveredKeyframeIndex === 0 ? 0 : 1 }}
              x1={hoveredKeyframeCoords.start[0]}
              y1={HEADER_HEIGHT + height - 5}
              x2={hoveredKeyframeCoords.start[0]}
              y2={HEADER_HEIGHT + 5}
              strokeOpacity={0.4}
              stroke="white"
            />
            <line
              style={{ opacity: hoveredKeyframeIndex === rule.keyframes.length - 1 ? 0 : 1 }}
              x1={hoveredKeyframeCoords.end[0]}
              y1={HEADER_HEIGHT + height - 5}
              x2={hoveredKeyframeCoords.end[0]}
              y2={HEADER_HEIGHT + 5}
              strokeOpacity={0.4}
              stroke="white"
            />
            {hoveredKeyframeCoords?.cp1 && hoveredKeyframeCoords?.cp2 && (
              <>
                <line
                  x1={hoveredKeyframeCoords.start[0]}
                  y1={hoveredKeyframeCoords.start[1]}
                  x2={hoveredKeyframeCoords.cp1[0]}
                  y2={hoveredKeyframeCoords.cp1[1]}
                  stroke="white"
                  strokeWidth={2}
                />
                <circle
                  cx={hoveredKeyframeCoords.cp1[0]}
                  cy={hoveredKeyframeCoords.cp1[1]}
                  style={{ cursor: 'grab' }}
                  fill={rule.color}
                  r={5}
                  stroke="white"
                  onMouseDown={dragControlPoint(hoveredKeyframe, 0)}
                />
                <line
                  x1={hoveredKeyframeCoords.end[0]}
                  y1={hoveredKeyframeCoords.end[1]}
                  x2={hoveredKeyframeCoords.cp2[0]}
                  y2={hoveredKeyframeCoords.cp2[1]}
                  stroke="white"
                  strokeWidth={2}
                />
                <circle
                  fill={rule.color}
                  cx={hoveredKeyframeCoords.cp2[0]}
                  cy={hoveredKeyframeCoords.cp2[1]}
                  r={5}
                  style={{ cursor: 'grab' }}
                  stroke="white"
                  onMouseDown={dragControlPoint(hoveredKeyframe, 1)}
                />
              </>
            )}
          </>
        )}
      </g>
      {(rule.fillMode === 'backwards' || rule.fillMode === 'both') && (
        <line stroke={rule.color} strokeOpacity={0.3} strokeDasharray={2} strokeWidth={2} x1={0} y1={rowSize} x2={scaleX(rule.delay)} y2={rowSize}  />
      )}
      {(rule.fillMode === 'forwards' || rule.fillMode === 'both') && (
        <line stroke={rule.color} strokeOpacity={0.3} strokeDasharray={2} strokeWidth={2} x1={scaleX(rule.delay + rule.duration)} y1={HEADER_HEIGHT} x2="100%" y2={HEADER_HEIGHT}  />
      )}
    </>
  )
}
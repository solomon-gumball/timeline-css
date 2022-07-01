import { SyntaxNode } from '@lezer/common'
import { syntaxTree } from '@codemirror/language'
import { WidgetType, EditorView, ViewPlugin, DecorationSet, Decoration, ViewUpdate } from '@codemirror/view'
import { range } from 'lodash'
import { useRef, useState, useMemo, useEffect } from 'react'
import { Range } from '@codemirror/state'

import { createRoot } from 'react-dom/client'
import { parseCurve, NamedBezierCurves } from '../Editor'
import Popover from '../Popover'
import { classNames } from '../util'
import drag from '../util/drag'
import styles from '../css/code-editor.scss'
import sharedStyles from '../css/shared.scss'

const ButtonTemplate = (() => {
  const template = document.createElement('template')
  template.innerHTML = `
    <button class="${styles.bezierButton}">
      <div id="render-target" class="${styles.bezierRenderTarget}"></div>
      <svg style="position: absolute; left: 0px; top: 0px; pointer-events: none;" width="13px; overflow:hidden;" height="13px" viewBox="0, 0, 10, 10">
        <path x="0" y="0" d="M 0 9 C 3 1, 7, 9, 10, 1"  fill="none" stroke="hotpink" stroke-width="1.5px" fill="none"></path>
      </svg>
    </button>
  `.trim()
  return template.content
})()

class BezierCurveWidget extends WidgetType {
  controlPoints: ControlPoints
  renderTarget: HTMLDivElement | null = null
  node: SyntaxNode
  constructor(controlPoints: ControlPoints, node: SyntaxNode) {
    super()
    this.controlPoints = controlPoints
    this.node = node
  }

  eq(widget: BezierCurveWidget): boolean {
    return this.controlPoints.join('') === widget.controlPoints.join('')
  }

  toDOM(view: EditorView): HTMLElement {
    const button = ButtonTemplate.cloneNode(true).firstChild as HTMLButtonElement
    button.dataset.bezierWidget = 'true'
    const renderTarget = button.querySelector('#render-target') as HTMLDivElement
    this.renderTarget = renderTarget
    return button
  }

  ignoreEvent(event: Event): boolean {
    return false
  }
}

type ControlPoints = [[number, number], [number, number]]

function getBezierPathForControlPoints(cp: ControlPoints) {
  return `M 0 100 C ${cp[0][0] * 100},${(1 - cp[0][1]) * 100},${cp[1][0] * 100},${(1 - cp[1][1]) * 100},100,0`
}

const roundControlPoints = (num: number) => Math.round((num + Number.EPSILON) * 100) / 100
const clamp = (num: number, min: number, max: number) => Math.min(Math.max(num, min), max)

function BezierEditor({ controlPoints, onUpdate, onCancel }: { onCancel: () => void, controlPoints: ControlPoints, onUpdate: (cp: ControlPoints) => void }) {
  const anchorCircle1Ref = useRef<SVGCircleElement>(null)
  const anchorLine1Ref = useRef<SVGLineElement>(null)
  const anchorCircle2Ref = useRef<SVGCircleElement>(null)
  const anchorLine2Ref = useRef<SVGLineElement>(null)
  const pathRef = useRef<SVGPathElement>(null)
  const [cp, setCp] = useState(controlPoints.slice() as ControlPoints)
  const pathD = getBezierPathForControlPoints(cp)
  const cpRounded: ControlPoints = useMemo(() => [
    [roundControlPoints(cp[0][0]), roundControlPoints(cp[0][1])],
    [roundControlPoints(cp[1][0]), roundControlPoints(cp[1][1])]],
  [cp])
  useEffect(() => {
    onUpdate(cpRounded)
  }, [cpRounded, onUpdate])
  const dragHandler = useMemo(() => (pointId: 'one' | 'two') => drag((el, initial) => {
    const circleRef = pointId === 'one' ? anchorCircle1Ref : anchorCircle2Ref
    const lineRef = pointId === 'one' ? anchorLine1Ref : anchorLine2Ref
    function updatedControlPoints(position: [number, number]): ControlPoints {
      const newPointPosition: [number, number] = [
        clamp(position[0] / 100, 0, 1),
        1 - (position[1] / 100),
      ]
      return pointId === 'one'
        ? [newPointPosition, cp[1]]
        : [cp[0], newPointPosition]
    }

    return {
      onDrag: ({ position }) => {
        const newControlPoints = updatedControlPoints(position)
        circleRef.current?.setAttribute('transform', `translate(${clamp(position[0], 0, 100)}, ${position[1]})`)
        lineRef.current?.setAttribute('x2', `${clamp(position[0], 0, 100)}px`)
        lineRef.current?.setAttribute('y2', `${position[1]}px`)
        pathRef.current?.setAttribute('d', getBezierPathForControlPoints(newControlPoints))
      },
      onDragEnd: (position) => {
        setCp(updatedControlPoints(position))
      },
    }
  }, 'grab'), [cp])

  return (
    <div className={styles.bezierContainer}>
      <svg className={styles.bezierSVG} viewBox="0 0 100 100">
        <defs>
          <linearGradient id="fadeEdges" gradientTransform="rotate(90)" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#272a36" stopOpacity={0} />
            <stop offset="5%" stopColor="#272a36" stopOpacity={1} />
            <stop offset="95%" stopColor="#272a36" stopOpacity={1} />
            <stop offset="100%" stopColor="#272a36" stopOpacity={0} />
          </linearGradient>
        </defs>
        {range(11).map(i => <line stroke="url(#fadeEdges)" key={`vert-${i}`} x1={`${i * 10}%`} y1={0} x2={`${i * 10}%`} y2="100%"></line>)}
        {range(11).map(i => <line stroke="url(#fadeEdges)" key={`hoz-${i}`} x1={0} y1={`${i * 10}%`} x2="100%" y2={`${i * 10}%`}></line>)}
        <line x1="0" y1="100" x2="100" y2="0" stroke="#4a4a4a" fill="none" strokeWidth="1" ref={anchorLine1Ref} />
        <path ref={pathRef} x={0} fill="none" d={pathD} stroke="white" />
        <line x1="0" y1="100" x2={cp[0][0] * 100} y2={(1 - cp[0][1]) * 100} stroke="hotpink" fill="none" strokeWidth="1.5" ref={anchorLine1Ref} />
        <circle style={{ cursor: 'grab' }} transform={`translate(${cp[0][0] * 100}, ${(1 - cp[0][1]) * 100})`} fill="hotpink" r="2.5" stroke="none" ref={anchorCircle1Ref} onMouseDown={dragHandler('one')} />
        <line x1="100" y1="0" x2={cp[1][0] * 100} y2={(1 - cp[1][1]) * 100} stroke="hotpink" fill="none" strokeWidth="1.5" ref={anchorLine2Ref} />
        <circle style={{ cursor: 'grab' }} transform={`translate(${cp[1][0] * 100}, ${(1 - cp[1][1]) * 100})`} fill="hotpink" r="2.5" stroke="none" ref={anchorCircle2Ref} onMouseDown={dragHandler('two')} />
      </svg>
      <div className={sharedStyles.flexColumn} style={{ justifyContent: 'space-between' }}>
        <div className={sharedStyles.flexRow} style={{ marginBottom: 5 }}>
          <div className={styles.pointLabel}>x1</div>
          <div className={styles.pointLabel}>y1</div>
          <div className={styles.pointLabel}>x2</div>
          <div className={styles.pointLabel}>y2</div>
        </div>
        <div className={sharedStyles.flexRow}>
          <NumberInput min={0} max={1} className={styles.cpNumberInput} step={0.1} value={cpRounded[0][0]} onChange={v => setCp(curr => [[v, curr[0][1]], curr[1]])} />
          <div style={{ width: 5, flexShrink: 0 }} />
          <NumberInput className={styles.cpNumberInput} step={0.1} value={cpRounded[0][1]} onChange={v => setCp(curr => [[curr[0][0], v], curr[1]])} />
          <div style={{ width: 5, flexShrink: 0 }} />
          <NumberInput min={0} max={1} className={styles.cpNumberInput} step={0.1} value={cpRounded[1][0]} onChange={v => setCp(curr => [curr[0], [v, curr[1][1]]])} />
          <div style={{ width: 5, flexShrink: 0 }} />
          <NumberInput className={styles.cpNumberInput} step={0.1} value={cpRounded[1][1]} onChange={v => setCp(curr => [curr[0], [curr[1][0], v]])} />
        </div>
      </div>
    </div>
  )
}

function NumberInput({ min = -Infinity, max = Infinity, value, step, onChange, className }: { className?: string, min?: number, max?: number, value: number, step: number, onChange: (value: number) => void }) {
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const parsed = parseFloat(e.target.value)
    onChange(clamp(parsed || 0, min, max))
  }

  function onIncrement(increment: number) {
    onChange(clamp(value + increment, min, max))
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    let preventDefault = true
    switch (e.key) {
      case 'ArrowUp': {
        onIncrement(step)
        break
      }
      case 'ArrowDown': {
        onIncrement(-step)
        break
      }
      default: {
        preventDefault = false
      }
    }

    if (preventDefault) {
      e.nativeEvent.stopImmediatePropagation()
      e.stopPropagation()
      e.preventDefault()
    }
  }

  return (
    <div className={`${styles.numberInputContainer} ${className}`}>
      <input value={value} type="text" readOnly onKeyDown={onKeyDown} className={styles.numberInput} onChange={handleChange} />
      <button className={classNames(styles.numberInputIncrementButton)} onClick={() => onIncrement(step)} />
      <button className={classNames(styles.numberInputIncrementButton, styles.numberInputIncrementButtonDown)} onClick={() => onIncrement(-step)} />
    </div>
  )
}

export default ViewPlugin.fromClass(class {
  decorations: DecorationSet

  constructor(view: EditorView) {
    this.decorations = this.getBezierCurveWidgets(view)
  }

  getBezierCurveWidgets(view: EditorView) {
    const widgets: Range<Decoration>[] = []
    const validPropertyNames = new Set(['animation', 'animation-timing-function'])

    for (const { from, to } of view.visibleRanges) {
      syntaxTree(view.state).iterate({
        from, to,
        enter: (node) => {
          if (node.name === 'Declaration') {
            const declaration = view.state.doc.sliceString(node.from, node.to)
            if (!validPropertyNames.has(declaration.split(':')[0])) {
              return false
            } else {
              return true
            }
          }
          if (node.name === 'CallExpression') {
            const curveRaw = view.state.doc.sliceString(node.from, node.to)
            if (!curveRaw.startsWith('cubic-bezier')) { return }
            const curve = parseCurve(curveRaw)
            if (curve?.type === 'curve') {
              const deco = Decoration.widget({
                widget: new BezierCurveWidget(curve.cps, node.node),
                side: 1,
              })
              widgets.push(deco.range(node.to))
            }
          } else if (node.name === 'ValueName') {
            const curveName = view.state.doc.sliceString(node.from, node.to)
            const curve = NamedBezierCurves[curveName]
            if (curve?.type === 'curve') {
              const deco = Decoration.widget({
                widget: new BezierCurveWidget(curve.cps, node.node),
                side: 1,
              })
              widgets.push(deco.range(node.to))
            }
          }
        },
      })
    }
    return Decoration.set(widgets)
  }

  update(update: ViewUpdate) {
    if (update.docChanged || update.viewportChanged) {
      this.decorations = this.getBezierCurveWidgets(update.view)
    }
  }

}, {
  decorations: v => v.decorations,

  eventHandlers: {
    mouseup(e, view) {
      const button = e.target
      if (button instanceof HTMLButtonElement && button.dataset.bezierWidget === 'true') {
        const position = view.posAtDOM(button)
        const renderTarget = button.querySelector('#render-target') as HTMLDivElement
        const root = createRoot(renderTarget)

        this.decorations.between(position, position, (from, to, decoration) => {
          const node = decoration.spec.widget.node as SyntaxNode
          const controlPoints = decoration.spec.widget.controlPoints as ControlPoints
          let updatedControlPoints: ControlPoints | undefined = undefined

          button.classList.add(styles.bezierButtonActive)
          root.render(
            <Popover
              anchor={button}
              margins={{ vertical: 10 }}
              onBlur={() => {
                button.classList.remove(styles.bezierButtonActive)
                root.unmount()
                const updatedCp = updatedControlPoints
                if (updatedCp != null) {
                  const easingValue = Object.entries(NamedBezierCurves).find(([curveName, curve]) => {
                    return (
                      curve.cps[0][0] === updatedCp[0][0] &&
                      curve.cps[0][1] === updatedCp[0][1] &&
                      curve.cps[1][0] === updatedCp[1][0] &&
                      curve.cps[1][1] === updatedCp[1][1]
                    )
                  })?.[0] ?? `cubic-bezier(${updatedCp.flat().join(', ')})`
                  view.dispatch({ changes: [{ from: node.from, to: node.to, insert: easingValue }]})
                }
              }}
              anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
              transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
              <BezierEditor
                controlPoints={controlPoints}
                onUpdate={change => {
                  updatedControlPoints = change
                }}
                onCancel={() => {}}
              />
            </Popover>,
          )
        })
      }
    },
  },
})
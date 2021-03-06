import { EditorView } from '@codemirror/view'
import { useState, useRef, useLayoutEffect, useMemo, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { basicSetup } from '@codemirror/basic-setup'
import { cssLanguage } from '@codemirror/lang-css'
import { EditorState } from '@codemirror/state'
import ControlPanel from './ControlPanel'
import { SANDBOX_CONFIG } from './Editor'
import { Checkbox } from './Modals'
import { mockAnimationControls } from './core/animationControls'
import { SuggestionsFormLinkFooter } from './Projects'
import { css } from './util'
import dedent from './util/dedent'
import styles from './css/projects.scss'
import sharedStyles from './css/shared.scss'
import useTimeline, { StoreDispatch } from './core/editorControls'
import BezierPlugin from './codemirror/BezierPlugin'
import ColorPickerPlugin from './codemirror/ColorPickerPlugin'
import HighlightLine from './codemirror/HighlightLine'
import { dracula } from './codemirror/codeMirrorTheme'
import EditorEffect from './codemirror/EditorEffect'

const mockDispatch: StoreDispatch = {
  onChangeDelay() {},
  onChangeDuration() {},
  highlightRule() {},
  highlightAnimationSource() {},
  removeHighlight() {},
  toggleSelectRules() {},
  updateEasing() {},
}

export default function HowItWorks() {
  const sourceCodeContainerRef = useRef<HTMLDivElement>(null)
  const [offset, setOffset] = useState(500)
  const [eraseSomeCode, setEraseSomeCode] = useState(false)
  const [pauseTime, setPauseTime] = useState<number>()
  const [cssEditorView, setCSSEditorView] = useState<EditorView>()
  const cssSource = useMemo(() => generateExampleCSS(offset, eraseSomeCode), [eraseSomeCode, offset])
  const { viewState, animationControls, updateIframeEl } = useTimeline(cssSource, html, cssEditorView)
  const stubbedAnimationControls = useMemo(() => ({
    ...mockAnimationControls(),
    getState: animationControls.getState,
  }), [animationControls.getState])

  function _setPauseTime(time?: number) {
    setPauseTime(time)
    if (time != null) {
      animationControls.pause(time)
    } else {
      animationControls.play()
    }
  }

  useLayoutEffect(() => {
    if (sourceCodeContainerRef.current == null) { return }
    setCSSEditorView(
      new EditorView({
        state: EditorState.create({
          extensions: [
            basicSetup,
            HighlightLine,
            dracula,
            cssLanguage,
            ColorPickerPlugin,
            BezierPlugin,
            EditorView.theme({
              '&': {
                height: '100%',
                'border-radius': '4px',
                'background-color': '#292929',
                'font-size': '14px',
                'padding-top': '10px',
              },
            }),
          ],
        }),
        parent: sourceCodeContainerRef.current,
      }),
    )
  }, [])

  useEffect(() => {
    cssEditorView?.dispatch({
      changes: [{ from: 0, to: cssEditorView.state.doc.length, insert: cssSource }],
      selection: { anchor: 193, head: 198 },
      effects: [EditorEffect.Spotlight.of({ from: 193, to: 198 })],
    })
  }, [cssEditorView, cssSource])

  useEffect(() => {
    let i = 0
    const interval = setInterval(() => {
      setOffset(500 + ((i++ % 3) * 500))
    }, 1000)

    return () => {
      clearInterval(interval)
    }
  }, [])

  const pauseTimes = [1200, 1400, 1600]

  return (
    <div className={sharedStyles.flexColumn} style={{ maxWidth: '1200px', marginLeft: 'auto', marginRight: 'auto', marginBottom: 30 }}>
      <div className={styles.aboutGrid}>
        <div className={styles.aboutImage} ref={sourceCodeContainerRef}></div>
        <div className={css(styles.aboutInstructions)} style={{ textAlign: 'left' }}>
          <b className={css(styles.instructionHeader)}>Source code</b>
          <br />
            The CSS file is the "source of truth" for the project.  This CSS source code can be edited directly, and changes will be reflected in the
            live preview and the timeline view immediately.
          <br/><br/>
            Conversely, when changes are made to the animation using the timeline view below, updates
            will be made to the CSS source file immediately.
          <br /><br />
          <Checkbox value={eraseSomeCode} onChange={val => setEraseSomeCode(!eraseSomeCode)} label={'Comment out some code'} name={''} />
            Changes made to the HTML are also reflected in the live preview immediately whenever any changes are made, but have no effect on the timeline view below.
          <br /><br />
        </div>
        <div className={css(styles.aboutInstructions)} style={{ textAlign: 'left' }}>
          <b className={css(styles.instructionHeader)}>Timeline View:</b>
          <br />
          Timeline view at bottom of screen is generated from CSS source in the middle window.
          <br/><br/>
          Each row indicates an "instance" of an animation.  That is, a particular usage of a keyframe animation in a style rule declaration.  More specifically, each row is generated by a unique combination of a CSS selector and @keyframes animation.
          <ul>
            <br/>
            <li><span className={styles.instructionBold}>Selectors</span> - Selector name for the particular animation instance is the top bold label on the left of the row.  Example "circle:nth-of-type(1)".</li>
            <br />
            <li><span className={styles.instructionBold}>Animation name</span> - Name of keyframe animation is the second label under selector name.  This is pulled from the `animation-name` css prop on the style rule.  Example "bobbing-wave"</li>
          </ul>
        </div>
        <div className={styles.aboutImage}>
          <ControlPanel
            dispatch={mockDispatch}
            onResize={() => {}}
            {...viewState}
            controls={stubbedAnimationControls}
            totalLengthMs={20000}
            editorsAreFocused={() => false}
          />
        </div>
        <div className={styles.aboutImage} style={{  backgroundColor: 'gray', overflow: 'hidden' }}>
          <div className={styles.pointerArrow} style={{ left: 90, top: 40, height: 80 }}>Zoom</div>
          <div className={styles.pointerArrow} style={{ left: 230, top: 20, height: 90 }}>Row Size</div>
          <div className={styles.pointerArrow} style={{ left: 370, top: 40, height: 80 }}>Grid Snap</div>
          <div style={{ position: 'relative', height: '100%', transformOrigin: '0px 0px', transform: 'translate(0px, 170px) scale(1.4)' }}>
            <ControlPanel
              dispatch={mockDispatch}
              onResize={() => {}}
              controls={stubbedAnimationControls}
              {...viewState}
              totalLengthMs={20000}
              editorsAreFocused={() => false}
            />
          </div>
        </div>
        <div className={css(styles.aboutInstructions)}>
          <b className={css(styles.instructionHeader)}  style={{ textAlign: 'right' }}>Controls:</b>
          <br />
          <br />
          <ul>
            <li>
              <span className={styles.instructionBold}>Zoom</span>
               - Indicates the zoom level.  Expressed in seconds / window width.
            </li>
            <br/>
            <li>
              <span className={styles.instructionBold}>Row Size</span>
               - Height of rows in the timeline in pixels, larger size rows are useful for visualizing keyframe timing functions
            </li>
            <br/>
            <li>
              <span className={styles.instructionBold}>Grid Snap</span>
               - Moving animations by dragging header or resizing will snap to milliseconds of this number.
            </li>
            <br/>
            <li>
              <span className={styles.instructionBold}>Resize Handle</span>
               - Resizes bottom panel vertically
            </li>
          </ul>
        </div>
        <div className={css(styles.aboutInstructions)}>
          <b className={css(styles.instructionHeader)}  style={{ textAlign: 'left' }}>Pause / Play:</b>
          <br />
          Animations can be paused / played by clicking on the black bar at the top of the timeline.  Click and drag to pan through the timeline.
          <br />
          <br />
          <ul>
            {pauseTimes.map(time => (
              <Checkbox
                key={time}
                value={pauseTime === time}
                onChange={val => _setPauseTime(val ? time : undefined)}
                label={`Pause at ${time}ms`}
                name=""
              />
            ))}
          </ul>
          <br />
        </div>
        <div className={styles.aboutImage}>
          <div style={{ position: 'relative', height: '100%', transformOrigin: '275px 0px', transform: 'scale(2)' }}>
            <ControlPanel
              dispatch={{} as any}
              onResize={() => {}}
              controls={stubbedAnimationControls}
              {...viewState}
              totalLengthMs={20000}
              editorsAreFocused={() => false}
            />
          </div>
        </div>
        <div className={styles.aboutImage}>
          <iframe
            className={styles.livePreview}
            title="live-preview"
            sandbox={SANDBOX_CONFIG}
            ref={updateIframeEl}
          />
        </div>
        <div className={css(styles.aboutInstructions)}>
          <b className={css(styles.instructionHeader)}>Live Preview</b>
          <br /><br />
          CSS and HTML is injected into "live preview" iframe on any changes.
          <br /><br />
          Pause and play state will be reflected here and is useful for fine tuning animations.
          <br /><br />
          Currently: <span className={styles.instructionBold}>{pauseTime ? 'PAUSED' : 'RUNNING'}</span>
          <br />
        </div>
      </div>
      <div className={css(styles.instructions)}>
        <b className={css(styles.instructionHeader)}>Caveats / Known Issues</b>
        <ul>
          <li>- Zooming in/out sometimes moves the timeline horizontally in unexpected way</li>
          <li>- Cmd+Z to "undo" get stuck sometimes</li>
        </ul>
        <br />
        If you are not logged in "save" icon saves project to local storage.
      </div>
      <Link to="/p/draft" className={styles.addAnimationButton} style={{ marginLeft: 'auto', marginRight: 'auto', marginBottom: 50, marginTop: 20 }}>
        Get Started
      </Link>
      <SuggestionsFormLinkFooter />
    </div>
  )
}

function generateExampleCSS(offsetMs: number, eraseSomeCode: boolean) {
  return dedent`
    circle:nth-of-type(1) {
      stroke-dasharray: 550px;
      animation: border-rotate 3s 0.15s ease-in-out infinite;
    }

    circle:nth-of-type(2) {
      stroke-dasharray: 500px;
      animation: border-rotate 3s ${offsetMs}ms ease-in-out infinite;
    }

    circle:nth-of-type(3) {
      stroke-dasharray: 450px;
      animation: border-rotate 3s 0.45s ease-in-out infinite;
    }

    ${!eraseSomeCode ? `circle:nth-of-type(4) {
      stroke-dasharray: 300px;
      animation: border-rotate 3s 0.60s ease-in-out infinite;
    }` : `/* circle:nth-of-type(4) {
      stroke-dasharray: 300px;
      animation: border-rotate 3s 0.60s ease-in-out infinite;
    } */`}

    .container {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
    }

    .loader {
      max-width: 15rem;
      width: 100%;
      height: auto;
      stroke-linecap: round;
    }

    circle {
      fill: none;
      stroke-width: 3.5;
      radius: 5px;
      transform-origin: 170px 170px;
      will-change: transform;
    }
    @keyframes border-rotate {
      50% {
        transform: rotate(360deg);
      }
    }
  `
}

const html = dedent`
<div class="container">
	<svg class="loader" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340 340">
    <circle cx="170" cy="170" r="160" stroke="#E2007C"/>
    <circle cx="170" cy="170" r="135" stroke="#404041"/>
    <circle cx="170" cy="170" r="110" stroke="#E2007C"/>
  </svg>
</div>
`
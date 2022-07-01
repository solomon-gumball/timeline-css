import { debounce } from 'lodash'
import { LRLanguage, syntaxTree } from '@codemirror/language'
import { cssLanguage } from '@codemirror/lang-css'
import { undo } from '@codemirror/commands'
import { SyntaxNode } from '@lezer/common'
import { EditorState, EditorView, basicSetup } from '@codemirror/basic-setup'
import { html } from '@codemirror/lang-html'
import { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import styles from './css/editor.scss'
import sharedStyles from './css/shared.scss'
import { classNames } from './util'
import { useLocalStorage } from './util/storage'

import ControlPanel from './ControlPanel'
import { dracula } from './codemirror/codeMirrorTheme'
import RefreshIcon from './icons/refresh.svg'
import CloneIcon from './icons/clone.svg'
import SaveIcon from './icons/save.svg'
import { SessionContext } from './App'
import starterProject from './projectDefaults'
import { API } from '../types'
import Popover from './Popover'
import { AnimationUpsert, ErrorModal, NotFoundModal, PromptLoginModal, UpsertAnimationModal } from './Modals'
import useTimeline from './core/editorControls'
import BezierPlugin from './codemirror/BezierPlugin'
import ColorPickerPlugin from './codemirror/ColorPickerPlugin'
import HighlightLine from './codemirror/HighlightLine'
import { StarCount } from './StarCount'
import { AppHeader } from './AppHeader'

export const SANDBOX_CONFIG = 'allow-modals allow-pointer-lock allow-popups allow-presentation allow-downloads allow-same-origin allow-top-navigation-by-user-activation'

type Action = (
  { type: 'LOADING_COMPLETE', payload: StorageValue, project: API.UserProjectJoin } |
  { type: 'UPDATE_LOCAL', cssSource?: string, htmlSource?: string } |
  { type: 'UPDATE_REMOTE' } |
  { type: 'UPDATE_NAME', name: string } |
  { type: 'DID_INITIAL_SET' } |
  { type: 'SAVED_LOCAL' } |
  { type: 'PROJECT_LOAD_ERROR' }
)

type ReducerState = {
  cssSource: string,
  htmlSource: string,
  loadError?: true,
  updatedAt?: number,
  didInitialSet: boolean,
} & ({
  projectType: 'LOCAL',
  loading: false,
  remoteUpdatedAt?: number,
  remoteProject?: API.UserProjectJoin,
} | ({
    projectType: 'REMOTE',
    loading: false,
    remoteProject: API.UserProjectJoin,
    remoteUpdatedAt: number,
  } | {
    projectType: 'REMOTE',
    loading: true,
    remoteProject?: API.UserProjectJoin,
    remoteUpdatedAt?: number,
  }))

function reducer(state: ReducerState, action: Action): ReducerState {
  switch (action.type) {
    case 'LOADING_COMPLETE': {
      // const storageValue = getStorageValue()
      // const useRemoteUpdate = (storageValue == null || storageValue.updatedAt < new Date(action.payload.updatedAt).getTime())
      // const projectData = useRemoteUpdate
      //   ? action.payload : storageValue
      return {
        ...state,
        loading: false,
        ...action.payload,
        remoteProject: action.project,
        projectType: 'REMOTE',
        remoteUpdatedAt: action.payload.updatedAt,
      }
    }
    case 'DID_INITIAL_SET': {
      return { ...state, didInitialSet: true }
    }
    case 'SAVED_LOCAL': {
      return { ...state, remoteUpdatedAt: Date.now() }
    }
    case 'PROJECT_LOAD_ERROR': {
      return { ...state, loadError: true }
    }
    case 'UPDATE_LOCAL': {
      if (state.loading || !state.didInitialSet) { return state }
      const didChange = (
        (action.cssSource != null && state.cssSource !== action.cssSource) ||
        (action.htmlSource != null && state.htmlSource !== action.htmlSource)
      )
      if (!didChange) { return state }

      return {
        ...state,
        cssSource: action.cssSource ?? state.cssSource,
        htmlSource: action.htmlSource ?? state.htmlSource,
        updatedAt: Date.now(),
      }
    }
    case 'UPDATE_NAME': {
      if (state.projectType === 'LOCAL' || state.loading) { return state }
      return {
        ...state,
        loading: false,
        projectType: 'REMOTE',
        remoteProject: { ...state.remoteProject, name: action.name },
        remoteUpdatedAt: Date.now(),
      }
    }
    case 'UPDATE_REMOTE': {
      if (state.projectType === 'LOCAL' || state.loading) { return state }

      return {
        ...state,
        loading: false,
        projectType: 'REMOTE',
        remoteUpdatedAt: Date.now(),
      }
    }
  }
}

type StorageValue = { cssSource: string, htmlSource: string, updatedAt: number }
function getStorageValue(projectId: string = 'draft'): StorageValue {
  try {
    const storageKey = getStorageKey(projectId)
    const storageString = localStorage.getItem(storageKey)

    if (storageString == null) throw new Error('no storage')
    return JSON.parse(storageString)
  } catch (error) {
    return { ...starterProject, updatedAt: 0 }
  }
}

const getStorageKey = (projectId: string) => `p.${projectId}`

function initReducerState(projectIdParam?: string): ReducerState {
  return !projectIdParam || projectIdParam === 'draft'
    ? ({
      projectType: 'LOCAL',
      loading: false,
      ...getStorageValue(projectIdParam),
      updatedAt: Date.now(),
      remoteUpdatedAt: Date.now(),
      didInitialSet: false,
    })
    : ({
      projectType: 'REMOTE',
      loading: true,
      cssSource: '',
      htmlSource: '',
      updatedAt: 0,
      didInitialSet: false,
    })
}
type DebugNode = { name: string, content: string, children: DebugNode[] }

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function debugSyntaxTree(editorState: EditorState) {
  const tree = syntaxTree(editorState)
  function traverse(node: SyntaxNode): DebugNode {
    const children: DebugNode[] = []
    let childNode: SyntaxNode | null = node.firstChild
    while (childNode) {
      children.push(traverse(childNode))
      childNode = childNode.nextSibling
    }
    return {
      name: node.type.name,
      content: editorState.sliceDoc(node.from, node.to),
      children,
    }
  }
  // eslint-disable-next-line no-console
  console.log(traverse(tree.topNode))
}

type SaveIndicatorStatus = (
  { type: 'DID_SAVE', timestamp: number } |
  { type: 'WARN_SAVE', timestamp: number }
)

export default function Editor() {
  const { projectId: projectIdParam } = useParams()
  const [panelSize, setPanelSize] = useLocalStorage('panelSize', { html: 1, css: 1, preview: 1 })
  const htmlEditorRef = useRef<HTMLDivElement>(null)
  const cssEditorRef = useRef<HTMLDivElement>(null)
  const timelineContainerRef = useRef<HTMLDivElement>(null)
  const didMount = useRef(false)
  const cssSourceEditor = useRef<{ editor: EditorView, language: LRLanguage }>()
  const htmlSourceEditor = useRef<EditorView>()
  const navigate = useNavigate()
  const [reducerState, reducerDispatch] = useReducer(reducer, initReducerState(projectIdParam))
  const { cssSource, htmlSource, loading, updatedAt, projectType, didInitialSet, remoteUpdatedAt } = reducerState
  const session = useContext(SessionContext)
  const [showPromptCloneAccountRequired, setShowPromptCloneAccountRequired] = useState(false)
  const controlStateLabelRef = useRef<HTMLDivElement>(null)
  const saveProjectRef = useRef<() => void>()
  const [showErrorModal, setShowErrorModal] = useState(false)
  const [cloneProjectData, setCloneProjectData] = useState<{ css: string, html: string }>()
  const [upsertData, setUpsertData] = useState<AnimationUpsert>()
  const [cssEditorView, setCSSEditorView] = useState<EditorView>()
  const [htmlEditorView, setHtmlEditorView] = useState<EditorView>()
  const [saveIndicatorStatus, setSaveIndicatorStatus] = useState<SaveIndicatorStatus>()
  const { viewState, dispatch, updateIframeEl, triggerRefresh, animationControls } = useTimeline(cssSource, htmlSource, cssEditorView)

  const isYourProject = (
    reducerState.projectType === 'LOCAL' || (
      reducerState.loading
        ? undefined
        : reducerState.remoteProject.username === session.username
    )
  )
  const hasUnsavedChanges = isYourProject && reducerState.updatedAt != null && (reducerState.updatedAt > (reducerState.remoteUpdatedAt ?? 0))
  const updateLocalStorage = useMemo(() => debounce((source?: { cssSource: string, htmlSource: string, updatedAt: number }) => {
    if (projectIdParam == null) { return }
    const storageKey = getStorageKey(projectIdParam)

    if (source === undefined) {
      return localStorage.removeItem(storageKey)
    }

    try {
      const storageItem: StorageValue = source
      localStorage.setItem(storageKey, JSON.stringify(storageItem))
    }
    catch (e) {
      console.error(e)
    }
  }, 500, { maxWait: 3000 }), [projectIdParam])

  useLayoutEffect(() => {
    if (loading === false && didInitialSet === false && cssEditorView && htmlEditorView) {
      cssEditorView?.dispatch({ changes: [{ from: 0, insert: cssSource }] })
      htmlEditorView?.dispatch({ changes: [{ from: 0, insert: htmlSource }] })
      reducerDispatch({ type: 'DID_INITIAL_SET' })
    }
  }, [loading, cssSource, htmlSource, didInitialSet, cssEditorView, htmlEditorView])

  useEffect(() => {
    return animationControls.onChange(({ status, offsetTime }) => {
      if (controlStateLabelRef.current == null) { return }
      switch (status) {
        case 'paused': {
          controlStateLabelRef.current.style.color = 'hotpink'
          controlStateLabelRef.current.innerText = `PAUSED at ${Math.round(offsetTime ?? 0)}ms`
          break
        }
        case 'running': {
          controlStateLabelRef.current.style.color = 'yellowgreen'
          controlStateLabelRef.current.innerText = 'RUNNING'
        }
      }
    })
  }, [animationControls])

  useEffect(() => {
    if (projectType === 'LOCAL') { return }

    fetch(`/api/project/${projectIdParam}`)
      .then(result => {
        if (result.ok) return result.json()
        throw new Error('could not save')
      })
      .then((remote: API.UserProjectJoin) => {
        const remoteUpdatedAt = new Date(remote.updated_at).getTime()
        reducerDispatch({
          type: 'LOADING_COMPLETE',
          payload: {
            cssSource: remote.source.css,
            htmlSource: remote.source.html,
            updatedAt: remoteUpdatedAt,
          },
          project: remote,
        })
      })
      .catch(error => {
        console.error('project not found', error)
        reducerDispatch({ type: 'PROJECT_LOAD_ERROR' })
      })
  }, [projectIdParam, projectType])

  function saveProject() {
    if (reducerState.loading) { return }
    const loggedIn = session.username != null
    if (!loggedIn) {
      updateLocalStorage({ cssSource, htmlSource, updatedAt: Date.now() })
      reducerDispatch({ type: 'SAVED_LOCAL' })
      setSaveIndicatorStatus({ type: 'DID_SAVE', timestamp: Date.now() })

    } else if (reducerState.projectType === 'LOCAL') {
      setUpsertData({
        type: 'INSERT',
        project: {
          source: {
            css: cssSource,
            html: htmlSource,
          },
        },
      })
    } else if (reducerState.projectType === 'REMOTE') {
      session.updateProject(reducerState.remoteProject.id, {
        css: cssSource,
        html: htmlSource,
        name: reducerState.remoteProject.name,
        preview_infinite: reducerState.remoteProject.preview_infinite,
        preview_offset_time: reducerState.remoteProject.preview_offset_time,
      })
        .then(() => reducerDispatch({ type: 'UPDATE_REMOTE' }))
        .catch(() => setShowErrorModal(true))
      setSaveIndicatorStatus({ type: 'DID_SAVE', timestamp: Date.now() })
    }
  }

  saveProjectRef.current = saveProject

  const editorsAreFocused = useCallback(() => {
    if (cssSourceEditor.current == null || htmlSourceEditor.current == null) { return false }
    return (
      cssSourceEditor.current.editor.hasFocus ||
      htmlSourceEditor.current.hasFocus
    )
  }, [])

  useEffect(() => {
    let metaPressed = false

    function handleKeypress(e: KeyboardEvent) {
      const anEditorIsFocused = editorsAreFocused()
      const upsertModalIsActive = upsertData != null
      const cloneModalIsActive = cloneProjectData != null
      if (e.key === 'Meta') {
        metaPressed = true
      }
      if (upsertModalIsActive || cloneModalIsActive) { return }

      if (e.key === 's' && metaPressed) {
        e.preventDefault()
        e.stopImmediatePropagation()
        e.stopPropagation()
        saveProjectRef.current?.()
        return
      }
      if (anEditorIsFocused) { return }

      if (e.key === '1') {
        setPanelSize(curr => ({ ...curr, html: curr.html ? 0 : 1 }))
      }
      if (e.key === '2') {
        setPanelSize(curr => ({ ...curr, css: curr.css ? 0 : 1 }))
      }
      if (e.key === '3') {
        setPanelSize(curr => ({ ...curr, preview: curr.preview ? 0 : 1 }))
      }
      if (e.key === ' ' && !anEditorIsFocused) {
        e.preventDefault()
        animationControls.toggle()
      }

      if (e.key === 'z' && metaPressed) {
        if (cssSourceEditor.current) {
          undo(cssSourceEditor.current.editor)
        }
      }
    }
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Meta') { metaPressed = false }
    }

    document.addEventListener('keydown', handleKeypress)
    document.addEventListener('keyup', handleKeyUp)
    return () => {
      document.removeEventListener('keyup', handleKeyUp)
      document.removeEventListener('keydown', handleKeypress)
    }
  }, [animationControls, cloneProjectData, editorsAreFocused, setPanelSize, upsertData])

  useLayoutEffect(() => {
    if (didMount.current) { return }
    if (htmlEditorRef.current == null || cssEditorRef.current == null) { return }
    didMount.current = true
    setHtmlEditorView(
      new EditorView({
        state: EditorState.create({
          extensions: [
            basicSetup, html(),
            dracula,
            EditorView.theme({
              '&': { height: '100%', 'border-radius': '4px', 'background-color': '#292929' },
              '.cm-scroller': { 'padding-bottom': '28px' },
            }),
            EditorView.updateListener.of(update => {
              reducerDispatch({ type: 'UPDATE_LOCAL', htmlSource: update.state.sliceDoc() })
            }),
          ],
        }),
        parent: htmlEditorRef.current,
      }),
    )

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
              '&': { height: '100%', 'border-radius': '4px', 'background-color': '#292929' },
            }),
            EditorView.updateListener.of(update => {
              reducerDispatch({ type: 'UPDATE_LOCAL', cssSource: update.state.sliceDoc() })
            }),
          ],
        }),
        parent: cssEditorRef.current,
      }),
    )
  }, [])

  function onResizeControlPanel(height: number) {
    const container = timelineContainerRef.current
    if (container == null) { return }
    container.style.height = `${container.offsetHeight + height}px`
  }

  useLayoutEffect(() => {
    const container = timelineContainerRef.current
    if (container == null) { return }
    const controlPanelHeight = window.innerHeight * 0.4
    container.style.height = `${controlPanelHeight}px`
  }, [])

  useEffect(() => {
    if (!isYourProject) { return }
    if (updatedAt == null || remoteUpdatedAt == null) { return }
    if (remoteUpdatedAt < updatedAt) {
      const timeout = setTimeout(() => {
        setSaveIndicatorStatus({ type: 'WARN_SAVE', timestamp: Date.now() })
      }, 5000)
      return () => {
        clearTimeout(timeout)
      }
    }
  }, [isYourProject, remoteUpdatedAt, updatedAt])

  // Warn if refreshing the page with unsaved changes
  useEffect(() => {
    const warningMessage = 'Project has not been saved.  Local changes will be lost'

    const onPageUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault()
        e.returnValue = warningMessage
        return warningMessage
      }
    }
    window.onbeforeunload = onPageUnload
    return () => {
      window.onbeforeunload = null
    }
  }, [hasUnsavedChanges])

  return (
    <div className={styles.pageContainer}>
      {showErrorModal && <ErrorModal onComplete={() => setShowErrorModal(false)} />}
      {cloneProjectData && (
        <UpsertAnimationModal
          customTitle="Clone Project"
          data={{ type: 'INSERT', project: { source: cloneProjectData } }}
          onCancel={() => setCloneProjectData(undefined)}
          onComplete={project => {
            setCloneProjectData(undefined)
            reducerDispatch({ type: 'LOADING_COMPLETE', project, payload: { cssSource, htmlSource, updatedAt: Date.now() } })

            // if (upsertData.type === 'INSERT') {
            //   updateLocalStorage({ cssSource: '', htmlSource: '', updatedAt: 0 })
            navigate(`/p/${project.id}`, { replace: true })
            // }
          }}
        />
      )}
      {reducerState.loadError && (
        <NotFoundModal />
      )}
      {upsertData && (
        <UpsertAnimationModal
          data={upsertData}
          onCancel={() => setUpsertData(undefined)}
          onComplete={project => {
            setUpsertData(undefined)
            reducerDispatch({ type: 'LOADING_COMPLETE', project, payload: { cssSource, htmlSource, updatedAt: Date.now() } })

            if (upsertData.type === 'INSERT') {
              updateLocalStorage({ cssSource: '', htmlSource: '', updatedAt: 0 })
              navigate(`/p/${project.id}`, { replace: true })
            }
          }}
        />
      )}
      <AppHeader
        hasUnsavedChanges={hasUnsavedChanges}
        centerItem={(
          <>
            <button className={styles.panelToggleButton} onClick={() => setPanelSize(prev => ({ ...prev, html: prev.html === 1 ? 0 : 1}))} style={{ color: panelSize.html === 1 ? 'white' : 'gray' }}>HTML</button>
            <button className={styles.panelToggleButton} onClick={() => setPanelSize(prev => ({ ...prev, css: prev.css === 1 ? 0 : 1}))} style={{ color: panelSize.css === 1 ? 'white' : 'gray' }}>CSS</button>
            <button className={styles.panelToggleButton} onClick={() => setPanelSize(prev => ({ ...prev, preview: prev.preview === 1 ? 0 : 1}))} style={{ color: panelSize.preview === 1 ? 'white' : 'gray' }}>PREVIEW</button>
          </>
        )}
        leftItem={(
          <>
            {reducerState.projectType === 'LOCAL' && (
              <>Your Sandbox</>
            )}
            {reducerState.projectType === 'REMOTE' && reducerState.loading === false && (
              <div className={sharedStyles.flexRow} style={{ alignItems: 'center' }}>
                <button
                  className={classNames(styles.projectName, !isYourProject && styles.projectNameNoEdit)}
                  onClick={() => isYourProject && setUpsertData({
                    type: 'UPDATE',
                    project: {
                      ...reducerState.remoteProject,
                      source: {
                        css: cssSource,
                        html: htmlSource,
                      },
                    },
                    totalLength: viewState.totalLengthMs,
                  })}
                >
                  {reducerState.remoteProject.name}
                </button>
                <span style={{ marginRight: 5 }}>
                project by {isYourProject ? 'you' : reducerState.remoteProject.username}
                </span>
                <StarCount project={reducerState.remoteProject} />
              </div>
            )}
          </>
        )}
      />
      {showPromptCloneAccountRequired && (
        <PromptLoginModal onCancel={() => setShowPromptCloneAccountRequired(false)} message="Login with github to clone this project" />
      )}
      <div className={sharedStyles.flexRow} style={{ flexGrow: 1, flexShrink: 1, minHeight: 0 }}>
        <div className={styles.htmlEditorContainer} ref={htmlEditorRef} style={{ width: 1, display: panelSize.html ? 'block' : 'none' }}>
          <div className={styles.codePanelLabel} style={{ zIndex: 2, top: 0, right: 0 }} onClick={() => setPanelSize(prev => ({ ...prev, html: panelSize.html === 1 ? 0 : 1 }))}>HTML</div>
        </div>
        <div className={styles.cssEditorContainer} ref={cssEditorRef} style={{ width: 1, display: panelSize.css ? 'block' : 'none' }}>
          <div className={styles.codePanelLabel} style={{ zIndex: 2, top: 0, right: 0 }} onClick={() => setPanelSize(prev => ({ ...prev, css: panelSize.css === 1 ? 0 : 1 }))}>CSS</div>
        </div>
        <div className={styles.liveDemoContainer} style={{ width: 1, display: panelSize.preview ? 'block' : 'none' }}>
          <Link to="/" id="navigate-home" className={`${styles.codePanelLabel} ${styles.navigateHomeButton}`} style={{ top: 0, left: 15 }}>
            {'<-'} Back to projects
          </Link>
          <div className={styles.floatingLiveContainerButtonRow} style={{ marginBottom: panelSize.css === 0 && panelSize.html === 0 ? 30 : 10 }}>
            <div title="Reload animation" className={styles.floatingLiveContainerButton} style={{ height: 30, width: 30, marginRight: 8 }} onClick={() => triggerRefresh()}>
              <RefreshIcon className={sharedStyles.centeredAbsolute} style={{ display: 'block', color: 'gray', width: 16 }} />
            </div>
            {!isYourProject && (
              <button title="Clone project" onClick={() => session.username ? setCloneProjectData({ css: cssSource, html: htmlSource }) : setShowPromptCloneAccountRequired(true)} className={styles.floatingLiveContainerButton} style={{ height: 30, width: 30, marginRight: 8 }}>
                <CloneIcon className={sharedStyles.centeredAbsolute} style={{ display: 'block', color: 'gray', width: 16 }} />
              </button>
            )}
            {isYourProject && (
              <Popover
                anchor={(
                  <div title="Save project" className={styles.floatingLiveContainerButton} style={{ marginRight: 8, height: 30, width: 30 }} onClick={() => saveProject()}>
                    <SaveIcon className={sharedStyles.centeredAbsolute} style={{ display: 'block', color: hasUnsavedChanges ? 'orange' : 'gray', width: 14 }} />
                  </div>
                )}
                anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
                transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}
                margins={{ vertical: 5 }}
              >
                {saveIndicatorStatus && (
                  <div key={saveIndicatorStatus.timestamp} className={classNames(styles.tooltip, saveIndicatorStatus.type === 'WARN_SAVE' && styles.tooltipWarning)}>
                    {saveIndicatorStatus.type === 'WARN_SAVE' && (
                      <>
                        <div>You have unsaved changes</div>
                        <div>CMD + S to save</div>
                      </>
                    )}
                    {saveIndicatorStatus.type === 'DID_SAVE' && 'Changes saved!'}
                  </div>
                )}
              </Popover>
            )}
            <div ref={controlStateLabelRef} className={styles.floatingLiveContainerButton} onClick={() => animationControls.toggle()} style={{ textShadow: '1px 1px black', backgroundColor: 'transparent', marginRight: 8, color: 'greenyellow', height: 20 }}>running</div>
          </div>
          <iframe
            className={styles.liveDemoIframe}
            src="about:blank"
            sandbox={SANDBOX_CONFIG}
            title="live code"
            loading="lazy"
            ref={updateIframeEl}
          />
        </div>
      </div>
      <div className={styles.timelineContainer} ref={timelineContainerRef}>
        <ControlPanel
          onResize={onResizeControlPanel}
          controls={animationControls}
          { ...viewState }
          totalLengthMs={Math.max(viewState.totalLengthMs, 500)}
          dispatch={dispatch}
          editorsAreFocused={editorsAreFocused}
        />
      </div>
    </div>
  )
}
import { debounce, range, camelCase } from 'lodash'
import { LRLanguage, syntaxTree } from '@codemirror/language'
import { undo } from '@codemirror/commands'
import { SyntaxNode } from '@lezer/common'
import { EditorSelection, TransactionSpec } from '@codemirror/state'
import { EditorState, EditorView, basicSetup } from '@codemirror/basic-setup'
import { html } from '@codemirror/lang-html'
import React, { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react'
import { Link, useParams, useNavigate, useMatch } from 'react-router-dom'
import styles from './css/editor.scss'
import sharedStyles from './css/shared.scss'
import { useUpdateTrigger, getColor, classNames, isFirefox } from './util'
import { useLocalStorage } from './util/storage'

import ControlPanel from './ControlPanel'
import { dracula } from './codeMirrorTheme'
import RefreshIcon from './icons/refresh.svg'
import CloneIcon from './icons/clone.svg'
import StarIcon from './icons/star.svg'
import SaveIcon from './icons/save.svg'
import { SessionContext } from './App'
import starterProject from './projectDefaults'
import { API, Optional } from '../types'
import Popover from './Popover'
import { AnimationUpsert, ErrorModal, GenericPromptModal, HelpModal, LogoutModal, NotFoundModal, PromptLoginModal, UpsertAnimationModal } from './Modals'
import { AnimationControls, generateAnimationControls, mockAnimationControls } from './animationControls'
import { EditorEffect, initializeCSSEditor } from './CodeEditor'

export type TimelineKeyframe = {
  progress: number,
  curve: TimelineEasing,
  frame: Keyframe,
}

type ControlPoints = [[number, number], [number, number]]

export const SANDBOX_CONFIG = 'allow-modals allow-pointer-lock allow-popups allow-presentation allow-downloads allow-same-origin allow-top-navigation-by-user-activation'
type TimelineJumpTerm = 'jump-start' | 'jump-end' | 'jump-none' | 'jump-both'
type TimelineBezierEasing = {
  type: 'curve',
  cps: ControlPoints,
}
type TimelineStepEasing = {
  type: 'steps',
  steps: number,
  jumpTerm: TimelineJumpTerm,
}

type TimelineEasing = TimelineBezierEasing | TimelineStepEasing

export type StyleRule = {
  id: string,
  selector: string,
  delay: number,
  curve: TimelineEasing,
  duration: number,
  easing: string,
  animationName: string,
  direction: 'normal' | 'reverse' | 'alternate',
  cssStyleRule: CSSStyleRule,
  iterationCount: number | undefined,
  keyframes: TimelineKeyframe[],
  animationIndex: number,
  fillMode?: 'backwards' | 'forwards' | 'both' | 'none',
  color: string,
  type: 'animation' | 'transition',
}

export type ViewState = {
  styleRules: StyleRule[],
  totalLengthMs: number,
  selectedRuleIds: Set<string>,
}

export type StoreDispatch = {
  computeRules(rules: CSSRuleList | undefined): void,
  updateRulePropertyValue(selector: string, replaceNode: ReplaceNodeFn): boolean,
  getMatchingRuleSyntaxNode(selector: string): {
      ruleSet: SyntaxNode,
      block: SyntaxNode,
  } | null,
  onChangeDelay(styleRuleId: string, delayMs: number): void,
  onChangeDuration(styleRuleId: string, durationMs: number): void,
  highlightRule(rule: StyleRule): void,
  highlightAnimationSource(rule: StyleRule): void,
  getMatchingKeyframeSyntaxNode(animationName: string): {
    ruleSet: SyntaxNode,
    block: SyntaxNode,
} | null,
  removeHighlight(): void,
  toggleSelectRules(ruleIds: string[]): void,
  updateEasing(ruleId: string, keyframeIndex: number, curve: [[number, number], [number, number]]): void,
}
type ReplaceNodeFn = (propertyName: string, childNodes: SyntaxNode[]) => TransactionSpec | undefined

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
  // const { htmlCode, cssCode, setHTMLCode, setCSSCode } = useProject(projectsById[projectId ?? ''])
  const [panelSize, setPanelSize] = useLocalStorage('panelSize', { html: 1, css: 1, preview: 1 })
  const htmlEditorRef = useRef<HTMLDivElement>(null)
  const cssEditorRef = useRef<HTMLDivElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const timelineContainerRef = useRef<HTMLDivElement>(null)
  const didMount = useRef(false)
  const [triggerRefresh, refreshCounter] = useUpdateTrigger()
  const [viewState, setViewState] = useState<ViewState>({ styleRules: [], selectedRuleIds: new Set(), totalLengthMs: 1000 })
  const cssSourceEditor = useRef<{ editor: EditorView, language: LRLanguage }>()
  const htmlSourceEditor = useRef<EditorView>()
  const navigate = useNavigate()
  const [reducerState, reducerDispatch] = useReducer(reducer, initReducerState(projectIdParam))
  const animationControlsRef = useRef<AnimationControls>(mockAnimationControls())
  const { cssSource, htmlSource, loading, updatedAt, projectType, didInitialSet, remoteUpdatedAt } = reducerState
  const session = useContext(SessionContext)
  const [showPromptCloneAccountRequired, setShowPromptCloneAccountRequired] = useState(false)
  const controlStateLabelRef = useRef<HTMLDivElement>(null)
  const saveProjectRef = useRef<() => void>()
  const [showErrorModal, setShowErrorModal] = useState(false)
  const [cloneProjectData, setCloneProjectData] = useState<{ css: string, html: string }>()
  const [upsertData, setUpsertData] = useState<AnimationUpsert>()
  const storeRef = useRef<ViewState>(viewState)
  storeRef.current = viewState
  const [saveIndicatorStatus, setSaveIndicatorStatus] = useState<SaveIndicatorStatus>()

  useMemo(() => {
    animationControlsRef.current.updateRules(viewState.styleRules)
  }, [viewState.styleRules])

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
    if (loading === false && didInitialSet === false && cssSourceEditor.current && htmlSourceEditor.current) {
      cssSourceEditor.current.editor.dispatch({
        changes: [{ from: 0, insert: cssSource }],
      })
      htmlSourceEditor.current.dispatch({
        changes: [{ from: 0, insert: htmlSource }],
      })
      reducerDispatch({ type: 'DID_INITIAL_SET' })
    }
  }, [loading, cssSource, htmlSource, didInitialSet, cssSourceEditor.current, htmlSourceEditor.current])

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

  const dispatch: StoreDispatch = useMemo(() => ({
    toggleSelectRules(ruleIds: string[]) {
      setViewState(prev => {
        if (ruleIds.length === prev.selectedRuleIds.size) {
          if (ruleIds.every(existingId => prev.selectedRuleIds.has(existingId))) {
            return prev
          }
        }
        // TODO: FIX
        prev.selectedRuleIds = new Set(ruleIds)
        return { ...prev, selectedRuleIds: new Set(ruleIds) }
      })
    },
    updateEasing(styleRuleId, keyframeIndex, curve) {
      const matchingRule = storeRef.current.styleRules.find(rule => rule.id === styleRuleId)
      if (matchingRule == null) { return }

      const keyframe = matchingRule.keyframes[keyframeIndex]
      const nodes = dispatch?.getMatchingKeyframeSyntaxNode(matchingRule.animationName)
      if (cssSourceEditor.current == null || keyframe == null) { return }
      const { language, editor } = cssSourceEditor.current
      // debugSyntaxTree(editor.state)
      // TODO: Support to / from
      const targetStringOffset = `${keyframe.progress * 100}%`
      const keyframeListNode = nodes?.block.getChild('KeyframeList')
      let currentNode = keyframeListNode?.firstChild
      let numberBlock = 0
      let targetBlock: SyntaxNode | undefined = undefined
      // debugSyntaxTree(editor.state)
      while ((currentNode = currentNode?.nextSibling)) {
        // console.log(currentNode.type.name, currentNode.name, '⚠')
        if (currentNode.type.name === 'Block') {
          if (numberBlock > keyframeIndex) {
            targetBlock = currentNode
            break
          } else {
            continue
          }
        }
        if (currentNode.type.name === 'NumberLiteral' || currentNode.type.name === 'from' || currentNode.type.name === 'to') {
          numberBlock++
          continue
        }
      }
      const blockNode = targetBlock
      if (blockNode == null) {
        console.warn('no block found')
        return
      }
      const declarationNodes = blockNode?.getChildren('Declaration')
      const declarationNode = declarationNodes?.find(node => {
        const nameNode = node.getChild('PropertyName')
        if (nameNode) {
          const propName = editor.state.sliceDoc(nameNode.from, nameNode.to)
          return propName === 'animation-timing-function'
        }
      })
      const propertyValueNode = declarationNode?.getChild(':')?.nextSibling
      if (propertyValueNode) {
        editor.dispatch({
          changes: [{ from: propertyValueNode.from, to: propertyValueNode.to, insert: `cubic-bezier(${curve})` }],
        })
      } else {
        const openBracketNode = blockNode.getChild('{')
        if (openBracketNode != null) {
          editor.dispatch({
            changes: [{ from: openBracketNode.to, insert: `\n    animation-timing-function: cubic-bezier(${curve});` }],
          })
        }
      }
      // const frameOffsetNodes = keyframeListNode?.getChildren('NumberLiteral', '{')
      // const frameOffsetNode = frameOffsetNodes?.find(node => {
      //   const value = editor.state.doc.sliceString(node.from, node.to)
      //   if (value === targetStringOffset) {
      //     return true
      //   }
      // })
      // if (frameOffsetNode == null) {
      //   console.warn('No matching keyframe found')
      //   return
      // }

      // let blockNode = null
      // let nextNode = frameOffsetNode.nextSibling
      // while (nextNode) {
      //   if (nextNode.name === 'Block') {
      //     blockNode = nextNode
      //     break
      //   }
      // }
      // if (blockNode == null) { return }
      // const blockNode = frameOffsetNode?
      // console.log(keyframeListNode?.getChildren('Block', undefined, frameOffsetNode))
      // frameOffsetNode.getChildren('Block', undefined, frameOffsetNode.type.in)

      // console.log(nodes?.block.getChild('KeyframeList'))
      dispatch.updateRulePropertyValue(matchingRule.animationName, (propertyName, children) => {
        if (cssSourceEditor.current == null) { return }
        const { language, editor } = cssSourceEditor.current
        let currentAnimationIndex = 0

        switch (propertyName) {
          case 'animation': {
            for (const child of children) {
              if (child.type.name === ',') { currentAnimationIndex++; continue }
              if (currentAnimationIndex !== matchingRule.animationIndex) { continue }
              if (child.name === 'CallExpression') {
                const curveRaw = editor.state.doc.sliceString(child.from, child.to)
                if (!curveRaw.startsWith('cubic-bezier')) { return }
                const curveStr = `cubic-bezier(${curve})`
                return {
                  selection: { anchor: child.from, head: child.from + (curveStr.length) },
                  changes: [{ from: child.from, to: child.to, insert: curveStr }],
                }
              } else if (child.name === 'ValueName') {
                const curveName = editor.state.doc.sliceString(child.from, child.to)
                const curve = NamedCurves[curveName]
                const curveStr = `  cubic-bezier(${curve})`
                if (curve != null) {
                  return {
                    selection: { anchor: child.from, head: child.from + (curveStr.length) },
                    changes: [{ from: child.from, to: child.to, insert: curveStr }],
                  }
                }
              }
            }
            break
          }
        }
      })
    },
    computeRules(rules: CSSRuleList | undefined) {
      if (rules == null) { return }
      setViewState(viewState => {
        const newRules = _computeRules(rules, viewState)
        return newRules
      })
    },
    updateRulePropertyValue(selector: string, replaceNode: ReplaceNodeFn): boolean {
      const nodes = dispatch?.getMatchingRuleSyntaxNode(selector)
      if (nodes != null) {
        const children = nodes.block.getChildren('Declaration')?.reverse()

        const result = children.reduce<TransactionSpec | undefined>((result, child) => {
          if (result) { return result }
          let nextSibling = child.firstChild
          const editorState = cssSourceEditor.current?.editor.state

          if (nextSibling == null || editorState == null) { return result }

          const propertyName = editorState.sliceDoc(nextSibling.from, nextSibling.to)
          const candidates: SyntaxNode[] = []

          while ((nextSibling = nextSibling.nextSibling)) {
            candidates.push(nextSibling)
          }

          return replaceNode(propertyName, candidates)
        }, undefined)

        if (result) {
          cssSourceEditor.current?.editor.dispatch(result)
          return true
        }
      }
      return false
    },

    getMatchingKeyframeSyntaxNode(animationName: string): { ruleSet: SyntaxNode, block: SyntaxNode } | null {
      if (cssSourceEditor.current == null) { return null }
      const { language, editor } = cssSourceEditor.current
      const editorState = cssSourceEditor.current?.editor.state

      const tree = syntaxTree(editor.state)
      function traverse(node: SyntaxNode | null): { ruleSet: SyntaxNode, block: SyntaxNode } | null {
        if (node == null) { return null }

        // KeyframesStatement keyframes KeyframeName KeyframeList
        // console.log(node.type.name, editorState?.sliceDoc(node.from, node.to))

        if (node.type.name === 'KeyframesStatement') {
          const blockNode = node.getChild('KeyframeName')
          const animName = blockNode && editorState?.sliceDoc(blockNode.from, blockNode.to)
          if (animName === animationName) {
            return { ruleSet: node, block: node }
          }
        }
        return (
          (
            // console.log('down'),
            traverse(node.firstChild)
          ) ||
          (
            // console.log('over'),
            traverse(node.nextSibling)
          )
        )
      }
      return traverse(tree.topNode)
    },

    getMatchingRuleSyntaxNode(selector: string): { ruleSet: SyntaxNode, block: SyntaxNode } | null {
      if (cssSourceEditor.current == null) { return null }
      const { editor } = cssSourceEditor.current

      const selectorNormalized = selector.replaceAll(' ', '')

      let ruleSetNode: SyntaxNode | undefined
      let blockNode: SyntaxNode | undefined

      syntaxTree(editor.state).iterate({
        enter: node => {
          if (ruleSetNode && blockNode) { return false }
          if (node.type.name === 'RuleSet') {
            ruleSetNode = node.node
          } else if (ruleSetNode && blockNode == null && node.type.name === 'Block') {
            const selectorText = editor.state.sliceDoc(ruleSetNode.from, node.node.from).replaceAll(/(\n|\s)/g, '')
            if (selectorText === selectorNormalized) {
              blockNode = node.node
              return false
            }
          }
        },
        leave: node => {
          if (node.type.name === 'RuleSet' && blockNode == null) {
            ruleSetNode = undefined
            blockNode = undefined
          }
        },
      })

      if (ruleSetNode && blockNode) {
        return { ruleSet: ruleSetNode.node, block: blockNode.node }
      }
      return null
    },

    onChangeDelay(styleRuleId: string, delayMs: number) {
      const draggedRule = storeRef.current.styleRules.find(rule => rule.id === styleRuleId)
      if (draggedRule == null) { return }
      storeRef.current.styleRules.filter(rule => storeRef.current.selectedRuleIds.has(rule.id)).forEach(rule => {
        const offsetDelay = delayMs - (draggedRule.delay - rule.delay)
        if (rule.type === 'transition') {
          dispatch?.updateRulePropertyValue(rule.selector, (propertyName, children) => {
            let currentAnimationIndex = 0
            switch (propertyName) {
              case 'transition': {
                for (const child of children) {
                  if (child.type.name === ',') { currentAnimationIndex++; continue }
                  if (currentAnimationIndex !== rule.animationIndex) { continue }
                  if (child.name === 'NumberLiteral') {
                    const nextChild = child.nextSibling
                    if (nextChild?.type.name === 'NumberLiteral') {
                      return {
                        selection: { anchor: nextChild.from, head: nextChild.from + (`${offsetDelay}ms`.length) },
                        changes: [{ from: nextChild.from, to: nextChild.to, insert: `${offsetDelay}ms` }],
                      }
                    } else {
                      return {
                        selection: { anchor: child.from, head: child.to },
                        changes: [{ from: child.to, insert: ` ${offsetDelay}ms` }],
                      }
                    }
                  }
                }
                break
              }
              case 'transition-delay': {
                for (const child of children) {
                  if (child.name === 'NumberLiteral') {
                    return {
                      selection: { anchor: child.from, head: child.to },
                      changes: [{ from: child.from, to: child.to, insert: `${offsetDelay}ms` }],
                    }
                  }
                }
                break
              }
            }
            return undefined
          })
        } else if (rule.type === 'animation') {
          dispatch?.updateRulePropertyValue(rule.selector, (propertyName, children) => {
            let currentAnimationIndex = 0
            switch (propertyName) {
              case 'animation': {
                for (const child of children) {
                  if (child.type.name === ',') { currentAnimationIndex++; continue }
                  if (currentAnimationIndex !== rule.animationIndex) { continue }
                  if (child.name === 'NumberLiteral') {
                    const nextChild = child.nextSibling
                    if (nextChild != null && nextChild?.type.name === 'NumberLiteral') {
                      return {
                        selection: { anchor: nextChild.from, head: nextChild.from + (`${offsetDelay}ms`.length) },
                        changes: [{ from: nextChild.from, to: nextChild.to, insert: `${offsetDelay}ms` }],
                      }
                    } else {
                      return {
                        selection: { anchor: child.from, head: child.to },
                        changes: [{ from: child.to, insert: ` ${offsetDelay}ms` }],
                      }
                    }
                  }
                }
                break
              }
              case 'animation-delay': {
                for (const child of children) {
                  if (child.type.name === ',') { currentAnimationIndex++; continue }
                  if (currentAnimationIndex !== rule.animationIndex) { continue }
                  if (child.name === 'NumberLiteral') {
                    return {
                      selection: { anchor: child.from, head: child.to + (`${offsetDelay}ms`.length) },
                      changes: [{ from: child.from, to: child.to, insert: `${offsetDelay}ms` }],
                    }
                  }
                }
                break
              }
            }
            return undefined
          })
        }
      })
    },

    onChangeDuration(styleRuleId: string, durationMs: number) {
      const draggedRule = storeRef.current.styleRules.find(rule => rule.id === styleRuleId)
      if (draggedRule == null) { return }
      storeRef.current.styleRules.filter(rule => storeRef.current.selectedRuleIds.has(rule.id)).forEach(rule => {
        const offsetDuration = Math.max(0, durationMs - (draggedRule.duration - rule.duration))
        if (rule.type === 'transition') {
        // rule.cssrule.style.setProperty('transition-duration', `${durationMs}ms`)
          dispatch?.updateRulePropertyValue(rule.selector, (propertyName, children) => {
            let currentAnimationIndex = 0

            switch (propertyName) {
              case 'transition': {
                for (const child of children) {
                  if (child.type.name === ',') { currentAnimationIndex++; continue }
                  if (currentAnimationIndex !== rule.animationIndex) { continue }
                  if (child.name === 'NumberLiteral') {
                    return {
                      selection: { anchor: child.from, head: child.to + (`${offsetDuration}ms`.length) },
                      changes: [{ from: child.from, to: child.to, insert: `${offsetDuration}ms` }],
                    }
                  }
                }
                break
              }
              case 'transition-duration': {
                for (const child of children) {
                  if (child.type.name === ',') { currentAnimationIndex++; continue }
                  if (currentAnimationIndex !== rule.animationIndex) { continue }
                  if (child.name === 'NumberLiteral') {
                    return {
                      selection: { anchor: child.from, head: child.to + (`${offsetDuration}ms`.length) },
                      changes: [{ from: child.from, to: child.to, insert: `${offsetDuration}ms` }],
                    }
                  }
                }
                break
              }
            }
          })
        } else if (rule.type === 'animation') {
          dispatch?.updateRulePropertyValue(rule.selector, (propertyName, children) => {
            let currentAnimationIndex = 0

            switch (propertyName) {
              case 'animation': {
                for (const child of children) {
                  if (child.type.name === ',') { currentAnimationIndex++; continue }
                  if (currentAnimationIndex !== rule.animationIndex) { continue }
                  if (child.name === 'NumberLiteral') {
                    return {
                      selection: { anchor: child.from, head: child.to + (`${offsetDuration}ms`.length) },
                      changes: [{ from: child.from, to: child.to, insert: `${offsetDuration}ms` }],
                    }
                  }
                }
                break
              }
              case 'animation-duration': {
                for (const child of children) {
                  if (child.type.name === ',') { currentAnimationIndex++; continue }
                  if (currentAnimationIndex !== rule.animationIndex) { continue }

                  if (child.name === 'NumberLiteral') {
                    return {
                      selection: { anchor: child.from, head: child.to + (`${offsetDuration}ms`.length) },
                      changes: [{ from: child.from, to: child.to, insert: `${offsetDuration}ms` }],
                    }
                  }
                }
                break
              }
            }
          })
        }
      })
    },

    highlightRule(rule: StyleRule) {
      const nodes = dispatch?.getMatchingRuleSyntaxNode(rule.selector)
      if (nodes == null) { return }
      cssSourceEditor.current?.editor.dispatch({
        effects: [
          EditorEffect.Spotlight.of({ from: nodes.ruleSet.from, to: nodes.ruleSet.to }),
          EditorView.scrollIntoView(EditorSelection.range(nodes.ruleSet.from, nodes.ruleSet.to), { y: 'center' }),
        ],
      })
    },

    highlightAnimationSource(rule: StyleRule) {
      const nodes = dispatch?.getMatchingKeyframeSyntaxNode(rule.animationName)
      if (nodes == null) { return }
      cssSourceEditor.current?.editor.dispatch({
        effects: [
          EditorEffect.Spotlight.of({ from: nodes.ruleSet.from, to: nodes.ruleSet.to }),
          EditorView.scrollIntoView(EditorSelection.range(nodes.ruleSet.from, nodes.ruleSet.to), { y: 'center' }),
        ],
      })
    },

    removeHighlight() {
      cssSourceEditor.current?.editor.dispatch({
        effects: [
          EditorEffect.ClearSpotlight.of(),
        ],
      })
    },
  }), [])

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
        animationControlsRef.current.toggle()
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
  }, [cloneProjectData, editorsAreFocused, setPanelSize, upsertData])

  useLayoutEffect(() => {
    if (didMount.current) { return }
    if (htmlEditorRef.current == null || cssEditorRef.current == null) { return }
    didMount.current = true

    htmlSourceEditor.current = new EditorView({
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
    })

    const { editor, language } = initializeCSSEditor({
      element: cssEditorRef.current,
      onChange: update => {
        reducerDispatch({ type: 'UPDATE_LOCAL', cssSource: update.state.sliceDoc() })
      },
    })

    cssSourceEditor.current = { editor, language }
  }, [])

  const stylesheetController = useRef<CSSStyleSheet | null>(null)
  const styleEl = useRef<HTMLStyleElement | null>(null)
  useLayoutEffect(() => {
    const iframeEl = iframeRef.current

    if (iframeEl == null) { return }
    let unsub: (() => void) | undefined = undefined
    const updateStyleEl = (() => {
      if (iframeEl.contentDocument == null) { return }
      const style = document.createElement('style')
      // WebKit hack :(
      style.appendChild(document.createTextNode(''))
      iframeEl.contentDocument?.head.appendChild(style)
      stylesheetController.current = style.sheet
      styleEl.current = style

      animationControlsRef.current = generateAnimationControls(iframeEl.contentDocument)
      unsub = animationControlsRef.current.onChange(({ status, offsetTime }) => {
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
    })

    if (isFirefox()) {
      iframeEl.addEventListener('load', updateStyleEl)
    } else {
      updateStyleEl()
    }

    return () => {
      unsub?.()
    }
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

  const updateHMTL = useCallback((htmlSource: string) => {
    const documentBody = iframeRef.current?.contentDocument?.body
    if (documentBody == null) { return }
    documentBody.innerHTML = htmlSource
    animationControlsRef.current.reset()
  }, [])

  const debouncedUpdate = useMemo(() => debounce((html: string) => {
    updateHMTL(htmlSource)
  }, 500, { leading: false }), [htmlSource, updateHMTL])

  useLayoutEffect(() => {
    debouncedUpdate(htmlSource)
  }, [debouncedUpdate, htmlSource])

  useLayoutEffect(() => {
    updateHMTL(htmlSource)
  // This is hard trigger, probably should move to onclick handler
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshCounter, updateHMTL])

  useLayoutEffect(() => {
    if (styleEl.current != null) {
      styleEl.current.textContent = ''
      if (styleEl.current == null) { return }
      styleEl.current.textContent = cssSource
      const rules = styleEl.current.sheet?.cssRules
      if (rules == null) { return }

      setViewState(prev => _computeRules(rules, prev))
    }
  }, [cssSource])

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
            <div ref={controlStateLabelRef} className={styles.floatingLiveContainerButton} onClick={() => animationControlsRef.current.toggle()} style={{ textShadow: '1px 1px black', backgroundColor: 'transparent', marginRight: 8, color: 'greenyellow', height: 20 }}>running</div>
          </div>
          <iframe
            className={styles.liveDemoIframe}
            src="about:blank"
            sandbox={SANDBOX_CONFIG}
            title="live code"
            loading="lazy"
            ref={iframeRef}
          />
        </div>
      </div>
      <div className={styles.timelineContainer} ref={timelineContainerRef}>
        <ControlPanel
          onResize={onResizeControlPanel}
          controls={animationControlsRef}
          { ...viewState }
          totalLengthMs={Math.max(viewState.totalLengthMs, 500)}
          dispatch={dispatch}
          editorsAreFocused={editorsAreFocused}
        />
      </div>
    </div>
  )
}

export function StarCount({ project }: { project: API.UserProjectJoin }) {
  const session = useContext(SessionContext)
  const [starCount, setStarCount] = useState<number>(parseInt(project.star_count, 10))
  const currentUserStarredProject = session.stars && (session.stars.find(star => star.project_id === project.id) != null)
  const [showLoginModal, setShowLoginModal] = useState(false)

  function handleClick(e: React.MouseEvent<HTMLButtonElement>) {
    e.stopPropagation()
    e.preventDefault()
    e.nativeEvent.stopImmediatePropagation()
    if (session.username == null) {
      return setShowLoginModal(true)
    }
    if (currentUserStarredProject == null) { return }
    if (currentUserStarredProject) {
      session.starProject(project.id, false).then(() => setStarCount(count => --count))
    } else {
      session.starProject(project.id, true).then(() => setStarCount(count => ++count))
    }
  }

  return (
    <button className={classNames(sharedStyles.flexRow, styles.starButton)} style={{ color: currentUserStarredProject ? 'gold' : 'gray' }} onClick={handleClick}>
      {starCount}
      {showLoginModal && <PromptLoginModal message="Create an account to star projects" onCancel={() => setShowLoginModal(false)} />}
      <StarIcon style={{ height: 14, marginLeft: 7 }} />
    </button>
  )
}

export function AppHeader({ leftItem, centerItem, hasUnsavedChanges = false }: { hasUnsavedChanges?: boolean, leftItem?: React.ReactNode, centerItem?: React.ReactNode }) {
  const session = useContext(SessionContext)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const navigate = useNavigate()
  const [showLogoutModal, setShowLogoutModal] = useState(false)
  const [showHelpModal, setShowHelpModal] = useState(false)
  const [showNavigateWarningModal, setShowNavigateWarningModal] = useState<{ path: string }>()
  const match = useMatch({ path: '/p/:projectId' })

  function handleNavigate(to: string) {
    if (hasUnsavedChanges) {
      setShowNavigateWarningModal({ path: to })
    } else {
      navigate(to)
    }
  }

  return (
    <div className={styles.pageHeaderRow}>
      <div className={sharedStyles.flexRow} style={{ flexGrow: 1, flexBasis: 1, flexShrink: 0 }}>
        {leftItem}
      </div>
      <div className={sharedStyles.flexRow} style={{ flexGrow: 0, flexShrink: 0 }}>
        {centerItem}
      </div>
      {showNavigateWarningModal && (
        <GenericPromptModal
          cancelMessage="Stay on this page"
          confirmMessage="Leave page"
          message={'This page has unsaved changes.\nAre you sure you want to leave?'}
          title="Unsaved Changes"
          onCancel={() => setShowNavigateWarningModal(undefined)}
          onConfirm={() => navigate(showNavigateWarningModal.path)}
        />
      )}
      {showHelpModal && (
        <HelpModal onCancel={() => {
          setShowHelpModal(false)
        }} />
      )}
      {showLogoutModal && (
        <LogoutModal onCancel={() => setShowLogoutModal(false)} />
      )}
      {session.user && (
        <div style={{ flexGrow: 1, flexBasis: 1, flexShrink: 0, textAlign: 'right' }}>logged in as
          <Popover
            isVisible={dropdownOpen}
            onBlur={() => setDropdownOpen(false)}
            anchor={(
              <button className={styles.usernameButton} style={{ color: dropdownOpen ? 'gray' : '' }} onClick={() => setDropdownOpen(open => !open)}>
                <span>{session.user.username}</span>
              </button>
            )}
            anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
            transformOrigin={{ horizontal: 'right', vertical: 'top' }}
          >
            <Dropdown
              options={[
                { title: 'Your projects', onClick: () => {
                  setDropdownOpen(false)
                  handleNavigate('/yours')
                }},
                { title: 'Community', onClick: () => {
                  setDropdownOpen(false)
                  handleNavigate('/top')
                }},
                { title: 'Help',
                  onClick: () => {
                    setDropdownOpen(false)
                    setShowHelpModal(true)
                  },
                },
                { title: 'Local Sandbox',
                  onClick: () => {
                    setDropdownOpen(false)
                    handleNavigate('/p/draft')
                  },
                },
                {
                  title: 'Log out',
                  onClick: () => {
                    setDropdownOpen(false)
                    setShowLogoutModal(true)
                  },
                },
              ]}
            />
          </Popover>
        </div>
      )}
      {!session.user && (
        <div  style={{ flexGrow: 1, flexBasis: 1, flexShrink: 0, textAlign: 'right', justifyContent: 'flex-end' }} className={sharedStyles.flexRow}>
          {match != null && (
            <>
              <a href="/" className={styles.usernameButton} style={{ textDecoration: 'none', color: dropdownOpen ? 'gray' : '', marginRight: 5 }} onClick={() => setDropdownOpen(open => !open)}>Back to Homepage</a>
              •
            </>
          )}
          {!session.offlineMode && (
            <a href="/oauth" className={styles.usernameButton} style={{ color: dropdownOpen ? 'gray' : '' }} onClick={() => setDropdownOpen(open => !open)}>
              Sign in with github
            </a>
          )}
        </div>
      )}
    </div>
  )
}

export function Dropdown({ options }: { options: { title: string, onClick: () => any }[] }) {
  return (
    <div className={styles.dropdownContainer}>
      {options.map(option => (
        <button
          className={styles.dropdownItem}
          key={option.title}
          onClick={() => option.onClick()}
        >
          {option.title}
        </button>
      ))}
    </div>
  )
}

export function parseDurationMs(duration: string) {
  const value = parseFloat(duration) || 0
  return value * (duration.includes('ms') ? 1 : 1000)
}

export const NamedBezierCurves: { [key: string]: TimelineBezierEasing } = {
  'ease': { type: 'curve', cps: [[0.25, 0.1], [0.25, 1.0]] },
  'linear': { type: 'curve', cps: [[0.25, 0.25], [0.75, 0.75]] },
  'ease-in': { type: 'curve', cps: [[0.42, 0], [1.0, 1.0]] },
  'ease-out': { type: 'curve', cps: [[0, 0], [0.58, 1.0]] },
  'ease-in-out': { type: 'curve', cps: [[0.42, 0], [0.58, 1.0]] },
}

export const NamedStepCurves: { [key: string]: TimelineStepEasing } = {
  'step-start': { type: 'steps', steps: 1, jumpTerm: 'jump-start' },
  'step-end': { type: 'steps', steps: 1, jumpTerm: 'jump-end' },
}

export const NamedCurves: { [key: string]: TimelineEasing } = {
  ...NamedBezierCurves,
  ...NamedStepCurves,
}

const jumpTermMap: { [key: string]: TimelineJumpTerm | undefined } = {
  'jump-start': 'jump-start',
  'jump-end': 'jump-end',
  'jump-none': 'jump-none',
  'jump-both': 'jump-both',
  'start': 'jump-start',
  'end': 'jump-end',
}

export function parseCurve(timingFunction?: string): TimelineEasing {
  if (timingFunction == null) { return NamedCurves.ease }
  const namedCurve = NamedCurves[timingFunction]
  if (namedCurve) { return namedCurve }
  const steps = timingFunction.match(/steps\((\d),?\s*(.*)\s*\)/)
  if (steps) {
    return {
      type: 'steps',
      steps: parseInt(steps[1]),
      jumpTerm: jumpTermMap[steps[2]] ?? 'jump-end',
    }
  }
  if (timingFunction.includes('cubic-bezier')) {
    const controlPoints = timingFunction.match(/-?(\d|\.)+/g)?.map(val => parseFloat(val))
    if (controlPoints?.length === 4 && !controlPoints.some(val => isNaN(val))) {
      return { type: 'curve', cps: [[controlPoints[0], controlPoints[1]], [controlPoints[2], controlPoints[3]]] }
    }
    // console.error('Could not parse curve', controlPoints, timingFunction)
  }
  return NamedCurves.ease
}

function parseFillMode(fillModeIn: string) {
  switch (fillModeIn) {
    case 'none':
    case 'backwards':
    case 'forwards':
    case 'both':
      return fillModeIn
    default: return 'none'
  }
}

function parseDirection(directionIn: string) {
  switch (directionIn) {
    case 'normal':
    case 'reverse':
    case 'alternate':
      return directionIn
    default: return 'normal'
  }
}

const NUM_BASE_COLORS = 10
const baseColors = range(NUM_BASE_COLORS).map(() => getColor())

function serializeEasing(easing: TimelineEasing) {
  if (easing.type === 'curve') {
    return `cubic-bezier(${easing.cps[0][0]},${easing.cps[0][1]},${easing.cps[1][0]},${easing.cps[1][1]})`
  }
  if (easing.type === 'steps') {
    return `steps(${easing.steps}, ${easing.jumpTerm})`
  }
  return ''
}

export function _computeRules(rules: CSSRuleList, prevState?: ViewState): ViewState {
  const keyframeAnimationRules = Array.from(rules).filter((rule): rule is CSSKeyframesRule => rule instanceof CSSKeyframesRule)
  const cssStyleRules = Array.from(rules).filter((rule): rule is CSSStyleRule => rule instanceof CSSStyleRule && !!(rule.style.animationName || rule.style.transitionProperty))
  const animationKeyFrames = keyframeAnimationRules.reduce<{ [animationName: string]: Optional<TimelineKeyframe, 'curve'>[] }>((animations, keyframesRule) => {
    const keyframes = (Array.from(keyframesRule.cssRules) as CSSKeyframeRule[]).flatMap((rule) => {
      const keyText = rule.keyText

      /**
       * Fill out style rules for this frame to be applied to all matching
       * ala 0%, 50% { background-color: white; }
       *
       * NOTE: Pulling styles by iterating thru the style rule items does
       * not seem to be working so we are doing this here instead.
       * ```
       * // THIS APPROACH MISSES PROPERTIES SOMETIMES, NO IDEA WHY :(
       * for (let j = 0; j < styleRule.length; j++) {
       *   const name = styleRule.item(j)
       */
      const frameRules: Keyframe = {}
      const pairs = (
        rule.cssText.match(/\s*([^{]+)\s*\{\s*([^}]*?)\s*}/)?.[2]?.split(';')
          .map(val => {
            const pairs = val.split(':')
            return [pairs[0].trim(), pairs.slice(1).join(':').trim()]
          })
          .filter(val => val[0] && val[1])
      ) ?? []

      for (const [name, val] of pairs) {
        frameRules[camelCase(name)] = val
      }

      const progressStrings = keyText.split(',')
      return progressStrings.map(progressString => {
        const progress = (() => {
          if (progressString === 'from') return 0
          if (progressString === 'to') return 1
          return parseFloat(progressString) / 100
        })()
        const curve = rule?.style.animationTimingFunction ? parseCurve(rule.style.animationTimingFunction) : undefined
        /**
         * Fill out style rules for this frame to be applied to all matching
         */
        return {
          progress,
          curve: rule?.style.animationTimingFunction ? parseCurve(rule.style.animationTimingFunction) : undefined,
          frame: { ...frameRules, easing: curve && serializeEasing(curve), offset: progress },
        }
      })
    })

    const sorted = keyframes.sort((a, b) => a.progress - b.progress)

    return {
      ...animations,
      [keyframesRule.name]: sorted,
    }
  }, {})

  const addedAlreadyIds = new Set<string>()

  let totalLengthMs = 5
  const styleRules: StyleRule[] = cssStyleRules.reduce((styleRules, rule, i) => {
    if (rule.style.animationName) {
      const animationNames = rule.style.animationName.split(', ')
      const durations = rule.style.animationDuration.split(', ')
      const delays = rule.style.animationDelay.split(', ')
      const directions = rule.style.animationDirection.split(', ')
      const fillModes = rule.style.animationFillMode.split(', ')
      const curves = splitTimingFunctions(rule.style.animationTimingFunction)
      const iterations = rule.style.animationIterationCount.split(', ')
      animationNames.forEach((animationName, j) => {
        const duration = parseDurationMs(durations[j] ?? durations[durations.length - 1]) || 1
        const delay = parseDurationMs(delays[j] ?? delays[delays.length - 1])
        const curve = parseCurve(curves[j] ?? curves[curves.length - 1])
        const direction = parseDirection(directions[j])
        const fillMode = parseFillMode(fillModes[j])
        const iteration = iterations[j] === 'infinite'
          ? undefined
          : parseInt(iterations[j]) || 1
        totalLengthMs = Math.max(totalLengthMs, delay + duration * (iteration || 1))
        const keyframes = (animationKeyFrames[animationName] ?? []).map(keyframe => {
          return {
            ...keyframe,
            curve: keyframe.curve ?? curve,
            frame: { ...keyframe.frame, easing: keyframe.frame.easing ?? serializeEasing(curve) },
          }
        })
        const animationId = `${animationName} ${rule.selectorText} ${j}`
        if (addedAlreadyIds.has(animationId)) {
          console.warn('Overriding animation id for', animationId)
          return
        }
        addedAlreadyIds.add(animationId)

        styleRules.push({
          duration,
          id: animationId,
          delay: delay,
          fillMode: fillMode,
          direction: direction,
          curve,
          easing: curves[j] ?? curves[curves.length - 1],
          selector: rule.selectorText,
          cssStyleRule: rule,
          animationName: animationName,
          animationIndex: j,
          iterationCount: iteration,
          keyframes,
          color: baseColors[styleRules.length % NUM_BASE_COLORS],
          type: 'animation',
        } as StyleRule)
      })
    }

    if (rule.style.transitionProperty) {
      const properties = rule.style.transitionProperty.split(', ')
      const durations = rule.style.transitionDuration.split(', ')
      const delays = rule.style.transitionDelay.split(', ')
      const curves = splitTimingFunctions(rule.style.transitionTimingFunction)

      properties.forEach((propertyName, j) => {
        const property = propertyName
        const duration = parseDurationMs(durations[j] ?? durations[durations.length - 1])
        const delay = parseDurationMs(delays[j] ?? delays[delays.length - 1])
        const curve = parseCurve(curves[j] ?? curves[curves.length - 1])
        const iterations = 1
        totalLengthMs = Math.max(totalLengthMs, delay + duration * iterations)

        styleRules.push({
          duration,
          delay: delay,
          curve,
          id: `${rule.selectorText} ${property} ${j}`,
          selector: rule.selectorText,
          animationName: `t ${property}`,
          direction: 'normal',
          fillMode: 'both',
          easing: curves[j] ?? curves[curves.length - 1],
          cssStyleRule: rule,
          animationIndex: j,
          iterationCount: 1,
          color: baseColors[styleRules.length % NUM_BASE_COLORS],
          keyframes: [{ progress: 0, curve }, { progress: 1, curve }],
          type: 'transition',
        } as StyleRule)
      })
    }

    return styleRules
  }, [] as StyleRule[])

  return { selectedRuleIds: prevState?.selectedRuleIds ?? new Set(), styleRules, totalLengthMs }
}

function splitTimingFunctions(timingFnString: string) {
  const result: string[] = []
  let item = ''
  let depth = 0

  function push() { if (item) result.push(item); item = '' }

  for (let i = 0; i < timingFnString.length; i++) {
    const c = timingFnString[i]
    if (!depth && c === ',') push()
    else {
      item += c
      if (c === '[') depth++
      if (c === ']') depth--
    }
  }

  push()
  return result
}
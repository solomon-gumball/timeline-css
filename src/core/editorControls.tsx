import { syntaxTree } from '@codemirror/language'
import { SyntaxNode } from '@lezer/common'
import { EditorView } from '@codemirror/view'
import { TransactionSpec, EditorSelection } from '@codemirror/state'
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { debounce } from 'lodash'
import { ControlPoints, NamedCurves, StyleRule, computeRules, getMaxRuleLength } from './parseStylesheet'
import { AnimationControls, generateAnimationControls, mockAnimationControls } from './animationControls'
import { isFirefox, useUpdateTrigger } from '../util'
import EditorEffect from '../codemirror/EditorEffect'

type ReplaceNodeFn = (propertyName: string, childNodes: SyntaxNode[]) => TransactionSpec | undefined

export type ViewState = {
  styleRules: StyleRule[],
  selectedRuleIds: Set<string>,
}

export type StoreDispatch = {
  onChangeDelay(styleRuleId: string, delayMs: number): void,
  onChangeDuration(styleRuleId: string, durationMs: number): void,
  highlightRule(rule: StyleRule): void,
  highlightAnimationSource(rule: StyleRule): void,
  removeHighlight(): void,
  toggleSelectRules(ruleIds: string[]): void,
  updateEasing(ruleId: string, keyframeIndex: number, curve: [[number, number], [number, number]]): void,
}

export default function useTimeline(cssSource: string, htmlSource: string, editor?: EditorView) {
  const [viewState, setViewState] = useState<ViewState>({ styleRules: [], selectedRuleIds: new Set() })
  const totalLengthMs = useMemo(() => getMaxRuleLength(viewState.styleRules) || 1000, [viewState.styleRules])
  const [animationControls, setAnimationControls] = useState<AnimationControls>(mockAnimationControls())
  const [iframeEl, updateIframeEl] = useState<HTMLIFrameElement | null>(null)
  const [triggerRefresh, refreshCounter] = useUpdateTrigger()

  const storeRef = useRef<ViewState>(viewState)
  storeRef.current = viewState

  useMemo(() => {
    animationControls.updateRules(viewState.styleRules)
  }, [animationControls, viewState.styleRules])

  const [styleEl, setStyleEl] = useState<HTMLStyleElement>()
  useLayoutEffect(() => {
    if (iframeEl == null) { return }
    const updateStyleEl = (() => {
      if (iframeEl.contentDocument == null) { return }
      const style = document.createElement('style')
      // WebKit hack :(
      style.appendChild(document.createTextNode(''))
      iframeEl.contentDocument?.head.appendChild(style)
      setStyleEl(style)

      setAnimationControls(generateAnimationControls(iframeEl.contentDocument))
    })

    if (isFirefox()) {
      iframeEl.addEventListener('load', updateStyleEl)
    } else {
      updateStyleEl()
    }
  }, [iframeEl])

  const updateHMTL = useCallback((htmlSource: string) => {
    const documentBody = iframeEl?.contentDocument?.body
    if (documentBody == null) { return }
    documentBody.innerHTML = htmlSource
    animationControls.reset()
  }, [animationControls, iframeEl?.contentDocument?.body])

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
    if (styleEl != null) {
      styleEl.textContent = ''
      styleEl.textContent = cssSource
      const rules = styleEl.sheet?.cssRules
      if (rules == null) { return }

      setViewState(prev => ({ ...prev, styleRules: computeRules(rules) }))
    }
  }, [cssSource, styleEl])

  const getMatchingKeyframeSyntaxNode = useCallback((animationName: string): { ruleSet: SyntaxNode, block: SyntaxNode } | null => {
    if (editor == null) { return null }
    const tree = syntaxTree(editor.state)
    function traverse(node: SyntaxNode | null): { ruleSet: SyntaxNode, block: SyntaxNode } | null {
      if (node == null) { return null }

      if (node.type.name === 'KeyframesStatement') {
        const blockNode = node.getChild('KeyframeName')
        const animName = blockNode && editor?.state.sliceDoc(blockNode.from, blockNode.to)
        if (animName === animationName) {
          return { ruleSet: node, block: node }
        }
      }
      return traverse(node.firstChild) || traverse(node.nextSibling)
    }
    return traverse(tree.topNode)
  }, [editor])

  const getMatchingRuleSyntaxNode = useCallback((selector: string): { ruleSet: SyntaxNode, block: SyntaxNode } | null => {
    if (editor == null) { return null }
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
  }, [editor])

  const updateRulePropertyValue = useCallback((selector: string, replaceNode: ReplaceNodeFn): boolean => {
    const nodes = getMatchingRuleSyntaxNode(selector)
    if (nodes != null) {
      const children = nodes.block.getChildren('Declaration')?.reverse()

      const result = children.reduce<TransactionSpec | undefined>((result, child) => {
        if (result) { return result }
        let nextSibling = child.firstChild

        if (nextSibling == null || editor?.state == null) { return result }

        const propertyName = editor.state.sliceDoc(nextSibling.from, nextSibling.to)
        const candidates: SyntaxNode[] = []

        while ((nextSibling = nextSibling.nextSibling)) {
          candidates.push(nextSibling)
        }

        return replaceNode(propertyName, candidates)
      }, undefined)

      if (result) {
        editor?.dispatch(result)
        return true
      }
    }
    return false
  }, [editor, getMatchingRuleSyntaxNode])

  const controls: StoreDispatch = useMemo(() => ({
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
    updateEasing(styleRuleId: string, keyframeIndex: number, curve: ControlPoints) {
      const editorState = editor?.state
      const matchingRule = storeRef.current.styleRules.find(rule => rule.id === styleRuleId)
      const keyframe = matchingRule?.keyframes[keyframeIndex]
      if (keyframe == null || matchingRule == null || editorState == null) { return }

      const nodes = getMatchingKeyframeSyntaxNode(matchingRule.animationName)

      // TODO: Support to / from
      const keyframeListNode = nodes?.block.getChild('KeyframeList')
      let currentNode = keyframeListNode?.firstChild
      let numberBlock = 0
      let targetBlock: SyntaxNode | undefined = undefined
      while ((currentNode = currentNode?.nextSibling)) {
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
          const propName = editorState.sliceDoc(nameNode.from, nameNode.to)
          return propName === 'animation-timing-function'
        }
        return false
      })
      const propertyValueNode = declarationNode?.getChild(':')?.nextSibling
      if (propertyValueNode) {
        editor?.dispatch({
          changes: [{ from: propertyValueNode.from, to: propertyValueNode.to, insert: `cubic-bezier(${curve})` }],
        })
      } else {
        const openBracketNode = blockNode.getChild('{')
        if (openBracketNode != null) {
          editor?.dispatch({
            changes: [{ from: openBracketNode.to, insert: `\n    animation-timing-function: cubic-bezier(${curve});` }],
          })
        }
      }

      updateRulePropertyValue(matchingRule.animationName, (propertyName, children) => {
        let currentAnimationIndex = 0

        switch (propertyName) {
          case 'animation': {
            for (const child of children) {
              if (child.type.name === ',') { currentAnimationIndex++; continue }
              if (currentAnimationIndex !== matchingRule.animationIndex) { continue }
              if (child.name === 'CallExpression') {
                const curveRaw = editorState.doc.sliceString(child.from, child.to)
                if (!curveRaw.startsWith('cubic-bezier')) { return }
                const curveStr = `cubic-bezier(${curve})`
                return {
                  selection: { anchor: child.from, head: child.from + (curveStr.length) },
                  changes: [{ from: child.from, to: child.to, insert: curveStr }],
                }
              } else if (child.name === 'ValueName') {
                const curveName = editorState.doc.sliceString(child.from, child.to)
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

    onChangeDelay(styleRuleId: string, delayMs: number) {
      const draggedRule = storeRef.current.styleRules.find(rule => rule.id === styleRuleId)
      if (draggedRule == null) { return }
      storeRef.current.styleRules.filter(rule => storeRef.current.selectedRuleIds.has(rule.id)).forEach(rule => {
        const offsetDelay = delayMs - (draggedRule.delay - rule.delay)
        if (rule.type === 'transition') {
          updateRulePropertyValue(rule.selector, (propertyName, children) => {
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
          updateRulePropertyValue(rule.selector, (propertyName, children) => {
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
          updateRulePropertyValue(rule.selector, (propertyName, children) => {
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
          updateRulePropertyValue(rule.selector, (propertyName, children) => {
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
      const nodes = getMatchingRuleSyntaxNode(rule.selector)
      if (nodes == null) { return }
      editor?.dispatch({
        effects: [
          EditorEffect.Spotlight.of({ from: nodes.ruleSet.from, to: nodes.ruleSet.to }),
          EditorView.scrollIntoView(EditorSelection.range(nodes.ruleSet.from, nodes.ruleSet.to), { y: 'center' }),
        ],
      })
    },

    highlightAnimationSource(rule: StyleRule) {
      const nodes = getMatchingKeyframeSyntaxNode(rule.animationName)
      if (nodes == null) { return }
      editor?.dispatch({
        effects: [
          EditorEffect.Spotlight.of({ from: nodes.ruleSet.from, to: nodes.ruleSet.to }),
          EditorView.scrollIntoView(EditorSelection.range(nodes.ruleSet.from, nodes.ruleSet.to), { y: 'center' }),
        ],
      })
    },

    removeHighlight() {
      editor?.dispatch({
        effects: [
          EditorEffect.ClearSpotlight.of(),
        ],
      })
    },
  }), [editor, getMatchingKeyframeSyntaxNode, getMatchingRuleSyntaxNode, updateRulePropertyValue])

  return {
    dispatch: controls,
    animationControls,
    triggerRefresh,
    updateIframeEl,
    viewState,
    totalLengthMs,
  }
}
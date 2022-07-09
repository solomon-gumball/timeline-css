import { range, camelCase } from 'lodash'
import { Optional } from '../../types'
import { getColor } from '../util'

export type TimelineKeyframe = {
  progress: number,
  curve: TimelineEasing,
  frame: Keyframe,
}

export type ControlPoints = [[number, number], [number, number]]

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

export function computeRules(rules: CSSRuleList): StyleRule[] {
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

  return styleRules
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

export function getMaxRuleLength(rules: StyleRule[]) {
  return rules.reduce((totalLengthMs, rule) =>
    Math.max(totalLengthMs, rule.delay + rule.duration * (rule.iterationCount || 1))
  , 5)
}
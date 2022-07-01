import { StyleRule, parseDurationMs } from './parseStylesheet'

export type PlayState = { status: 'paused' | 'running', offsetTime: number }
type OnChangeCallback = (state: PlayState) => void
export interface AnimationControls {
  play: (offsetTime?: number) => void,
  pause: (offsetTime?: number) => void,
  onChange: (cb: OnChangeCallback) => () => void,
  toggle: () => void,
  reset: () => void,
  getState: () => PlayState,
  updateRules: (rules: StyleRule[]) => void,
}

export function generateAnimationControls(document: Document): AnimationControls {
  // const animations = document.getAnimations()
  let playState: PlayState = { status: 'running', offsetTime: 0 }
  let callbacks: OnChangeCallback[] = []
  let lastPlayedAt: number | undefined = Date.now()
  let animations: Animation[] = document.getAnimations()
  let animationSet = new Map<string, Animation>()
  let rules: StyleRule[] = []
  // Create an observer instance linked to the callback function
  // Select the node that will be observed for mutations
  const targetNode = document

  // Options for the observer (which mutations to observe)
  const config = { childList: true, subtree: true }
  // document.timeline = new DocumentTimeline({ originTime: 300 })
  // Callback function to execute when mutations are observed
  const callback: MutationCallback = function(mutationList, observer) {
    setTimeout(() => {
      document.getAnimations().forEach(animation => {
        if (!animation.id) {
          animation.cancel()
        }
      })
    })
  }

  const observer = new MutationObserver(callback)
  observer.observe(targetNode, config)

  const controls: AnimationControls = {
    toggle: () => {
      playState.status === 'paused' ? controls.play() : controls.pause()
    },
    pause: (offsetTime) => {
      animations.forEach(animation => {
        if (offsetTime != null) {
          animation.currentTime = offsetTime
        }
        animation.pause()
      })

      const totalElapsed = offsetTime ?? (lastPlayedAt ? (playState.offsetTime + Date.now() - lastPlayedAt) : playState.offsetTime)
      lastPlayedAt = undefined
      playState = { status: 'paused', offsetTime: totalElapsed }
      callbacks.forEach(cb => cb(playState))
    },
    play: (offsetTime) => {
      document.getAnimations().forEach(animation => {
        if (offsetTime != null) {
          animation.currentTime = offsetTime
        }
        if ((animation.currentTime ?? 0) < (animation.effect?.getComputedTiming().endTime ?? Infinity)) {
          animation.play()
        }
      })
      playState = { status: 'running', offsetTime: offsetTime ?? playState.offsetTime }
      lastPlayedAt = Date.now()
      callbacks.forEach(cb => cb(playState))
    },
    onChange(cb) {
      callbacks.push(cb)
      return () => callbacks = callbacks.filter(existing => cb !== existing)
    },
    updateRules(rulesArg) {
      rules = rulesArg
      const newAnimations: Animation[] = []
      const newAnimationMap = new Map<string, Animation>()

      rules.forEach(rule => {
        if (rule.type === 'transition') { return }
        const psuedoElMatch = rule.selector.match(/(.*)(::[a-zA-Z]+)$/)
        let selector = rule.selector
        let psuedoEl: string | undefined = undefined
        if (psuedoElMatch) {
          selector = psuedoElMatch[1]
          psuedoEl = psuedoElMatch[2]
        }
        const elements = document.querySelectorAll<HTMLElement>(selector)
        elements.forEach((element, id) => {
          const style = getComputedStyle(element, psuedoEl)
          const animationId = `${rule.id}...${id}`
          const keyframes = rule.keyframes.map((kf => kf.frame))
          const existing = animationSet.get(`${rule.id}...${id}`)
          const effect = existing?.effect as KeyframeEffect | null
          // TODO: Account for timing-fn and other properties as well here
          const duration = parseDurationMs(style.animationDuration.split(',')[rule.animationIndex]) || rule.duration
          const delay = parseDurationMs(style.animationDelay.split(',')[rule.animationIndex]) || rule.delay
          if (effect) {
            effect.setKeyframes(keyframes)
            effect.updateTiming({
              duration,
              delay,
              fill: rule.fillMode,
              iterations: rule.iterationCount ?? Infinity,
              direction: rule.direction,  // Safari broken
            })
            newAnimations.push(existing as Animation)
            newAnimationMap.set(animationId, existing as Animation)
            return
          }

          const animation = element.animate(keyframes, {
            duration,
            delay,
            fill: rule.fillMode,
            iterations: rule.iterationCount ?? Infinity,
            direction: rule.direction,
            id: animationId,
            pseudoElement: psuedoEl,
          })

          newAnimations.push(animation)
          newAnimationMap.set(animationId, animation)
          animation.currentTime = playState.offsetTime

          if (playState.status === 'paused') {
            animation.pause()
          } else {
            animation.play()
          }
        })
      })
      animations.forEach(anim => {
        if (!newAnimationMap.has(anim.id)) {
          anim.cancel()
        }
      })
      animations = newAnimations
      animationSet = newAnimationMap
    },
    reset() {
      lastPlayedAt = Date.now()
      playState = { status: 'running', offsetTime: 0 }
      callbacks.forEach(cb => cb(playState))
      animations = []
      animationSet = new Map()
      controls.updateRules(rules)
    },
    getState() {
      return playState
    },
  }
  return controls
}

export function mockAnimationControls(): AnimationControls {
  return {
    play: () => {},
    pause: () => {},
    onChange: () => () => {},
    toggle: () => {},
    reset: () => {},
    getState: () => ({ status: 'paused', offsetTime: 0 }),
    updateRules: () => {},
  }
}
import { StateEffect } from '@codemirror/state'

export default {
  Spotlight: StateEffect.define<{ from: number, to: number }>(),
  ClearSpotlight: StateEffect.define<void>(),
}
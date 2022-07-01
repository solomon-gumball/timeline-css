import { StateField, Range } from '@codemirror/state'
import { Decoration, DecorationSet, EditorView } from '@codemirror/view'
import { range } from 'lodash'
import { EditorEffect } from '../CodeEditor'
import styles from '../css/code-editor.scss'

const hideCodeMark = Decoration.mark({ class: styles.hideCode })
const highlight = Decoration.line({ class: styles.highlightCode })
const HighlightLine = StateField.define<DecorationSet>({
  create() { return Decoration.none },
  update(value, tr) {
    value = value.map(tr.changes)

    for (const effect of tr.effects) {
      if (effect.is(EditorEffect.Spotlight)) {
        const start = tr.state.doc.lineAt(effect.value.from).from
        const end = tr.state.doc.lineAt(effect.value.to).to
        value = value.update({
          add: [
            (effect.value.from !== 0) && hideCodeMark.range(0, effect.value.from),
            ...range(start, end).map((linePos) => {
              return highlight.range(linePos, linePos)
            }),
            (effect.value.to !== tr.state.doc.length) && hideCodeMark.range(effect.value.to, tr.state.doc.length),
          ].filter((val): val is Range<Decoration> => !!val),
          sort: true,
        })
      } else if (effect.is(EditorEffect.ClearSpotlight)) {
        value = Decoration.none
      }
    }

    return value
  },
  // Indicate that this field provides a set of decorations
  provide: f => EditorView.decorations.from(f),
})

export default HighlightLine
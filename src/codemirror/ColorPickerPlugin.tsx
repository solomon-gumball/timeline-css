import { SyntaxNode } from '@lezer/common'
import { syntaxTree } from '@codemirror/language'
import { WidgetType, EditorView, ViewPlugin, DecorationSet, Decoration, ViewUpdate } from '@codemirror/view'
import { Range } from '@codemirror/state'

import styles from '../css/code-editor.scss'
import cssBaseColors from '../css/cssBaseColors.json'

const colorsByName = cssBaseColors.reduce<{ [key: string]: { hex: string, rgb: string } }>((acc, color) => ({ ...acc, [color.name]: color }), {})

class ColorPickerWidget extends WidgetType {
  node: SyntaxNode
  value: string
  constructor(node: SyntaxNode, value: string) {
    super()
    this.node = node
    this.value = value
  }

  eq(other: ColorPickerWidget) { return other.value === this.value }

  destroy(dom: HTMLElement): void {
    // dom.removeEven
  }
  toDOM() {
    const colorPicker = document.createElement('input')
    colorPicker.classList.add(styles.colorPickerInput)
    colorPicker.type = 'color'
    colorPicker.value = this.value
    return colorPicker
  }

  ignoreEvent() { return false }
}

function colorPicker(view: EditorView) {
  const widgets: Range<Decoration>[] = []
  for (const {from, to} of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from, to,
      enter: (node) => {
        if (node.name === 'ValueName') {
          const colorValue = view.state.doc.sliceString(node.from, node.to)
          const colorRaw = colorsByName[colorValue]

          if (colorRaw) {
            const deco = Decoration.widget({
              widget: new ColorPickerWidget(node.node, colorRaw.hex),
              side: 1,
            })
            widgets.push(deco.range(node.to))
          }
        } else if (node.name === 'ColorLiteral') {
          const colorValue = view.state.doc.sliceString(node.from, node.to)
          if (colorValue) {
            const deco = Decoration.widget({
              widget: new ColorPickerWidget(node.node, colorValue),
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

export default ViewPlugin.fromClass(class {
  decorations: DecorationSet

  constructor(view: EditorView) {
    this.decorations = colorPicker(view)
  }

  update(update: ViewUpdate) {
    if (update.docChanged || update.viewportChanged)
      this.decorations = colorPicker(update.view)
  }
}, {
  decorations: v => v.decorations,

  eventHandlers: {
    change(e, view) {
      if (e.target instanceof HTMLInputElement) {
        const position = view.posAtDOM(e.target)
        const eventValue = e.target.value
        this.decorations.between(position, position, (from, to, decoration) => {
          const node = decoration.spec.widget.node
          view.dispatch({ changes: [{ from: node.from, to: node.to, insert: eventValue }] })
        })
      }
    },
  },
})
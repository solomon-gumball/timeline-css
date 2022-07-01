import { basicSetup } from '@codemirror/basic-setup'
import { cssLanguage } from '@codemirror/lang-css'
import { EditorState, StateEffect, Range } from '@codemirror/state'
import { EditorView, ViewUpdate, Decoration, DecorationSet, WidgetType, ViewPlugin } from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'
import { SyntaxNode } from '@lezer/common'
import { dracula } from './codeMirrorTheme'
import styles from './css/code-editor.scss'
import cssBaseColors from './css/cssBaseColors.json'
import BezierPlugin from './codemirror/BezierPlugin'
import HighlightLine from './codemirror/HighlightLine'
import ColorPickerPlugin from './codemirror/ColorPickerPlugin'

export const EditorEffect = {
  Spotlight: StateEffect.define<{ from: number, to: number }>(),
  ClearSpotlight: StateEffect.define<void>(),
}

export function initializeCSSEditor({ element, onChange, styleOverrides, editable = true }: { editable?: boolean, styleOverrides?: { [key: string]: any }, element: HTMLElement, onChange: (view: ViewUpdate) => void, fontSize?: number }) {
  const language = cssLanguage
  const editor = new EditorView({
    state: EditorState.create({
      extensions: [
        basicSetup,
        language,
        HighlightLine,
        dracula,
        ColorPickerPlugin,
        BezierPlugin,
        EditorView.editable.of(editable),
        EditorView.theme({
          '&': { height: '100%', 'border-radius': '4px', 'background-color': '#292929', ...styleOverrides },
        }),
        EditorView.updateListener.of(onChange),
      ],
    }),
    parent: element,
  })
  return { editor, language }
}

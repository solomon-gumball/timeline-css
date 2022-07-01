import { EditorView } from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'

/**
 * CodeMirror v6 Dracula theme
 */
const draculaTheme = /*@__PURE__*/EditorView.theme({
  '&': {
    color: 'white',
    border: 'none',
    backgroundColor: '#282a36 !important',
  },
  '.cm-gutters': {
    border: 'none',
    color: '#929292 !important',
    backgroundColor: '#282a36 !important',
  },
  '.cm-cursor, .cm-dropCursor': { 'border-left': 'solid thin #f8f8f0' },
  '.cm-linenumber': { 'color': '#6D8A88' },
  '.cm-selected': { 'background': 'rgba(255, 255, 255, 0.50)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': { background: 'rgba(255, 255, 255, 0.10)' },
  '.cm-activeLineGutter': { 'background': 'rgba(255,255,255,0.1)' },
  '.cm-activeLine': { 'background': 'none' },
  '.cm-selectionMatch': { 'background': 'none' },
  '.cm-matchingbracket': { 'text-decoration': 'underline', 'color': 'white !important' },
})

const PINK_RED = '#ff79c6'
const LIGHT_BLUE = '#66d9ef'
const PRIMARY_PURPLE = '#bd93f9'
const PRIMARY_GREEN = '#50fa7b'

const draculaHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: PINK_RED },
  { tag: [tags.name, tags.deleted, tags.character, tags.propertyName, tags.macroName], color: LIGHT_BLUE },
  { tag: [tags.function(tags.variableName), tags.labelName], color: PRIMARY_GREEN },
  { tag: [tags.tagName, tags.color, tags.constant(tags.name), tags.standard(tags.name)], color: PINK_RED },
  { tag: [tags.definition(tags.name)], color: PRIMARY_GREEN },
  { tag: [tags.attributeName], color: PRIMARY_GREEN },
  { tag: [tags.typeName, tags.className, tags.changed, tags.annotation, tags.modifier, tags.self, tags.namespace], color: PINK_RED },
  { tag: [tags.operator], color: 'white' },
  { tag: [tags.operatorKeyword, tags.url, tags.escape, tags.regexp, tags.link, tags.special(tags.string)], color: LIGHT_BLUE },
  { tag: [tags.modifier], color: PINK_RED },
  { tag: [tags.meta, tags.comment], color: '#6272a4' },
  { tag: tags.strong, fontWeight: 'bold' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.link, color: '#f1fa8c', textDecoration: 'underline' },
  { tag: tags.heading, fontWeight: 'bold', color: 'coral' },
  { tag: [tags.atom, tags.bool, /*@__PURE__*/tags.special(tags.variableName), tags.number], color: PRIMARY_PURPLE },
  { tag: [tags.string], color: '#f1fa8c' },
  { tag: tags.invalid, color: 'gray' },
])

export const dracula = [draculaTheme, syntaxHighlighting(draculaHighlightStyle)]
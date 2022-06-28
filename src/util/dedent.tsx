export default function dedent(
  strings: TemplateStringsArray,
  ...values: any[]
) {
  // $FlowFixMe: Flow doesn't undestand .raw
  const raw = typeof strings === 'string' ? [strings] : strings.raw

  // first, perform interpolation
  let result = ''
  for (let i = 0; i < raw.length; i++) {
    result += raw[i]
      // join lines when there is a suppressed newline
      .replace(/\\\n[ \t]*/g, '')
      // handle escaped backticks
      .replace(/\\`/g, '`')

    if (i < values.length) {
      result += values[i]
    }
  }

  // now strip indentation
  const lines = result.split('\n')
  let mindent: number | null = null
  lines.forEach(l => {
    const m = l.match(/^(\s+)\S+/)
    if (m) {
      const indent = m[1].length
      if (!mindent) {
        // this is the first indented line
        mindent = indent
      } else {
        mindent = Math.min(mindent, indent)
      }
    }
  })

  if (mindent !== null) {
    const m = mindent // appease Flow
    result = lines.map(l => l[0] === ' ' ? l.slice(m) : l).join('\n')
  }

  return result
    // dedent eats leading and trailing whitespace too
    .trim()
    // handle escaped newlines at the end to ensure they don't get stripped too
    .replace(/\\n/g, '\n')
}

export function getAffectingRules(element: HTMLElement): CSSStyleRule[] {
  const rules: CSSStyleRule[] = []

  for (const styleSheet of document.styleSheets) {
    // if (styleSheet.ownerNode !== document) { continue }
    for (const rule of styleSheet.cssRules) {
      if (rule instanceof CSSStyleRule) {
        const selectorText = rule.selectorText
        if (selectorText && selectorText.includes(':root')) {
          continue
        }
        if (element.matches(selectorText)) {
          rules.push(rule)
        }
      }
    }
  }
  return rules
}
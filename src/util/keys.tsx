import { useState, useLayoutEffect } from 'react'

export function useKeysPressed() {
  const [keypressMap] = useState(() => new Set<string>())
  useLayoutEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      keypressMap.add(e.key)
    }
    function handleKeyUp(e: KeyboardEvent) {
      keypressMap.delete(e.key)
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('keyup', handleKeyUp)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('keyup', handleKeyUp)
    }
  })
  return keypressMap
}
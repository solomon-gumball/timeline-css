import { debounce } from 'lodash'
import { useState, useMemo, useEffect, Dispatch, SetStateAction, useCallback } from 'react'

interface StorageItem<V> {
  timestamp?: number,
  value: V,
}

type StorageOptions = { expiry?: number, debounce?: { maxWait: number, wait: number } }
function useLocalStorage<T>(key: string, initialValue: T, options?: StorageOptions): readonly [T, React.Dispatch<React.SetStateAction<T>>];
function useLocalStorage<T>(key: string, initialValue?: undefined, options?: StorageOptions): readonly [T | undefined, React.Dispatch<React.SetStateAction<T | undefined>>]
function useLocalStorage<T>(key: string, initialValue?: T, options: StorageOptions = {}) {
  const fetchedString = localStorage.getItem(key)
  const { expiry, debounce: { wait = 0, maxWait = 0 } = {} } = options
  const parsedValue = parseAndValidate<T>(fetchedString, expiry)
  const [value, setValue] = useState<T | undefined>(parsedValue ?? initialValue)

  const updateLocalStorage = useMemo(() => debounce((value?: T) => {
    if (value === undefined) {
      return localStorage.removeItem(key)
    }

    try {
      const storageItem: StorageItem<T> = { value, timestamp: Date.now() }
      localStorage.setItem(key, JSON.stringify(storageItem))
    }
    catch (e) {
      console.error(e)
    }
  }, wait, { maxWait }), [key, maxWait, wait])

  useEffect(() => {
    updateLocalStorage(value)
  }, [updateLocalStorage, value])

  return [value, setValue] as const
}

export { useLocalStorage }

/*
 * Attempts to parse stored string value.  Returns undefined if stored string
 * is undefined or item has expired
 */
function parseAndValidate<T>(storedString: string | null, expiry?: number): T | undefined {
  if (storedString == null) { return undefined }

  let parsedValue: T | undefined
  try {
    const parsed: StorageItem<T> = JSON.parse(storedString)
    const { timestamp, value } = parsed
    if (timestamp == null || expiry == null || (Date.now() - timestamp) < expiry) {
      parsedValue = value
    }
  }
  catch (e) { console.error(e) }

  return parsedValue
}


function getCookieValue(key: string) {
  return document.cookie
    .split('; ')
    .find(row => row.startsWith(key))
    ?.split('=')[1]
}
type HookStateSetter = Dispatch<SetStateAction<string | undefined>>

// NOTE: Changing cookie key does not work with current implementation
export function useCookie(key: string): readonly [string | undefined, HookStateSetter] {
  const [cookieVal, _setCookieVal] = useState(getCookieValue(key))
  const setCookieValue: HookStateSetter = useCallback(val => {
    if (val instanceof Function) {
      return _setCookieVal(val)
    }
    return _setCookieVal(val)
  }, [])

  return [cookieVal, setCookieValue] as const
}
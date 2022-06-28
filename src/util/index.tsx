import React, { useState, useEffect, useReducer } from 'react'

type FalsyValue = false | undefined | null
export function css(...names: (FalsyValue | string)[]) {
  return names.filter(Boolean).join(' ')
}

export function getColor() {
  return `hsl(${360 * Math.random()},${
    35 + 70 * Math.random()}%,${
    70 + 10 * Math.random()}%)`
}

export function isFirefox() {
  return navigator.userAgent.includes('Firefox')
}

export function timeSince(date: Date) {
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000)
  let interval = seconds / 31536000

  if (interval > 1) { return `${Math.floor(interval)} year(s)` }
  interval = seconds / 2592000
  if (interval > 1) { return `${Math.floor(interval)} month(s)` }
  interval = seconds / 86400
  if (interval > 1) { return `${Math.floor(interval)} day(s)` }
  interval = seconds / 3600
  if (interval > 1) { return `${Math.floor(interval)} hour(s)` }
  interval = seconds / 60
  if (interval > 1) { return `${Math.floor(interval)} minute(s)` }
  return `${Math.floor(seconds)} second(s)`
}

type WindowSize = { width: number, height: number }
export const useWindowSize = (): [WindowSize, React.Dispatch<React.SetStateAction<WindowSize>>] => {
  const windowSizeStateTuple = useState({ width: window.innerWidth, height: window.innerHeight })

  useEffect(() => {
    const onResize = () => windowSizeStateTuple[1]({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [windowSizeStateTuple])

  return windowSizeStateTuple
}

export const classNames = (...classNames: (string | null | undefined | false)[]) => classNames.filter((name): name is string => !!name).join(' ')

export function useUpdateTrigger() {
  const [updateCount, dispatch] = useReducer((x: number) => x + 1, 0)
  return [dispatch, updateCount] as const
}
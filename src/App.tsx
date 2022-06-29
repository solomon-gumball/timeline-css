import { BrowserRouter, Route, Routes, useParams } from 'react-router-dom'
import React, { useEffect, useState } from 'react'
import Editor from './Editor'
import Projects from './Projects'
import { API } from '../types'
import { useLocalStorage, useCookie } from './util/storage'

export type Project = { css: string, html: string }
export type ProjectsById = { [projectId: string]: Project }

type ProjectUpsertData = Omit<API.Project, 'source' | 'id' | 'updated_at' | 'user_id' | 'created_at'> & { html: string, css: string }

type Session = {
  user?: API.User,
  logout: () => Promise<void>,
  username?: string,
  starProject: (projectId: string, toggle: boolean) => Promise<void>,
  stars?: API.Star[],
  createProject: (body: ProjectUpsertData) => Promise<API.UserProjectJoin>,
  updateProject: (id: string, body: ProjectUpsertData) => Promise<API.UserProjectJoin>,
  deleteProject: (id: string) => Promise<void>,
  offlineMode: boolean,
}

export const SessionContext = React.createContext<Session>({
  user: undefined,
  stars: undefined,
  username: undefined,
  logout: () => { throw new ContextError('') },
  starProject: () => { throw new ContextError('') },
  createProject: () => { throw new ContextError('') },
  updateProject: () => { throw new ContextError('') },
  deleteProject: () => { throw new ContextError('') },
  offlineMode: true,
})

class APIError extends Error {}
class ContextError extends Error {}

function parseResult<T>(response: Response): Promise<T> {
  if (!response.ok) throw new APIError(response.statusText)
  return response.json()
}

const OFFLINE_MODE = process.env.OFFLINE_MODE === 'true'

function App() {
  const [user, setUser] = useLocalStorage<API.User>('user', undefined, { expiry: 1000 * 60 * 60 * 24 })
  const [stars, setStars] = useState<API.Star[]>()
  const [username, setUsername] = useCookie('username')

  function toggleStarLocal(projectId: string, toggle: boolean) {
    if (toggle) {
      setStars(stars => [...stars ?? [], { project_id: projectId, created_at: new Date().toISOString() }])
    } else {
      setStars(stars => (stars ?? []).filter(star => star.project_id !== projectId))
    }
  }

  function starProject(projectId: string, toggle: boolean): Promise<void> {
    if (toggle) {
      return fetch('/api/star', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      })
        .then(result => parseResult<void>(result))
        .then(() => toggleStarLocal(projectId, true))
    } else {
      return fetch('/api/star', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      })
        .then(result => parseResult<void>(result))
        .then(() => toggleStarLocal(projectId, false))
    }
  }

  function createProject(body: { name: string, css?: string, html?: string }) {
    return fetch('/api/project', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then(result => parseResult<API.UserProjectJoin>(result))
      .then((project) => {
        return project
      })
  }

  function updateProject(id: string, body: { name: string, css: string, html: string }) {
    return fetch(`/api/project/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then(result => parseResult<API.UserProjectJoin>(result))
  }

  function deleteProject(id: string) {
    return fetch(`/api/project/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
    }).then(() => undefined)
  }

  function logout() {
    return fetch('/api/logout', { method: 'POST' })
      .then(() => {
        setUser(undefined)
        setStars(undefined)
      })
  }

  useEffect(() => {
    // No server, this is client only dev build version
    if (OFFLINE_MODE) {
      setUsername(undefined)
      setUser(undefined)
      setStars(undefined)
      return
    }
    // Not logged in
    if (username == null) {
      return
    }

    fetch('/api/auth')
      .then(result => {
        if (!result.ok) throw result.status
        return result.json()
      })
      .then(({ user, stars }) => {
        setUser(user)
        setStars(stars)
      })
      .catch(error => {
        if (error === 403) {
          setUser(undefined)
        }
        console.error(error)
      })
  }, [setUser, setUsername, username])

  return (
    <SessionContext.Provider value={{ user, logout, username, stars, starProject, createProject, updateProject, deleteProject, offlineMode: OFFLINE_MODE }}>
      <BrowserRouter>
        <Routes>
          <Route path="p/:projectId" element={<EditorKeyWrapper />} />
          <Route path="*" element={<Projects />} />
        </Routes>
      </BrowserRouter>
    </SessionContext.Provider>
  )
}

function EditorKeyWrapper() {
  const { projectId } = useParams()

  return (
    <Editor key={projectId} />
  )
}

export default App
import { PropsWithChildren, useContext, useEffect, useState } from 'react'
import { Link, Navigate, NavLink, Route, Routes, useNavigate, useSearchParams } from 'react-router-dom'
import { SessionContext } from './App'
import styles from './css/projects.scss'
import { classNames, css } from './util'
import { API } from '../types'
import sharedStyles from './css/shared.scss'
import HammerIcon from './icons/hammer.svg'
import { AnimationUpsert, UpsertAnimationModal } from './Modals'
import starterProject from './projectDefaults'
import { FEEDBACK_FORM_URL } from '.'
import HowItWorks from './HowItWorks'
import { AppHeader } from './AppHeader'
import { ProjectPreview } from './ProjectPreview'

export default function Projects() {
  const session = useContext(SessionContext)
  const navigate = useNavigate()
  const [upsertData, setUpsertData] = useState<AnimationUpsert>()

  function onCreateNewProject() {
    setUpsertData({ type: 'INSERT', project: { source: { html: starterProject.htmlSource, css: starterProject.cssSource } } })
  }
  return (
    <div className={styles.container}>
      <AppHeader />
      <div className={classNames(styles.topHeaderRow, sharedStyles.flexRow)} style={{ alignItems: 'center' }}>
        <div className={sharedStyles.flexColumn} style={{ justifyContent: 'space-between' }}>
          <div style={{ color: 'white', fontSize: 28, fontWeight: 'bold', marginBottom: 4, textShadow: '2px 2px #5b5b5b' }}>TimelineCSS</div>
          <div style={{ color: 'gray', fontSize: 12, marginBottom: 14 }}>{'code driven animation editor'}</div>
        </div>
        <div className={classNames(sharedStyles.flexRow)} style={{ marginLeft: 'auto', gap: 10 }}>
          {!session.user && !session.offlineMode && (
            <a
              href={'/oauth'}
              className={css(styles.addAnimationButton)}
            >
            Sign in
            </a>
          )}
          {!session.user && (
            <a
              href={'p/draft'}
              className={css(styles.addAnimationButton)}
            >
            Sandbox
            </a>
          )}
          {session.user && (
            <button
              className={css(styles.addAnimationButton)}
              onClick={onCreateNewProject}
            >
            New Project
            </button>
          )}
        </div>
      </div>
      <div className={classNames(sharedStyles.flexRow, styles.navRow)}>
        {!session.offlineMode && (
          <NavLink end to="/top" className={({ isActive }) => classNames(styles.tabLink, isActive ? styles.activeTabLink : styles.inactiveTabLink)}>
            <h1 className={styles.projectsHeader}>community</h1>
          </NavLink>
        )}
        {session.user && (
          <NavLink end to="/yours" className={({ isActive }) => classNames(styles.tabLink, isActive ? styles.activeTabLink : styles.inactiveTabLink)}>
            <h1 className={styles.projectsHeader}>your projects</h1>
          </NavLink>
        )}
        {session.user && (
          <NavLink end to="/starred" className={({ isActive }) => classNames(styles.tabLink, isActive ? styles.activeTabLink : styles.inactiveTabLink)}>
            <h1 className={styles.projectsHeader}>starred</h1>
          </NavLink>
        )}
        <NavLink end to="/about" className={({ isActive }) => classNames(styles.tabLink, isActive ? styles.activeTabLink : styles.inactiveTabLink)}>
          <h1 className={styles.projectsHeader}>how it works</h1>
        </NavLink>
        <a target="_blank" href="https://github.com/solomon-gumball/timeline-css" className={classNames(styles.tabLink, styles.inactiveTabLink)} rel="noreferrer">
          <h1 className={styles.projectsHeader}>github</h1>
        </a>
        {upsertData && (
          <UpsertAnimationModal
            data={upsertData}
            onCancel={() => setUpsertData(undefined)}
            onComplete={({ id }) => navigate(`/p/${id}`)}
          />
        )}
      </div>
      <div className={styles.navHeaderBorder} />
      <Routes>
        <Route path="/top" element={<TopAnimations />} />
        <Route path="/yours" element={<MyProjects onCreateProject={onCreateNewProject} />} />
        <Route path="/about" element={<HowItWorks />} />
        <Route path="/starred" element={<StarredProjects />} />
        <Route path="" element={<Navigate to={session.offlineMode ? '/about' : '/top'} />} />
      </Routes>
    </div>
  )
}

export function MyProjects({ onCreateProject }: { onCreateProject: () => void }) {
  const [projects, setProjects] = useState<API.UserProjectJoin[]>()
  const [searchParams] = useSearchParams()
  const pageParam = searchParams.get('page')
  const page = (pageParam && parseInt(pageParam, 10)) || 0

  useEffect(() => {
    setProjects(undefined)
    fetch('/api/my-projects', {
      method: 'POST',
      body: JSON.stringify({ page }),
      headers: { 'Content-Type': 'application/json' },
    })
      .then(result => {
        if (!result.ok) throw new Error('Error loading project')
        return result.json()
      })
      .then(setProjects)
  }, [page])

  const showPreviousButton = page !== 0
  const showNextButton = projects && projects.length === 12

  return (
    <ProjectsGrid
      showLastUpdated
      projects={projects}
      next={showNextButton && `/yours?page=${page + 1}`}
      previous={showPreviousButton && `/yours?page=${page - 1}`}
    >
      {projects && projects.length < 12 && (
        <div className={classNames(styles.projectGridItem, styles.projectGridItemPlaceholder)} onClick={() => onCreateProject()}>
          <div className={styles.addNewPlaceholderText}>
            <HammerIcon width={40} style={{ marginLeft: 'auto', marginRight: 'auto' }} />
            Add new project
          </div>
        </div>
      )}
    </ProjectsGrid>
  )
}

export function TopAnimations() {
  const [projects, setProjects] = useState<API.UserProjectJoin[]>()
  const [searchParams] = useSearchParams()
  const pageParam = searchParams.get('page')
  const page = (pageParam && parseInt(pageParam, 10)) || 0

  useEffect(() => {
    setProjects(undefined)
    fetch('/api/projects', {
      method: 'POST',
      body: JSON.stringify({ page: page }),
      headers: { 'Content-Type': 'application/json' },
    })
      .then(result => {
        if (!result.ok) throw new Error('error loading rpojec')
        return result.json()
      })
      .then(setProjects)
  }, [page])

  const showPreviousButton = page !== 0
  const showNextButton = projects && projects.length === 12

  return (
    <ProjectsGrid
      projects={projects}
      next={showNextButton && `/top?page=${page + 1}`}
      previous={showPreviousButton && `/top?page=${page - 1}`}
    >
    </ProjectsGrid>
  )
}

export function StarredProjects() {
  const [projects, setProjects] = useState<API.UserProjectJoin[]>()
  const [searchParams] = useSearchParams()
  const pageParam = searchParams.get('page')
  const session = useContext(SessionContext)
  const page = (pageParam && parseInt(pageParam, 10)) || 0
  const userId = session.user?.id

  useEffect(() => {
    setProjects(undefined)
    if (!userId) { return }

    fetch('/api/starred-projects', {
      method: 'POST',
      body: JSON.stringify({ page: page, starredBy: userId }),
      headers: { 'Content-Type': 'application/json' },
    })
      .then(result => {
        if (!result.ok) throw new Error('error loading rpojec')
        return result.json()
      })
      .then(setProjects)
  }, [page, userId])

  const showPreviousButton = page !== 0
  const showNextButton = projects && projects.length === 12

  return (
    <ProjectsGrid
      projects={projects}
      next={showNextButton && `/starred?page=${page + 1}`}
      previous={showPreviousButton && `/starred?page=${page - 1}`}
    >
      {projects?.length === 0 && (
        <div className={styles.emptyResults}>No starred projects.</div>
      )}
    </ProjectsGrid>
  )
}

function ProjectsGrid({ projects, children, next, previous, showLastUpdated }: PropsWithChildren<{ showLastUpdated?: boolean, projects?: API.UserProjectJoin[], next?: string | false, previous?: string | false }>) {
  return (
    <div className={sharedStyles.flexColumn} style={{ flexGrow: 1 }}>
      <div className={styles.projectsGrid}>
        {projects?.map(project => (
          <ProjectPreview showLastUpdated={showLastUpdated} key={project.id} project={project} />
        ))}
        {children}
      </div>
      <div className={classNames(sharedStyles.flexRow, styles.paginationFooterContainer)}>
        <Link style={{ visibility: previous ? 'visible' : 'hidden' }} to={previous || ''}>{'<- Previous'}</Link>
        <SuggestionsFormLinkFooter />
        <Link style={{ visibility: next ? 'visible' : 'hidden' }} to={next || ''}>{'Next ->'}</Link>
      </div>
    </div>
  )
}

export function SuggestionsFormLinkFooter() {
  return (
    <div className={styles.suggestionsFooter}>
      <div>Feature suggestions? Comments?</div>
      <a href={FEEDBACK_FORM_URL}>Let me know</a>
    </div>
  )
}
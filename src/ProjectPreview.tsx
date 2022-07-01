import { useRef, useState, useLayoutEffect } from 'react'
import { Link } from 'react-router-dom'
import { API } from '../types'
import { AnimationControls, generateAnimationControls } from './core/animationControls'
import { SANDBOX_CONFIG } from './Editor'
import { StarCount } from './StarCount'
import { isFirefox, timeSince } from './util'
import styles from './css/projects.scss'
import sharedStyles from './css/shared.scss'

export function ProjectPreview({ project, showLastUpdated }: { project: API.UserProjectJoin, showLastUpdated?: boolean }) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const { html, css } = project.source
  const [controls, setAnimationControls] = useState<AnimationControls>()
  const [didPauseInitial, setDidPauseInitial] = useState(false)

  useLayoutEffect(() => {
    const iframeEl = iframeRef.current

    if (iframeEl == null) { return }
    const updateStyleEl = (() => {
      const contentDocument = iframeEl.contentDocument
      if (contentDocument == null) { return }
      const style = document.createElement('style')
      // WebKit hack :(
      style.appendChild(document.createTextNode(''))
      style.innerText = `html { overflow: hidden; }\n${css}`
      contentDocument.head.appendChild(style)
      contentDocument.body.innerHTML = html
      setAnimationControls(generateAnimationControls(contentDocument))
    })
    if (iframeEl.contentDocument == null) { return }

    if (isFirefox()) {
      iframeEl.addEventListener('load', updateStyleEl)
    } else {
      updateStyleEl()
    }
  }, [css, html])

  useLayoutEffect(() => {
    if (controls == null) { return }
    setTimeout(() => {
      controls.pause(project.preview_offset_time)
      setDidPauseInitial(true)
    }, 100)
  }, [controls, project])

  return (
    <Link
      to={`/p/${project.id}`}
      className={styles.projectGridItem}
      onMouseEnter={() => controls?.play(!project.preview_infinite ? 0 : undefined)}
      onMouseLeave={() => controls?.pause(!project.preview_infinite ? project.preview_offset_time : undefined)}
    >
      {showLastUpdated && (
        <div className={styles.previewLabel}>
          <div className={styles.previewSubtitle}>updated {timeSince(new Date(project.updated_at))} ago</div>
        </div>
      )}
      <div className={styles.hoverBorderEl} />
      <iframe
        style={{ visibility: didPauseInitial ? 'visible' : 'hidden' }}
        ref={iframeRef}
        src="about:blank"
        sandbox={SANDBOX_CONFIG}
        className={styles.previewIframe}
        title={project.name}
        loading="lazy"
      />
      <div className={styles.previewInfoContainer}>
        <div className={sharedStyles.flexColumn}>
          <div className={styles.previewInfoTitle}>{project.name}</div>
          <div className={styles.previewSubtitle}>by {project.username}</div>
        </div>
        <div className={sharedStyles.flexRow} style={{ alignItems: 'center', display: 'flex' }}>
          <span style={{ marginRight: 5 }}></span>
          <StarCount project={project} />
        </div>
      </div>
    </Link>
  )
}
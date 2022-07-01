import { useContext, useState } from 'react'
import { API } from '../types'
import { SessionContext } from './App'
import { PromptLoginModal } from './Modals'
import { classNames } from './util'
import sharedStyles from './css/shared.scss'
import styles from './css/editor.scss'
import StarIcon from './icons/star.svg'

export function StarCount({ project }: { project: API.UserProjectJoin }) {
  const session = useContext(SessionContext)
  const [starCount, setStarCount] = useState<number>(parseInt(project.star_count, 10))
  const currentUserStarredProject = session.stars && (session.stars.find(star => star.project_id === project.id) != null)
  const [showLoginModal, setShowLoginModal] = useState(false)

  function handleClick(e: React.MouseEvent<HTMLButtonElement>) {
    e.stopPropagation()
    e.preventDefault()
    e.nativeEvent.stopImmediatePropagation()
    if (session.username == null) {
      return setShowLoginModal(true)
    }
    if (currentUserStarredProject == null) { return }
    if (currentUserStarredProject) {
      session.starProject(project.id, false).then(() => setStarCount(count => --count))
    } else {
      session.starProject(project.id, true).then(() => setStarCount(count => ++count))
    }
  }

  return (
    <button className={classNames(sharedStyles.flexRow, styles.starButton)} style={{ color: currentUserStarredProject ? 'gold' : 'gray' }} onClick={handleClick}>
      {starCount}
      {showLoginModal && <PromptLoginModal message="Create an account to star projects" onCancel={() => setShowLoginModal(false)} />}
      <StarIcon style={{ height: 14, marginLeft: 7 }} />
    </button>
  )
}
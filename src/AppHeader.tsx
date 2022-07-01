import { useContext, useState } from 'react'
import { useNavigate, useMatch } from 'react-router'
import { SessionContext } from './App'
import { GenericPromptModal, HelpModal, LogoutModal } from './Modals'
import Popover from './Popover'
import styles from './css/app-header.scss'
import sharedStyles from './css/shared.scss'

export function AppHeader({ leftItem, centerItem, hasUnsavedChanges = false }: { hasUnsavedChanges?: boolean, leftItem?: React.ReactNode, centerItem?: React.ReactNode }) {
  const session = useContext(SessionContext)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const navigate = useNavigate()
  const [showLogoutModal, setShowLogoutModal] = useState(false)
  const [showHelpModal, setShowHelpModal] = useState(false)
  const [showNavigateWarningModal, setShowNavigateWarningModal] = useState<{ path: string }>()
  const match = useMatch({ path: '/p/:projectId' })

  function handleNavigate(to: string) {
    if (hasUnsavedChanges) {
      setShowNavigateWarningModal({ path: to })
    } else {
      navigate(to)
    }
  }

  return (
    <div className={styles.pageHeaderRow}>
      <div className={sharedStyles.flexRow} style={{ flexGrow: 1, flexBasis: 1, flexShrink: 0 }}>
        {leftItem}
      </div>
      <div className={sharedStyles.flexRow} style={{ flexGrow: 0, flexShrink: 0 }}>
        {centerItem}
      </div>
      {showNavigateWarningModal && (
        <GenericPromptModal
          cancelMessage="Stay on this page"
          confirmMessage="Leave page"
          message={'This page has unsaved changes.\nAre you sure you want to leave?'}
          title="Unsaved Changes"
          onCancel={() => setShowNavigateWarningModal(undefined)}
          onConfirm={() => navigate(showNavigateWarningModal.path)}
        />
      )}
      {showHelpModal && (
        <HelpModal onCancel={() => {
          setShowHelpModal(false)
        }} />
      )}
      {showLogoutModal && (
        <LogoutModal onCancel={() => setShowLogoutModal(false)} />
      )}
      {session.user && (
        <div style={{ flexGrow: 1, flexBasis: 1, flexShrink: 0, textAlign: 'right' }}>logged in as
          <Popover
            isVisible={dropdownOpen}
            onBlur={() => setDropdownOpen(false)}
            anchor={(
              <button className={styles.usernameButton} style={{ color: dropdownOpen ? 'gray' : '' }} onClick={() => setDropdownOpen(open => !open)}>
                <span>{session.user.username}</span>
              </button>
            )}
            anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
            transformOrigin={{ horizontal: 'right', vertical: 'top' }}
          >
            <Dropdown
              options={[
                { title: 'Your projects', onClick: () => {
                  setDropdownOpen(false)
                  handleNavigate('/yours')
                }},
                { title: 'Community', onClick: () => {
                  setDropdownOpen(false)
                  handleNavigate('/top')
                }},
                { title: 'Help',
                  onClick: () => {
                    setDropdownOpen(false)
                    setShowHelpModal(true)
                  },
                },
                { title: 'Local Sandbox',
                  onClick: () => {
                    setDropdownOpen(false)
                    handleNavigate('/p/draft')
                  },
                },
                {
                  title: 'Log out',
                  onClick: () => {
                    setDropdownOpen(false)
                    setShowLogoutModal(true)
                  },
                },
              ]}
            />
          </Popover>
        </div>
      )}
      {!session.user && (
        <div  style={{ flexGrow: 1, flexBasis: 1, flexShrink: 0, textAlign: 'right', justifyContent: 'flex-end' }} className={sharedStyles.flexRow}>
          {match != null && (
            <>
              <a href="/" className={styles.usernameButton} style={{ textDecoration: 'none', color: dropdownOpen ? 'gray' : '', marginRight: 5 }} onClick={() => setDropdownOpen(open => !open)}>Back to Homepage</a>
              •
            </>
          )}
          {!session.offlineMode && (
            <a href="/oauth" className={styles.usernameButton} style={{ color: dropdownOpen ? 'gray' : '' }} onClick={() => setDropdownOpen(open => !open)}>
              Sign in with github
            </a>
          )}
        </div>
      )}
    </div>
  )
}

export function Dropdown({ options }: { options: { title: string, onClick: () => any }[] }) {
  return (
    <div className={styles.dropdownContainer}>
      {options.map(option => (
        <button
          className={styles.dropdownItem}
          key={option.title}
          onClick={() => option.onClick()}
        >
          {option.title}
        </button>
      ))}
    </div>
  )
}
import React, { PropsWithChildren, useContext, useMemo, useState } from 'react'
import { v4 } from 'uuid'
import { useNavigate } from 'react-router'
import { Layer } from './Popover'
import modalStyles from './css/modal.scss'
import sharedStyles from './css/shared.scss'
import { API } from '../types'
import { classNames } from './util'
import { SessionContext } from './App'
import { ProjectPreview } from './Projects'
import { FEEDBACK_FORM_URL } from '.'

export type AnimationUpsert = (
  { type: 'INSERT', project: Partial<API.Project> & { source: API.Project['source'] } } |
  { type: 'UPDATE', project: API.UserProjectJoin, totalLength: number }
)

type UpsertModalProps = {
  data: AnimationUpsert,
  onCancel: () => void,
  customTitle?: string,
  onComplete: (project: API.UserProjectJoin) => void,
}

export function UpsertAnimationModal({ data, onCancel, onComplete, customTitle }: UpsertModalProps) {
  const session = useContext(SessionContext)
  const [upsertData, setUpsertData] = useState<AnimationUpsert>(data)
  const [loading, setIsLoading] = useState(false)
  const navigate = useNavigate()
  const [showConfirmDelete, setShowConfirmDelete] = useState(false)
  const [moreOptionsOpen, setMoreOptionsOpen] = useState(false)
  const canSubmit = !!upsertData.project?.name && !loading

  function saveProject() {
    const name = upsertData?.project.name
    if (name == null) { return }
    setIsLoading(true)

    const upsert = (upsertData.type === 'INSERT'
      ? session.createProject({
        name: name,
        css: upsertData.project.source.css,
        html: upsertData.project.source.html,
        preview_offset_time: 0,
        preview_infinite: false,
      })
      : session.updateProject(upsertData.project.id, {
        name: name,
        css: upsertData.project.source.css,
        html: upsertData.project.source.html,
        preview_offset_time: upsertData.project.preview_offset_time,
        preview_infinite: upsertData.project.preview_infinite,
      }))
    upsert
      .then(onComplete)
      .catch(err => {
        onCancel()
        console.error(err)
        setIsLoading(false)
      })
  }

  function onChangeStartTimeSlider(e: React.ChangeEvent<HTMLInputElement>) {
    setUpsertData(curr => {
      if (curr.type === 'UPDATE') {
        return ({ ...curr, project: { ...curr.project, preview_offset_time: parseInt(e.target.value, 10) }})
      }
      return curr
    })
  }

  function onChangeInfiniteToggle(checked: boolean) {
    setUpsertData(curr => {
      if (curr.type === 'UPDATE') {
        return ({ ...curr, project: { ...curr.project, preview_infinite: checked }})
      }
      return curr
    })
  }

  function handleChangeProjectName(e: React.ChangeEvent<HTMLInputElement>) {
    setUpsertData(curr => {
      if (curr.type === 'UPDATE') {
        return ({ ...curr, type: curr.type, project: { ...curr.project, name: e.target.value } })
      } else {
        return ({ ...curr, project: { ...curr.project, name: e.target.value } })
      }
    })
  }

  return (
    <ModalBase onBlur={onCancel}>
      {showConfirmDelete && (
        <GenericPromptModal
          title="Confirm Delete"
          confirmMessage="Yes, Delete"
          cancelMessage="Nevermind"
          actionType="destructive"
          message="Are you really REALLY sure??"
          onCancel={() => {
            setShowConfirmDelete(false)
          }}
          onConfirm={() => {
            if (upsertData.project.id) {
              session.deleteProject(upsertData.project.id).then(() => {
                navigate('/yours')
              })
            } else {
              setShowConfirmDelete(false)
            }
          }}
        />
      )}
      <div className={modalStyles.modalHeader}>{customTitle ?? (upsertData.type === 'UPDATE' ? 'Update Project' : 'New Project')}</div>
      <div className={modalStyles.modalInputLabel}>Project Name</div>
      <input type="text" className={modalStyles.modalInput} placeholder="Enter name here" value={upsertData.project.name ?? ''} onChange={handleChangeProjectName} />
      {/* {validName === false && <div style={{ color: 'red', width: '100%' }}>Name can only include alphanumeric characters</div>} */}
      {upsertData.type === 'UPDATE' && (
        <>
          <div className={modalStyles.modalInputLabel} style={{ textAlign: 'center', marginBottom: 10, marginTop: 10 }}>Thumbnail preview</div>
          <ProjectPreview project={upsertData.project} />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
            <div className={modalStyles.modalInputLabel}>Thumbnail start time</div>
            {upsertData.project.preview_offset_time}ms
          </div>
          <div className={modalStyles.slidecontainer} style={{ marginTop: 10, marginBottom: 10 }}>
            <input type="range" min="0" max={upsertData.totalLength} style={{ marginBottom: 10 }} className={modalStyles.slider} value={upsertData.project.preview_offset_time} onChange={onChangeStartTimeSlider} />
          </div>
          <Checkbox value={upsertData.project.preview_infinite} name={upsertData.project.name ?? ''} label={'"Pause & continue" mode'} onChange={onChangeInfiniteToggle} />
        </>
      )}
      <button disabled={!canSubmit} onClick={() => saveProject()} className={classNames(modalStyles.actionButton, modalStyles.defaultButton)} style={{ marginTop: 20 }}>{upsertData.type === 'UPDATE' ? 'Update' : 'Create'}</button>
      {upsertData.type === 'UPDATE' && (
        <div className={sharedStyles.flexColumn}>
          <button onClick={() => setMoreOptionsOpen(prev => !prev)} className={modalStyles.moreOptionsLabel}>{moreOptionsOpen ? '- Hide additional options' : '+ Show more options'}</button>
          <div className={modalStyles.expandableContainer} style={{ height: moreOptionsOpen ? '' : 0 }}>
            <button disabled={!canSubmit} onClick={() => setShowConfirmDelete(true)} className={classNames(modalStyles.actionButton, modalStyles.destructiveButton)} style={{ marginTop: 20, width: '100%' }}>Delete Project</button>
          </div>
        </div>
      )}
    </ModalBase>
  )
}

export function HelpModal({ onCancel }: { onCancel: () => void }) {
  const hotkeyDescriptions = [
    { key: 'CMD+Z', desc: 'Undo CSS edit' },
    { key: 'CMD+S', desc: 'Save changes' },
    { key: 'SPACEBAR', desc: 'Play/Pause' },
    { key: 'UP ARROW', desc: 'Zoom in' },
    { key: 'DOWN ARROW', desc: 'Zoom out' },
    { key: 'ESC', desc: 'Reset Zoom' },
    { key: '1', desc: 'Toggle HTML Panel' },
    { key: '2', desc: 'Toggle CSS Panel' },
    { key: '3', desc: 'Toggle "Live Preview" Panel' },
  ]
  return (
    <ModalBase onBlur={onCancel}>
      <div className={modalStyles.modalHeader}>Help</div>
      <div className={sharedStyles.flexColumn}>
        Hotkeys:<br/><br/>
        {hotkeyDescriptions.map(({ key, desc }) => (
          <div key={key} className={modalStyles.modalHotkeyRow}>
            <div className={modalStyles.modalHotkeyLabel}>{key}</div>
            <div>{desc}</div>
          </div>
        ))}
        <br/><br/>
        Bugs / Comments / Questions 👇
        <br/><br/>
        Contact joseph.michael.sample@gmail.com
        <br/><br/>
        <button onClick={() => onCancel()} className={classNames(modalStyles.actionButton, modalStyles.defaultButton)}>Done</button>
      </div>
    </ModalBase>
  )
}

export function Checkbox({ value, onChange, name, label }: { value: boolean, onChange: (val: boolean) => void, label: string, name: string }) {
  return (
    <label className={modalStyles.labelContainer}>
      {label}
      <input type="checkbox" checked={value} onChange={e => onChange(!value)} />
      <span className={modalStyles.checkmark}></span>
    </label>
  )
}

function ModalBase({ onBlur, children, maxWidth }: PropsWithChildren<{ maxWidth?: number, onBlur: () => void }>) {
  const id = useMemo(v4, [])
  return (
    <Layer layerId={`modal-${id}`} className={modalStyles.modalBackground} onClick={() => onBlur()}>
      <div className={modalStyles.modalBody} style={{ maxWidth }} onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </Layer>
  )
}

export function ErrorModal({ onComplete }: { onComplete: () => void }) {
  return (
    <ModalBase onBlur={onComplete}>
      <div className={modalStyles.modalHeader}>Something went wrong</div>
      <div style={{ textAlign: 'center', marginTop: 10 }}>
        Please consider <a target="_blank" href={FEEDBACK_FORM_URL} style={{ color: 'white' }} rel="noreferrer">reporting this issue</a>
        <br/><br/>
        If the issue persists try refreshing the page.
      </div>
      <div className={modalStyles.actionButtonRow}>
        <button onClick={() => onComplete()} className={classNames(modalStyles.actionButton, modalStyles.defaultButton)} style={{ marginRight: 10 }}>OK, Done</button>
      </div>
    </ModalBase>
  )
}

export function NotFoundModal() {
  return (
    <ModalBase onBlur={() => {}}>
      <div className={modalStyles.modalHeader}>Project Not Found</div>
      <div className={modalStyles.actionButtonRow}>
        <button onClick={() => window.location.href = '/'} className={classNames(modalStyles.actionButton, modalStyles.defaultButton)} style={{ marginRight: 10 }}>Back to home page</button>
      </div>
    </ModalBase>
  )
}

export function LogoutModal({ onCancel }: { onCancel: () => void, onComplete?: () => void }) {
  const session = useContext(SessionContext)
  const [loading, setLoading] = useState(false)

  function logout() {
    setLoading(true)
    session.logout()
      .then(() => {
        window.location.href = '/top'
      })
      .catch(err => {
        setLoading(false)
        onCancel()
      })
  }

  return (
    <ModalBase onBlur={onCancel}>
      <div className={modalStyles.modalHeader}>Log out?</div>
      <div className={modalStyles.actionButtonRow}>
        <button onClick={() => logout()} className={classNames(modalStyles.actionButton, modalStyles.defaultButton)} style={{ marginRight: 10 }}>Logout</button>
        <button disabled={loading} className={modalStyles.actionButton} onClick={() => onCancel()}>Cancel</button>
      </div>
    </ModalBase>
  )
}

type ActionType = 'default' | 'destructive'
type GenericModalProps = {
  confirmMessage: string,
  cancelMessage: string,
  title: string,
  message: string,
  onCancel: () => void,
  onConfirm: () => void,
  actionType?: ActionType,
}
export function GenericPromptModal({ onCancel, onConfirm, title, message, confirmMessage, cancelMessage, actionType = 'default' }: GenericModalProps) {
  return (
    <ModalBase onBlur={onCancel} maxWidth={400}>
      <div className={modalStyles.modalHeader}>{title}</div>
      <div style={{ textAlign: 'center' }}>{message}</div>
      <div className={modalStyles.actionButtonRow}>
        <button
          onClick={() => onConfirm()}
          className={classNames(modalStyles.actionButton, actionType === 'default' ? modalStyles.defaultButton : modalStyles.destructiveButton)}
          style={{ marginRight: 10 }}
        >
          {confirmMessage}
        </button>
        <button className={modalStyles.actionButton} onClick={() => onCancel()}>{cancelMessage}</button>
      </div>
    </ModalBase>
  )
}

export function PromptLoginModal({ onCancel, message, customTitle }: { message: string, onCancel: () => void, customTitle?: string }) {
  return (
    <ModalBase onBlur={onCancel}>
      <div className={modalStyles.modalHeader}>{customTitle ?? 'Account Required'}</div>
      {message}
      <div className={modalStyles.actionButtonRow}>
        <a
          href={`/oauth?redirect_uri=${window.location.href}`}
          className={classNames(modalStyles.actionButton, modalStyles.defaultButton)}
          style={{ marginRight: 10 }}
        >
          Login with Github
        </a>
        <button className={modalStyles.actionButton} onClick={() => onCancel()}>Not Now</button>
      </div>
    </ModalBase>
  )
}
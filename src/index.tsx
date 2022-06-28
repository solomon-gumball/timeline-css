import React from 'react'
import ReactDOM from 'react-dom/client'
import { init as initSentry } from '@sentry/react'

import App from './App'
import './css/reset.scss'

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement,
)

export const FEEDBACK_FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSd-FEKYREwPSvjZVEolmRP2eN6yLhbCUu7Fjf_YxTek1KXQmQ/viewform?usp=sf_link'

if (process.env.SENTRY_RELEASE) {
  initSentry({
    dsn: process.env.SENTRY_DSN,
    release: process.env.SENTRY_RELEASE,
  })
}

root.render(
  <App />,
)
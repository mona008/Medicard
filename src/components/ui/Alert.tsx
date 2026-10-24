import type { ReactNode } from 'react'

type Tone = 'error' | 'success' | 'info'

interface AlertProps {
  tone?: Tone
  children: ReactNode
  /** Set when the alert replaces previous content, so screen readers re-announce. */
  live?: boolean
}

const ROLE: Record<Tone, 'alert' | 'status'> = {
  error: 'alert',
  success: 'status',
  info: 'status',
}

export function Alert({ tone = 'info', children, live = true }: AlertProps) {
  return (
    <div
      className={`alert alert-${tone}`}
      role={live ? ROLE[tone] : undefined}
      // Errors must be announced immediately; status messages wait for a pause.
      aria-live={live && tone === 'error' ? 'assertive' : 'polite'}
    >
      {children}
    </div>
  )
}

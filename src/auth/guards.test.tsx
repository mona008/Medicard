import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { GuestOnly, RequireAuth } from './guards'

const mocks = vi.hoisted(() => ({
  auth: {
    status: 'loading',
    user: null,
    session: null,
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
  },
}))

vi.mock('@/auth/AuthContext', () => ({
  useAuth: () => mocks.auth,
}))

function renderProtected() {
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Routes>
        <Route element={<RequireAuth />}>
          <Route path="/dashboard" element={<div>patient dashboard</div>} />
        </Route>
        <Route path="/login" element={<div>sign in screen</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

function renderGuestOnly() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route element={<GuestOnly />}>
          <Route path="/login" element={<div>sign in screen</div>} />
        </Route>
        <Route path="/dashboard" element={<div>patient dashboard</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('RequireAuth', () => {
  it('shows a loading state while the session resolves', () => {
    mocks.auth.status = 'loading'
    renderProtected()
    expect(screen.getByText(/checking your session/i)).toBeInTheDocument()
    expect(screen.queryByText(/patient dashboard/i)).not.toBeInTheDocument()
  })

  it('never renders protected content when signed out', () => {
    mocks.auth.status = 'signedOut'
    renderProtected()
    expect(screen.queryByText(/patient dashboard/i)).not.toBeInTheDocument()
    expect(screen.getByText(/sign in screen/i)).toBeInTheDocument()
  })

  it('explains setup instead of crashing when unconfigured', () => {
    mocks.auth.status = 'unconfigured'
    renderProtected()
    expect(screen.queryByText(/patient dashboard/i)).not.toBeInTheDocument()
    expect(screen.getByText(/setup required/i)).toBeInTheDocument()
    expect(screen.queryByText(/sign in screen/i)).not.toBeInTheDocument()
  })

  it('renders protected content when signed in', () => {
    mocks.auth.status = 'signedIn'
    renderProtected()
    expect(screen.getByText(/patient dashboard/i)).toBeInTheDocument()
  })
})

describe('GuestOnly', () => {
  it('lets a signed-out visitor reach the sign-in screen', () => {
    mocks.auth.status = 'signedOut'
    renderGuestOnly()
    expect(screen.getByText(/sign in screen/i)).toBeInTheDocument()
    expect(screen.queryByText(/patient dashboard/i)).not.toBeInTheDocument()
  })

  it('redirects a signed-in user away from sign-in', () => {
    mocks.auth.status = 'signedIn'
    renderGuestOnly()
    expect(screen.queryByText(/sign in screen/i)).not.toBeInTheDocument()
    expect(screen.getByText(/patient dashboard/i)).toBeInTheDocument()
  })
})

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LoginPage } from './LoginPage'

const mocks = vi.hoisted(() => ({
  signIn: vi.fn<() => Promise<{ error: string | null }>>(),
}))

vi.mock('@/auth/AuthContext', () => ({
  useAuth: () => ({
    status: 'signedOut',
    user: null,
    session: null,
    signIn: mocks.signIn,
    signUp: vi.fn(),
    signOut: vi.fn(),
  }),
}))

function renderLogin() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  mocks.signIn.mockReset()
  mocks.signIn.mockResolvedValue({ error: null })
})

describe('LoginPage', () => {
  it('renders an accessible form', () => {
    renderLogin()
    expect(screen.getByRole('heading', { level: 1, name: /sign in/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/^email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^password/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })

  it('blocks submission when the form is empty', async () => {
    const user = userEvent.setup()
    renderLogin()

    await user.click(screen.getByRole('button', { name: /sign in/i }))

    expect(mocks.signIn).not.toHaveBeenCalled()
    expect(await screen.findByText(/enter your email address/i)).toBeInTheDocument()
    expect(await screen.findByText(/enter your password/i)).toBeInTheDocument()
  })

  it('blocks submission on a malformed email', async () => {
    const user = userEvent.setup()
    renderLogin()

    await user.type(screen.getByLabelText(/^email/i), 'not-an-email')
    await user.type(screen.getByLabelText(/^password/i), 'hunter2hunter2')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    expect(mocks.signIn).not.toHaveBeenCalled()
    expect(await screen.findByText(/valid email address/i)).toBeInTheDocument()
  })

  it('submits valid credentials', async () => {
    const user = userEvent.setup()
    renderLogin()

    await user.type(screen.getByLabelText(/^email/i), 'patient@example.com')
    await user.type(screen.getByLabelText(/^password/i), 'correct horse battery')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    expect(mocks.signIn).toHaveBeenCalledWith('patient@example.com', 'correct horse battery')
    expect(screen.queryByText(/enter your email address/i)).not.toBeInTheDocument()
  })

  it('shows a server error in an alert region and clears the password', async () => {
    mocks.signIn.mockResolvedValue({ error: 'Email or password is incorrect.' })
    const user = userEvent.setup()
    renderLogin()

    await user.type(screen.getByLabelText(/^email/i), 'patient@example.com')
    const password = screen.getByLabelText(/^password/i)
    await user.type(password, 'wrong-password-value')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Email or password is incorrect.')
    expect(password).toHaveValue('')
    expect(screen.getByLabelText(/^email/i)).toHaveValue('patient@example.com')
  })

  it('re-enables the form after the request finishes', async () => {
    const user = userEvent.setup()
    renderLogin()

    await user.type(screen.getByLabelText(/^email/i), 'patient@example.com')
    await user.type(screen.getByLabelText(/^password/i), 'correct horse battery')
    const button = screen.getByRole('button', { name: /sign in/i })
    await user.click(button)

    expect(await screen.findByRole('button', { name: /sign in/i })).toBeEnabled()
  })
})

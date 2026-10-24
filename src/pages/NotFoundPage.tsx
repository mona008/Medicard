import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <div className="container narrow section">
      <div className="card">
        <h1 className="h1">Page not found</h1>
        <p className="muted">That address does not exist, or the link has expired.</p>
        <Link className="btn btn-primary" to="/">
          Go to the home page
        </Link>
      </div>
    </div>
  )
}

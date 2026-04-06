export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0d1117' }}>
      <div style={{ width: '100%', maxWidth: '24rem', backgroundColor: '#161b22', border: '1px solid #30363d', borderRadius: '0.5rem', padding: '2rem', boxShadow: '0 4px 12px rgba(0,0,0,0.4)' }}>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#e6edf3', marginBottom: '1.5rem' }}>Sign in</h1>

        <form method="POST" action="/api/auth/login" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label htmlFor="email" style={{ display: 'block', fontSize: '0.875rem', color: '#8b949e', marginBottom: '0.25rem' }}>
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              style={{ width: '100%', padding: '0.5rem 0.75rem', backgroundColor: '#21262d', border: '1px solid #30363d', borderRadius: '0.375rem', color: '#e6edf3', fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          <div>
            <label htmlFor="password" style={{ display: 'block', fontSize: '0.875rem', color: '#8b949e', marginBottom: '0.25rem' }}>
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              style={{ width: '100%', padding: '0.5rem 0.75rem', backgroundColor: '#21262d', border: '1px solid #30363d', borderRadius: '0.375rem', color: '#e6edf3', fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          {error && (
            <p style={{ fontSize: '0.875rem', color: '#f85149', margin: 0 }}>{error}</p>
          )}

          <button
            type="submit"
            style={{ width: '100%', padding: '0.5rem 1rem', backgroundColor: '#388bfd', color: '#ffffff', fontSize: '0.875rem', fontWeight: 500, borderRadius: '0.375rem', border: 'none', cursor: 'pointer' }}
          >
            Sign in
          </button>
        </form>
      </div>
    </div>
  )
}

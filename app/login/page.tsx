'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'

function LoginForm() {
  const searchParams = useSearchParams()
  const urlError = searchParams.get('error')
  const [submitting, setSubmitting] = useState(false)

  return (
    <div className="fixed inset-0 bg-canvas flex items-center justify-center">
      <div className="w-full max-w-sm bg-surface border border-edge rounded-lg p-8 shadow-lg">
        <h1 className="text-xl font-semibold text-primary mb-6">Sign in</h1>

        <form
          method="POST"
          action="/api/auth/login"
          onSubmit={() => setSubmitting(true)}
          className="space-y-4"
        >
          <div>
            <label htmlFor="email" className="block text-sm text-secondary mb-1">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="w-full px-3 py-2 bg-overlay border border-edge rounded-md text-primary text-sm focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm text-secondary mb-1">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="w-full px-3 py-2 bg-overlay border border-edge rounded-md text-primary text-sm focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          {urlError && (
            <p className="text-sm text-red-400">{urlError}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2 px-4 bg-accent text-white text-sm font-medium rounded-md hover:bg-accent/90 disabled:opacity-50 transition-colors"
          >
            {submitting ? 'Signing in\u2026' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}

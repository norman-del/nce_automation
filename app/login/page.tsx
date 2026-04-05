'use client'

import { useActionState } from 'react'
import { login } from './actions'

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(
    async (_prev: { error: string } | null, formData: FormData) => {
      const result = await login(formData)
      // If login succeeds, redirect() throws so we never reach here
      return result ?? null
    },
    null
  )

  return (
    <div className="fixed inset-0 bg-canvas flex items-center justify-center">
      <div className="w-full max-w-sm bg-surface border border-edge rounded-lg p-8 shadow-lg">
        <h1 className="text-xl font-semibold text-primary mb-6">Sign in</h1>

        <form action={formAction} className="space-y-4">
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

          {state?.error && (
            <p className="text-sm text-red-400">{state.error}</p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="w-full py-2 px-4 bg-accent text-white text-sm font-medium rounded-md hover:bg-accent/90 disabled:opacity-50 transition-colors"
          >
            {pending ? 'Signing in\u2026' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function DisconnectButton() {
  const [phase, setPhase] = useState<'idle' | 'confirm' | 'loading' | 'done'>('idle')
  const router = useRouter()

  async function handleDisconnect() {
    setPhase('loading')
    await fetch('/api/qbo/disconnect', { method: 'POST' })
    setPhase('done')
    setTimeout(() => {
      router.refresh()
    }, 1200)
  }

  if (phase === 'done') {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-ok">
        ✓ Disconnected
      </span>
    )
  }

  if (phase === 'confirm') {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="text-xs text-secondary">Are you sure?</span>
        <button
          onClick={handleDisconnect}
          className="px-3 py-1.5 bg-fail/15 text-fail text-xs rounded-md border border-fail/30 hover:bg-fail/25 transition-colors"
        >
          Yes, disconnect
        </button>
        <button
          onClick={() => setPhase('idle')}
          className="px-3 py-1.5 text-secondary text-xs rounded-md border border-edge hover:bg-overlay transition-colors"
        >
          Cancel
        </button>
      </span>
    )
  }

  return (
    <button
      onClick={() => setPhase('confirm')}
      disabled={phase === 'loading'}
      className="inline-block px-3 py-1.5 bg-fail/10 text-fail text-xs rounded-md border border-fail/25 hover:bg-fail/20 transition-colors disabled:opacity-50"
    >
      {phase === 'loading' ? 'Disconnecting…' : 'Disconnect QBO'}
    </button>
  )
}

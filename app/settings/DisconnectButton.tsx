'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function DisconnectButton() {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleDisconnect() {
    setLoading(true)
    await fetch('/api/qbo/disconnect', { method: 'POST' })
    router.refresh()
  }

  return (
    <button
      onClick={handleDisconnect}
      disabled={loading}
      className="inline-block px-3 py-1.5 bg-red-100 text-red-700 text-xs rounded-md hover:bg-red-200 transition-colors disabled:opacity-50"
    >
      {loading ? 'Disconnecting…' : 'Disconnect QBO'}
    </button>
  )
}

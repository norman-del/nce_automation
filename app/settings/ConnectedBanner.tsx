'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

export default function ConnectedBanner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const status = searchParams.get('qbo')
  const [visible, setVisible] = useState(!!status)

  useEffect(() => {
    if (!status) return
    const t = setTimeout(() => {
      setVisible(false)
      router.replace('/settings', { scroll: false })
    }, 6000)
    return () => clearTimeout(t)
  }, [status, router])

  if (!visible || !status) return null

  if (status === 'connected') {
    return (
      <div className="mb-5 flex items-center gap-2.5 rounded-lg border border-ok/30 bg-ok/10 px-4 py-3 text-sm text-ok">
        <span className="text-base leading-none">✓</span>
        <span>QuickBooks Online connected successfully.</span>
        <button
          onClick={() => setVisible(false)}
          className="ml-auto text-secondary hover:text-primary leading-none"
        >
          ×
        </button>
      </div>
    )
  }

  const errorMsg = searchParams.get('message')
  return (
    <div className="mb-5 flex items-center gap-2.5 rounded-lg border border-fail/30 bg-fail/10 px-4 py-3 text-sm text-fail">
      <span className="text-base leading-none">✕</span>
      <span>QBO connection failed.{errorMsg ? ` ${decodeURIComponent(errorMsg)}` : ' Please try again.'}</span>
      <button
        onClick={() => setVisible(false)}
        className="ml-auto text-secondary hover:text-primary leading-none"
      >
        ×
      </button>
    </div>
  )
}

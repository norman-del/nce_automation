type Mode = 'bridge' | 'strategic'

interface Props {
  mode: Mode
  detail?: string
}

export default function ScopeBanner({ mode, detail }: Props) {
  if (mode === 'bridge') {
    return (
      <div className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
        <span className="font-semibold uppercase tracking-wide">Current solution</span>
        <span className="mx-2 opacity-50">·</span>
        <span>{detail ?? 'This action writes to Shopify and QuickBooks. It will be retired at cutover.'}</span>
      </div>
    )
  }
  return (
    <div className="mb-4 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
      <span className="font-semibold uppercase tracking-wide">Strategic</span>
      <span className="mx-2 opacity-50">·</span>
      <span>{detail ?? 'Post-Shopify feature. Reads and writes Supabase only.'}</span>
    </div>
  )
}

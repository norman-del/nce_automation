import type { FeedRow } from './types'

const FETCH_TIMEOUT_MS = 30_000

export async function parseCombisteelFeed(url: string): Promise<FeedRow[]> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  let text: string
  try {
    const res = await fetch(url, { signal: controller.signal, cache: 'no-store' })
    if (!res.ok) throw new Error(`Combisteel feed HTTP ${res.status}`)
    text = await res.text()
  } finally {
    clearTimeout(timer)
  }

  const rows: FeedRow[] = []
  const productRegex = /<product\b[^>]*\bcode="([^"]+)"[^>]*>([\s\S]*?)<\/product>/gi
  let m: RegExpExecArray | null
  while ((m = productRegex.exec(text)) !== null) {
    const sku = m[1].trim()
    const inner = m[2]
    const stockMatch = inner.match(/<stock\b[^>]*>([^<]*)<\/stock>/i)
    if (!sku || !stockMatch) continue
    const raw = stockMatch[1].trim()
    const n = parseInt(raw, 10)
    if (isNaN(n)) continue
    rows.push({ sku, quantity: n })
  }

  if (rows.length === 0) {
    const selfClosingRegex = /<product\b[^>]*\bcode="([^"]+)"[^>]*\bstock="(\d+)"[^>]*\/?>/gi
    while ((m = selfClosingRegex.exec(text)) !== null) {
      rows.push({ sku: m[1].trim(), quantity: parseInt(m[2], 10) })
    }
  }

  return rows
}

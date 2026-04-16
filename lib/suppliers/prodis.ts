import type { FeedRow } from './types'

const FETCH_TIMEOUT_MS = 30_000

function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        cur += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ',') {
        out.push(cur)
        cur = ''
      } else {
        cur += ch
      }
    }
  }
  out.push(cur)
  return out.map(s => s.trim())
}

export async function parseProdisFeed(url: string): Promise<FeedRow[]> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  let text: string
  try {
    const res = await fetch(url, { signal: controller.signal, cache: 'no-store' })
    if (!res.ok) throw new Error(`Prodis feed HTTP ${res.status}`)
    text = await res.text()
  } finally {
    clearTimeout(timer)
  }

  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0)
  if (lines.length < 2) throw new Error('Prodis feed empty or header-only')

  const header = parseCsvLine(lines[0]).map(h => h.toLowerCase())
  const modelIdx = header.findIndex(h => h === 'model' || h === 'sku')
  if (modelIdx === -1) throw new Error('Prodis feed missing Model column')
  const stockIdx = header.findIndex(h =>
    h === 'stock' || h === 'quantity' || h === 'qty' || h === 'availability'
  )

  const rows: FeedRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i])
    const sku = cols[modelIdx]?.trim()
    if (!sku) continue
    let qty = 9999
    if (stockIdx !== -1) {
      const raw = cols[stockIdx]?.trim() ?? ''
      const n = parseInt(raw, 10)
      if (!isNaN(n)) qty = n
      else if (/^(in.?stock|available|yes|y|true)$/i.test(raw)) qty = 9999
      else if (/^(out.?of.?stock|unavailable|no|n|false|0)$/i.test(raw)) qty = 0
    }
    rows.push({ sku, quantity: qty })
  }
  return rows
}

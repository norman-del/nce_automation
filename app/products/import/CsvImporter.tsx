'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'

// The fields we can import into
const PRODUCT_FIELDS: readonly { key: string; label: string; required: boolean }[] = [
  { key: 'sku', label: 'SKU', required: true },
  { key: 'title', label: 'Title', required: true },
  { key: 'condition', label: 'Condition (new/used)', required: true },
  { key: 'vat_applicable', label: 'VAT Applicable', required: false },
  { key: 'cost_price', label: 'Cost Price', required: true },
  { key: 'selling_price', label: 'Selling Price', required: true },
  { key: 'original_rrp', label: 'Original RRP', required: false },
  { key: 'model_number', label: 'Model Number', required: false },
  { key: 'year_of_manufacture', label: 'Year of Manufacture', required: false },
  { key: 'electrical_requirements', label: 'Electrical Requirements', required: false },
  { key: 'notes', label: 'Notes', required: false },
  { key: 'width_cm', label: 'Width (cm)', required: true },
  { key: 'height_cm', label: 'Height (cm)', required: true },
  { key: 'depth_cm', label: 'Depth (cm)', required: true },
  { key: 'weight_kg', label: 'Weight (kg)', required: false },
  { key: 'product_type', label: 'Product Type', required: true },
  { key: 'vendor', label: 'Vendor / Brand', required: true },
  { key: 'tags', label: 'Tags (comma-separated)', required: false },
  { key: 'handle', label: 'URL Handle', required: false },
  { key: 'body_html', label: 'Description HTML', required: false },
  { key: 'shopify_product_id', label: 'Shopify Product ID', required: false },
  { key: 'qbo_item_id', label: 'QBO Item ID', required: false },
  { key: 'free_delivery_included', label: 'Free Delivery Included', required: false },
]

type FieldKey = string

// Auto-map CSV headers to product fields
function autoMap(headers: string[]): Record<number, FieldKey | ''> {
  const map: Record<number, FieldKey | ''> = {}
  const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

  const aliases: Record<string, FieldKey> = {
    sku: 'sku',
    title: 'title',
    name: 'title',
    producttitle: 'title',
    productname: 'title',
    condition: 'condition',
    newused: 'condition',
    vat: 'vat_applicable',
    vatapplicable: 'vat_applicable',
    cost: 'cost_price',
    costprice: 'cost_price',
    price: 'selling_price',
    sellingprice: 'selling_price',
    rrp: 'original_rrp',
    originalrrp: 'original_rrp',
    model: 'model_number',
    modelnumber: 'model_number',
    year: 'year_of_manufacture',
    yearofmanufacture: 'year_of_manufacture',
    electrical: 'electrical_requirements',
    electricalrequirements: 'electrical_requirements',
    notes: 'notes',
    description: 'body_html',
    bodyhtml: 'body_html',
    width: 'width_cm',
    widthcm: 'width_cm',
    height: 'height_cm',
    heightcm: 'height_cm',
    depth: 'depth_cm',
    depthcm: 'depth_cm',
    weight: 'weight_kg',
    weightkg: 'weight_kg',
    producttype: 'product_type',
    type: 'product_type',
    vendor: 'vendor',
    brand: 'vendor',
    tags: 'tags',
    handle: 'handle',
    urlhandle: 'handle',
    shopifyproductid: 'shopify_product_id',
    shopifyid: 'shopify_product_id',
    qboitemid: 'qbo_item_id',
    qboid: 'qbo_item_id',
    freedeliveryincluded: 'free_delivery_included',
    freedelivery: 'free_delivery_included',
    deliveryincluded: 'free_delivery_included',
  }

  const used = new Set<FieldKey>()

  headers.forEach((header, i) => {
    const key = normalise(header)
    const match = aliases[key]
    if (match && !used.has(match)) {
      map[i] = match
      used.add(match)
    } else {
      map[i] = ''
    }
  })

  return map
}

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length === 0) return { headers: [], rows: [] }

  // Simple CSV parser handling quoted fields
  function parseLine(line: string): string[] {
    const fields: string[] = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') {
          current += '"'
          i++
        } else if (ch === '"') {
          inQuotes = false
        } else {
          current += ch
        }
      } else {
        if (ch === '"') {
          inQuotes = true
        } else if (ch === ',') {
          fields.push(current.trim())
          current = ''
        } else {
          current += ch
        }
      }
    }
    fields.push(current.trim())
    return fields
  }

  const headers = parseLine(lines[0])
  const rows = lines.slice(1).map(parseLine)
  return { headers, rows }
}

interface ImportResult {
  inserted: number
  skipped: number
  errors: { row: number; sku: string; error: string }[]
  total: number
}

const BATCH_SIZE = 500

export default function CsvImporter() {
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<string[][]>([])
  const [mapping, setMapping] = useState<Record<number, FieldKey | ''>>({})
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<string | null>(null)

  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setResult(null)
    setError(null)

    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const { headers: h, rows: r } = parseCSV(text)
      setHeaders(h)
      setRows(r)
      setMapping(autoMap(h))
    }
    reader.readAsText(file)
  }, [])

  function updateMapping(colIndex: number, field: FieldKey | '') {
    setMapping(prev => ({ ...prev, [colIndex]: field }))
  }

  // Convert mapped CSV rows to product objects
  function buildRows(): Record<string, unknown>[] {
    return rows.map(row => {
      const obj: Record<string, unknown> = {}
      headers.forEach((_, colIdx) => {
        const field = mapping[colIdx]
        if (!field) return
        let val: unknown = row[colIdx] ?? ''

        // Type coercion
        if (field === 'vat_applicable' || field === 'free_delivery_included') {
          const v = String(val).toLowerCase()
          val = v === 'true' || v === 'yes' || v === '1' || v === 'y'
        } else if (['cost_price', 'selling_price', 'original_rrp', 'width_cm', 'height_cm', 'depth_cm', 'weight_kg'].includes(field)) {
          val = val !== '' ? Number(val) : null
        } else if (['year_of_manufacture', 'shopify_product_id'].includes(field)) {
          val = val !== '' ? Number(val) : null
        } else if (field === 'tags') {
          val = String(val).split(',').map(t => t.trim()).filter(Boolean)
        }

        obj[field] = val
      })
      return obj
    })
  }

  async function handleImport() {
    setImporting(true)
    setError(null)
    setResult(null)

    try {
      const allRows = buildRows()
      let totalInserted = 0
      let totalSkipped = 0
      const allErrors: ImportResult['errors'] = []

      // Send in batches
      const batches = Math.ceil(allRows.length / BATCH_SIZE)
      for (let i = 0; i < batches; i++) {
        const batch = allRows.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE)
        setProgress(`Importing batch ${i + 1} of ${batches} (${batch.length} rows)...`)

        const res = await fetch('/api/products/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rows: batch }),
        })

        const data = await res.json()
        if (!res.ok && !data.inserted) {
          throw new Error(data.error || `Batch ${i + 1} failed`)
        }

        totalInserted += data.inserted ?? 0
        totalSkipped += data.skipped ?? 0
        if (data.errors) {
          // Offset row numbers by batch position
          allErrors.push(...data.errors.map((e: ImportResult['errors'][number]) => ({
            ...e,
            row: e.row + i * BATCH_SIZE,
          })))
        }
      }

      setResult({
        inserted: totalInserted,
        skipped: totalSkipped,
        errors: allErrors,
        total: allRows.length,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setImporting(false)
      setProgress(null)
    }
  }

  const mappedRequired = PRODUCT_FIELDS.filter(f => f.required)
  const missingRequired = mappedRequired.filter(f =>
    !Object.values(mapping).includes(f.key)
  )

  const inputCls = 'w-full bg-surface border border-edge rounded-md px-2 py-1.5 text-xs text-primary focus:outline-none focus:border-accent'

  return (
    <div className="space-y-6">
      {/* Step 1: Upload */}
      <div className="bg-surface border border-edge rounded-lg p-5">
        <h3 className="text-sm font-medium text-primary mb-3">1. Upload CSV</h3>
        <input
          type="file"
          accept=".csv"
          onChange={handleFile}
          className="block text-sm text-secondary file:mr-3 file:py-2 file:px-4 file:rounded-md file:border file:border-edge file:text-sm file:font-medium file:bg-overlay file:text-primary hover:file:bg-surface file:cursor-pointer file:transition-colors"
        />
        {rows.length > 0 && (
          <p className="mt-2 text-xs text-secondary">
            {rows.length} rows, {headers.length} columns detected
          </p>
        )}
      </div>

      {/* Step 2: Column mapping */}
      {headers.length > 0 && (
        <div className="bg-surface border border-edge rounded-lg p-5">
          <h3 className="text-sm font-medium text-primary mb-3">2. Map columns</h3>
          <p className="text-xs text-secondary mb-3">
            Match each CSV column to a product field. Required fields are marked with *.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {headers.map((header, colIdx) => (
              <div key={colIdx}>
                <label className="block text-xs text-secondary mb-1 truncate" title={header}>
                  {header}
                </label>
                <select
                  className={inputCls}
                  value={mapping[colIdx] || ''}
                  onChange={e => updateMapping(colIdx, e.target.value as FieldKey | '')}
                >
                  <option value="">— skip —</option>
                  {PRODUCT_FIELDS.map(f => (
                    <option key={f.key} value={f.key}>
                      {f.label}{f.required ? ' *' : ''}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {missingRequired.length > 0 && (
            <p className="mt-3 text-xs text-warn">
              Missing required mappings: {missingRequired.map(f => f.label).join(', ')}
            </p>
          )}
        </div>
      )}

      {/* Step 3: Preview */}
      {headers.length > 0 && rows.length > 0 && (
        <div className="bg-surface border border-edge rounded-lg p-5">
          <h3 className="text-sm font-medium text-primary mb-3">3. Preview (first 5 rows)</h3>
          <div className="overflow-x-auto">
            <table className="text-xs w-full">
              <thead>
                <tr className="border-b border-edge">
                  {headers.map((h, i) => (
                    mapping[i] ? (
                      <th key={i} className="px-2 py-1.5 text-left text-secondary font-medium whitespace-nowrap">
                        {mapping[i]}
                      </th>
                    ) : null
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 5).map((row, ri) => (
                  <tr key={ri} className="border-b border-edge">
                    {headers.map((_, ci) => (
                      mapping[ci] ? (
                        <td key={ci} className="px-2 py-1.5 text-primary whitespace-nowrap max-w-32 truncate">
                          {row[ci] || '—'}
                        </td>
                      ) : null
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Step 4: Import */}
      {headers.length > 0 && (
        <div className="flex items-center gap-3">
          <button
            onClick={handleImport}
            disabled={importing || missingRequired.length > 0 || rows.length === 0}
            className="px-5 py-2.5 bg-accent text-white text-sm font-medium rounded-md hover:bg-accent-hi disabled:opacity-50 transition-colors"
          >
            {importing ? (progress || 'Importing...') : `Import ${rows.length} products`}
          </button>
          <Link
            href="/products"
            className="px-5 py-2.5 text-secondary text-sm rounded-md hover:text-primary hover:bg-overlay transition-colors"
          >
            Cancel
          </Link>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="bg-surface border border-edge rounded-lg p-5 space-y-3">
          <h3 className="text-sm font-medium text-primary">Import complete</h3>
          <div className="flex gap-6 text-sm">
            <div>
              <span className="text-secondary">Inserted:</span>{' '}
              <span className="text-ok font-medium">{result.inserted}</span>
            </div>
            <div>
              <span className="text-secondary">Skipped (duplicate SKU):</span>{' '}
              <span className="text-warn font-medium">{result.skipped}</span>
            </div>
            <div>
              <span className="text-secondary">Errors:</span>{' '}
              <span className="text-fail font-medium">{result.errors.length}</span>
            </div>
          </div>
          {result.errors.length > 0 && (
            <div className="mt-2 max-h-48 overflow-y-auto">
              <table className="text-xs w-full">
                <thead>
                  <tr className="border-b border-edge">
                    <th className="px-2 py-1 text-left text-secondary">Row</th>
                    <th className="px-2 py-1 text-left text-secondary">SKU</th>
                    <th className="px-2 py-1 text-left text-secondary">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {result.errors.map((err, i) => (
                    <tr key={i} className="border-b border-edge">
                      <td className="px-2 py-1 text-primary">{err.row}</td>
                      <td className="px-2 py-1 font-mono text-primary">{err.sku}</td>
                      <td className="px-2 py-1 text-fail">{err.error}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="bg-fail/10 border border-fail/25 text-fail rounded-md px-4 py-3 text-sm">
          {error}
        </div>
      )}
    </div>
  )
}

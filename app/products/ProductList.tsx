'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

interface Product {
  id: string
  sku: string
  title: string
  condition: string
  selling_price: number
  vendor: string
  status: string
  shopify_product_id: number | null
  qbo_synced: boolean
  sync_error: string | null
  created_at: string
  stock_quantity: number
  low_stock_threshold: number
  suppliers: { id: string; name: string } | null
}

type StatusFilter = 'all' | 'processing' | 'active'

export default function ProductList() {
  const [products, setProducts] = useState<Product[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)
  const limit = 25

  const fetchProducts = useCallback(async () => {
    setLoading(true)
    setError(null)
    const params = new URLSearchParams()
    if (statusFilter !== 'all') params.set('status', statusFilter)
    if (search.trim()) params.set('q', search.trim())
    params.set('limit', String(limit))
    params.set('offset', String(offset))

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)

    try {
      const res = await fetch(`/api/products?${params}`, { signal: controller.signal })
      clearTimeout(timeout)
      if (!res.ok) {
        const body = await res.text()
        throw new Error(`API ${res.status}: ${body.slice(0, 200)}`)
      }
      const data = await res.json()
      setProducts(data.products || [])
      setTotal(data.total || 0)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[ProductList] fetch failed:', msg)
      setError(msg)
      setProducts([])
      setTotal(0)
    } finally {
      clearTimeout(timeout)
      setLoading(false)
    }
  }, [statusFilter, search, offset])

  useEffect(() => {
    fetchProducts()
  }, [fetchProducts])

  useEffect(() => {
    setOffset(0)
  }, [statusFilter, search])

  const statusBadge = (status: string) => {
    if (status === 'active') return 'bg-ok/10 text-ok border-ok/25'
    return 'bg-warn/10 text-warn border-warn/25'
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-edge overflow-hidden">
            {(['all', 'processing', 'active'] as StatusFilter[]).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-2 text-sm capitalize transition-colors ${
                  statusFilter === s
                    ? 'bg-accent text-white'
                    : 'bg-surface text-secondary hover:text-primary hover:bg-overlay'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <input
          type="text"
          placeholder="Search SKU, title, vendor..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-surface border border-edge rounded-md px-3 py-2 text-sm text-primary placeholder:text-secondary/50 focus:outline-none focus:border-accent w-full sm:w-64"
        />
      </div>

      {/* Error banner */}
      {error && (
        <div className="bg-fail/10 border border-fail/25 rounded-lg px-4 py-3 flex items-start justify-between gap-3">
          <p className="text-sm text-fail break-all">{error}</p>
          <button onClick={fetchProducts} className="shrink-0 text-xs text-fail underline hover:no-underline">Retry</button>
        </div>
      )}

      {/* Desktop table */}
      <div className="hidden lg:block bg-surface border border-edge rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-overlay text-secondary text-left">
              <th className="px-4 py-3 font-medium">SKU</th>
              <th className="px-4 py-3 font-medium">Title</th>
              <th className="px-4 py-3 font-medium">Vendor</th>
              <th className="px-4 py-3 font-medium">Condition</th>
              <th className="px-4 py-3 font-medium text-right">Price</th>
              <th className="px-4 py-3 font-medium text-right">Stock</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Sync</th>
              <th className="px-4 py-3 font-medium">Date</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-secondary">Loading...</td>
              </tr>
            ) : products.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-secondary">
                  No products found
                </td>
              </tr>
            ) : (
              products.map((p) => (
                <tr key={p.id} className="border-t border-edge hover:bg-overlay/50 transition-colors">
                  <td className="px-4 py-3 font-mono text-accent">
                    <Link href={`/products/${p.id}`} className="hover:underline">{p.sku}</Link>
                  </td>
                  <td className="px-4 py-3 text-primary max-w-xs truncate">
                    <Link href={`/products/${p.id}`} className="hover:underline">{p.title}</Link>
                  </td>
                  <td className="px-4 py-3 text-secondary">{p.vendor}</td>
                  <td className="px-4 py-3 capitalize text-secondary">{p.condition}</td>
                  <td className="px-4 py-3 text-right text-primary">
                    £{Number(p.selling_price).toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={`text-sm ${
                      p.stock_quantity === 0 ? 'text-fail font-medium' :
                      p.stock_quantity <= p.low_stock_threshold ? 'text-warn font-medium' :
                      'text-secondary'
                    }`}>
                      {p.stock_quantity}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border capitalize ${statusBadge(p.status)}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5">
                      <span title="Shopify" className={`text-xs ${p.shopify_product_id ? 'text-ok' : 'text-secondary'}`}>
                        S{p.shopify_product_id ? '✓' : '✗'}
                      </span>
                      <span title="QBO" className={`text-xs ${p.qbo_synced ? 'text-ok' : 'text-secondary'}`}>
                        Q{p.qbo_synced ? '✓' : '✗'}
                      </span>
                    </div>
                    {p.sync_error && (
                      <p className="text-xs text-fail mt-0.5 truncate max-w-[120px]" title={p.sync_error}>
                        {p.sync_error}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-secondary text-xs">
                    {new Date(p.created_at).toLocaleDateString('en-GB')}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Tablet/mobile card list */}
      <div className="lg:hidden">
        {loading ? (
          <div className="bg-surface border border-edge rounded-lg px-4 py-8 text-center text-secondary text-sm">Loading...</div>
        ) : products.length === 0 ? (
          <div className="bg-surface border border-edge rounded-lg px-4 py-8 text-center text-secondary text-sm">No products found</div>
        ) : (
          <div className="space-y-2">
            {products.map((p) => (
              <Link
                key={p.id}
                href={`/products/${p.id}`}
                className="block bg-surface border border-edge rounded-xl p-4 active:bg-overlay hover:border-secondary transition-colors"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="min-w-0">
                    <p className="font-mono text-accent text-sm font-medium">{p.sku}</p>
                    <p className="text-primary text-sm leading-snug mt-0.5 line-clamp-2">{p.title}</p>
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-1.5">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border capitalize ${statusBadge(p.status)}`}>
                      {p.status}
                    </span>
                    <span className="text-primary font-medium text-sm">£{Number(p.selling_price).toFixed(2)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-secondary">
                  <span className="truncate">{p.vendor}</span>
                  <span className="text-edge shrink-0">·</span>
                  <span className="capitalize shrink-0">{p.condition}</span>
                  <span className="ml-auto shrink-0 flex gap-2">
                    <span className={p.shopify_product_id ? 'text-ok' : 'text-secondary/40'}>S{p.shopify_product_id ? '✓' : '✗'}</span>
                    <span className={p.qbo_synced ? 'text-ok' : 'text-secondary/40'}>Q{p.qbo_synced ? '✓' : '✗'}</span>
                  </span>
                </div>
                {p.sync_error && (
                  <p className="text-xs text-fail mt-2 truncate">{p.sync_error}</p>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {total > limit && (
        <div className="flex items-center justify-between text-sm text-secondary">
          <span>
            Showing {offset + 1}–{Math.min(offset + limit, total)} of {total}
          </span>
          <div className="flex gap-2">
            <button
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - limit))}
              className="px-3 py-1 border border-edge rounded-md hover:bg-overlay disabled:opacity-50"
            >
              Previous
            </button>
            <button
              disabled={offset + limit >= total}
              onClick={() => setOffset(offset + limit)}
              className="px-3 py-1 border border-edge rounded-md hover:bg-overlay disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

'use client'

import { useState, useEffect, useCallback } from 'react'

interface WarrantyTemplate {
  code: string
  label: string
  body_html: string
  applies_to_condition: 'new' | 'used' | null
  default_for_vendor: string | null
  display_order: number
  active: boolean
  created_at: string
  updated_at: string
}

const inputCls =
  'w-full bg-surface border border-edge rounded-md px-3 py-2 text-sm text-primary placeholder:text-secondary/50 focus:outline-none focus:border-accent'
const labelCls = 'block text-xs font-medium text-secondary mb-1'

interface Draft {
  code: string
  label: string
  body_html: string
  applies_to_condition: '' | 'new' | 'used'
  default_for_vendor: string
  display_order: string
  active: boolean
}

function blankDraft(): Draft {
  return {
    code: '',
    label: '',
    body_html: '',
    applies_to_condition: '',
    default_for_vendor: '',
    display_order: '0',
    active: true,
  }
}

function templateToDraft(t: WarrantyTemplate): Draft {
  return {
    code: t.code,
    label: t.label,
    body_html: t.body_html,
    applies_to_condition: t.applies_to_condition ?? '',
    default_for_vendor: t.default_for_vendor ?? '',
    display_order: String(t.display_order),
    active: t.active,
  }
}

export default function WarrantyTemplatesManager() {
  const [templates, setTemplates] = useState<WarrantyTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null) // code being edited, or 'new'
  const [draft, setDraft] = useState<Draft>(blankDraft())
  const [saving, setSaving] = useState(false)

  const fetchTemplates = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/warranty-templates')
      if (!res.ok) throw new Error(`Failed to load (${res.status})`)
      setTemplates(await res.json())
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTemplates()
  }, [fetchTemplates])

  function startEdit(t: WarrantyTemplate) {
    setEditing(t.code)
    setDraft(templateToDraft(t))
  }

  function startCreate() {
    setEditing('new')
    setDraft(blankDraft())
  }

  function cancel() {
    setEditing(null)
    setDraft(blankDraft())
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const payload = {
        label: draft.label,
        body_html: draft.body_html,
        applies_to_condition: draft.applies_to_condition === '' ? null : draft.applies_to_condition,
        default_for_vendor: draft.default_for_vendor.trim() || null,
        display_order: parseInt(draft.display_order, 10) || 0,
        active: draft.active,
      }
      let res: Response
      if (editing === 'new') {
        res = await fetch('/api/warranty-templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: draft.code, ...payload }),
        })
      } else {
        res = await fetch(`/api/warranty-templates/${encodeURIComponent(editing!)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? `Save failed (${res.status})`)
      }
      cancel()
      await fetchTemplates()
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  async function deactivate(code: string) {
    if (!confirm(`Deactivate template "${code}"? Existing products keep their reference but it won't appear in dropdowns for new products.`))
      return
    setError(null)
    try {
      const res = await fetch(`/api/warranty-templates/${encodeURIComponent(code)}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? `Failed (${res.status})`)
      }
      await fetchTemplates()
    } catch (e) {
      setError(String(e))
    }
  }

  if (loading) return <p className="text-sm text-secondary">Loading…</p>

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center justify-between">
        <p className="text-sm text-secondary">
          Templates appear on product detail pages. Auto-fill kicks in when a product&apos;s
          vendor matches <span className="font-mono text-primary">default_for_vendor</span>{' '}
          and condition matches <span className="font-mono text-primary">applies_to_condition</span>.
        </p>
        {editing === null && (
          <button
            onClick={startCreate}
            className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-md hover:bg-accent-hi transition-colors"
          >
            + New template
          </button>
        )}
      </div>

      {error && (
        <div className="bg-fail/10 border border-fail/25 text-fail rounded-md px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {editing !== null && (
        <div className="bg-surface border border-edge rounded-lg p-5 space-y-4">
          <h3 className="text-sm font-semibold text-primary">
            {editing === 'new' ? 'New template' : `Edit ${editing}`}
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Code *</label>
              <input
                className={inputCls}
                placeholder="e.g. 3yr_parts_labour"
                value={draft.code}
                disabled={editing !== 'new'}
                onChange={(e) => setDraft({ ...draft, code: e.target.value })}
              />
              <p className="mt-1 text-xs text-secondary">Stable identifier — cannot be changed after creation.</p>
            </div>
            <div>
              <label className={labelCls}>Label *</label>
              <input
                className={inputCls}
                placeholder="3 years parts & labour"
                value={draft.label}
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
              />
            </div>
            <div>
              <label className={labelCls}>Applies to condition</label>
              <select
                className={inputCls}
                value={draft.applies_to_condition}
                onChange={(e) =>
                  setDraft({ ...draft, applies_to_condition: e.target.value as Draft['applies_to_condition'] })
                }
              >
                <option value="">Any</option>
                <option value="new">New</option>
                <option value="used">Used</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Default for vendor</label>
              <input
                className={inputCls}
                placeholder="e.g. Combisteel (optional)"
                value={draft.default_for_vendor}
                onChange={(e) => setDraft({ ...draft, default_for_vendor: e.target.value })}
              />
            </div>
            <div>
              <label className={labelCls}>Display order</label>
              <input
                className={inputCls}
                type="number"
                value={draft.display_order}
                onChange={(e) => setDraft({ ...draft, display_order: e.target.value })}
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm text-primary cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={draft.active}
                  onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
                  className="h-4 w-4 rounded border-edge bg-surface text-accent focus:ring-accent"
                />
                Active
              </label>
            </div>
          </div>
          <div>
            <label className={labelCls}>Body HTML *</label>
            <textarea
              className={`${inputCls} font-mono text-xs resize-none`}
              rows={10}
              value={draft.body_html}
              onChange={(e) => setDraft({ ...draft, body_html: e.target.value })}
            />
          </div>
          <div className="flex items-center gap-3 border-t border-edge pt-3">
            <button
              onClick={save}
              disabled={saving}
              className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-md hover:bg-accent-hi disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={cancel}
              disabled={saving}
              className="px-4 py-2 text-secondary text-sm rounded-md hover:text-primary hover:bg-overlay disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="bg-surface border border-edge rounded-lg overflow-hidden">
        <table data-testid="warranty-templates-table" className="w-full text-sm">
          <thead className="bg-overlay">
            <tr className="text-left">
              <th className="px-4 py-2 text-xs font-medium text-secondary">Code</th>
              <th className="px-4 py-2 text-xs font-medium text-secondary">Label</th>
              <th className="px-4 py-2 text-xs font-medium text-secondary">Condition</th>
              <th className="px-4 py-2 text-xs font-medium text-secondary">Default vendor</th>
              <th className="px-4 py-2 text-xs font-medium text-secondary">Order</th>
              <th className="px-4 py-2 text-xs font-medium text-secondary">Active</th>
              <th className="px-4 py-2 text-xs font-medium text-secondary"></th>
            </tr>
          </thead>
          <tbody>
            {templates.map((t) => (
              <tr key={t.code} className="border-t border-edge">
                <td className="px-4 py-2 font-mono text-xs text-primary">{t.code}</td>
                <td className="px-4 py-2 text-primary">{t.label}</td>
                <td className="px-4 py-2 text-secondary">{t.applies_to_condition ?? '—'}</td>
                <td className="px-4 py-2 text-secondary">{t.default_for_vendor ?? '—'}</td>
                <td className="px-4 py-2 text-secondary">{t.display_order}</td>
                <td className="px-4 py-2">
                  {t.active ? (
                    <span className="text-ok text-xs">Active</span>
                  ) : (
                    <span className="text-secondary text-xs">Inactive</span>
                  )}
                </td>
                <td className="px-4 py-2 text-right">
                  <button
                    onClick={() => startEdit(t)}
                    className="text-xs text-accent hover:underline mr-3"
                  >
                    Edit
                  </button>
                  {t.active && (
                    <button
                      onClick={() => deactivate(t.code)}
                      className="text-xs text-secondary hover:text-fail"
                    >
                      Deactivate
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <BulkAssignPanel templates={templates} onApplied={fetchTemplates} />
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Bulk-assign warranty (WP-7 nice-to-have)
// ──────────────────────────────────────────────────────────────────────────

interface PreviewResponse {
  count: number
  samples: Array<{
    id: string
    sku: string | null
    title: string | null
    vendor: string | null
    condition: string | null
    warranty_term_code: string | null
  }>
  capped: boolean
  max: number
}

function BulkAssignPanel({
  templates,
  onApplied,
}: {
  templates: WarrantyTemplate[]
  onApplied: () => void | Promise<void>
}) {
  const [vendor, setVendor] = useState('')
  const [condition, setCondition] = useState<'' | 'new' | 'used'>('')
  const [currentCode, setCurrentCode] = useState<string>('ANY') // 'ANY' | 'NULL' | <code>
  const [applyCode, setApplyCode] = useState<string>('')
  const [preview, setPreview] = useState<PreviewResponse | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [applied, setApplied] = useState<string | null>(null)

  const activeTemplates = templates.filter((t) => t.active)

  function buildBody() {
    return {
      vendor: vendor.trim() || undefined,
      condition: condition || undefined,
      currentCode, // 'ANY' | 'NULL' | <code>
      applyCode,
    }
  }

  async function runPreview() {
    setBusy(true)
    setErr(null)
    setApplied(null)
    setPreview(null)
    try {
      if (!applyCode) throw new Error('Choose a warranty code to apply')
      const res = await fetch('/api/warranty-templates/bulk-assign?preview=true', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildBody()),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `Preview failed (${res.status})`)
      setPreview(data as PreviewResponse)
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e))
    } finally {
      setBusy(false)
    }
  }

  async function runApply() {
    if (!preview) return
    if (
      !confirm(
        `Apply warranty "${applyCode}" to ${preview.count} product(s)? This cannot be undone in bulk.`
      )
    )
      return
    setBusy(true)
    setErr(null)
    setApplied(null)
    try {
      const res = await fetch('/api/warranty-templates/bulk-assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildBody()),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `Apply failed (${res.status})`)
      setApplied(`Updated ${data.updated} product(s) → ${data.warranty_term_code}`)
      setPreview(null)
      await onApplied()
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      data-testid="bulk-assign-panel"
      className="bg-surface border border-edge rounded-lg p-5 space-y-4"
    >
      <div>
        <h3 className="text-sm font-semibold text-primary">Bulk-assign warranty</h3>
        <p className="mt-1 text-xs text-secondary">
          Apply a warranty code to all matching products in one step. Preview first to see
          how many rows will change. Capped at 5,000 rows per operation.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Vendor (exact, case-insensitive)</label>
          <input
            data-testid="bulk-vendor"
            className={inputCls}
            placeholder="e.g. Combisteel (leave blank for any)"
            value={vendor}
            onChange={(e) => {
              setVendor(e.target.value)
              setPreview(null)
            }}
          />
        </div>
        <div>
          <label className={labelCls}>Condition</label>
          <select
            data-testid="bulk-condition"
            className={inputCls}
            value={condition}
            onChange={(e) => {
              setCondition(e.target.value as '' | 'new' | 'used')
              setPreview(null)
            }}
          >
            <option value="">Any</option>
            <option value="new">New</option>
            <option value="used">Used</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Currently has</label>
          <select
            data-testid="bulk-current-code"
            className={inputCls}
            value={currentCode}
            onChange={(e) => {
              setCurrentCode(e.target.value)
              setPreview(null)
            }}
          >
            <option value="ANY">Any (will overwrite)</option>
            <option value="NULL">No warranty set</option>
            {templates.map((t) => (
              <option key={t.code} value={t.code}>
                = {t.code}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Apply warranty code *</label>
          <select
            data-testid="bulk-apply-code"
            className={inputCls}
            value={applyCode}
            onChange={(e) => {
              setApplyCode(e.target.value)
              setPreview(null)
            }}
          >
            <option value="">Choose a template…</option>
            {activeTemplates.map((t) => (
              <option key={t.code} value={t.code}>
                {t.code} — {t.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {err && (
        <div className="bg-fail/10 border border-fail/25 text-fail rounded-md px-4 py-3 text-sm">
          {err}
        </div>
      )}
      {applied && (
        <div className="bg-ok/10 border border-ok/25 text-ok rounded-md px-4 py-3 text-sm">
          {applied}
        </div>
      )}

      {preview && (
        <div
          data-testid="bulk-preview-result"
          className="bg-overlay border border-edge rounded-md p-4 space-y-3"
        >
          <p className="text-sm text-primary">
            <span data-testid="bulk-preview-count" className="font-semibold">
              {preview.count}
            </span>{' '}
            product{preview.count === 1 ? '' : 's'} match this filter.
            {preview.capped && (
              <span className="ml-2 text-fail">
                Exceeds {preview.max}-row cap — narrow the filter before applying.
              </span>
            )}
          </p>
          {preview.samples.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-secondary">
                  <tr className="text-left">
                    <th className="px-2 py-1">SKU</th>
                    <th className="px-2 py-1">Title</th>
                    <th className="px-2 py-1">Vendor</th>
                    <th className="px-2 py-1">Cond.</th>
                    <th className="px-2 py-1">Current</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.samples.map((s) => (
                    <tr key={s.id} className="border-t border-edge">
                      <td className="px-2 py-1 font-mono">{s.sku ?? '—'}</td>
                      <td className="px-2 py-1 text-primary">{s.title ?? '—'}</td>
                      <td className="px-2 py-1 text-secondary">{s.vendor ?? '—'}</td>
                      <td className="px-2 py-1 text-secondary">{s.condition ?? '—'}</td>
                      <td className="px-2 py-1 text-secondary">
                        {s.warranty_term_code ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.count > preview.samples.length && (
                <p className="mt-2 text-xs text-secondary">
                  Showing first {preview.samples.length} of {preview.count}.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-3 border-t border-edge pt-3">
        <button
          data-testid="bulk-preview-btn"
          onClick={runPreview}
          disabled={busy || !applyCode}
          className="px-4 py-2 bg-overlay text-primary text-sm font-medium rounded-md hover:bg-edge disabled:opacity-50 transition-colors"
        >
          {busy ? 'Working…' : 'Preview'}
        </button>
        <button
          data-testid="bulk-apply-btn"
          onClick={runApply}
          disabled={busy || !preview || preview.count === 0 || preview.capped}
          className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-md hover:bg-accent-hi disabled:opacity-50 transition-colors"
        >
          Apply
        </button>
        <span className="text-xs text-secondary">
          Apply is enabled only after a successful preview.
        </span>
      </div>
    </div>
  )
}

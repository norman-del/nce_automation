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
        <table className="w-full text-sm">
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
    </div>
  )
}

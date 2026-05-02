'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import SupplierTypeahead, { type QboVendor } from '../new/SupplierTypeahead'
import CollectionTypeahead from '../new/CollectionTypeahead'
import { calculateShippingTier } from '@/lib/products/shipping'

interface WarrantyTemplate {
  code: string
  label: string
  applies_to_condition: 'new' | 'used' | null
  default_for_vendor: string | null
  active: boolean
  display_order: number
}

const SHIPPING_LABELS: Record<number, string> = {
  0: 'Parcel',
  1: 'Single Pallet',
  2: 'Double Pallet',
}

const SHIPPING_COLORS: Record<number, string> = {
  0: 'text-ok',
  1: 'text-warn',
  2: 'text-fail',
}

interface ProductDraft {
  sku_override: string
  title: string
  condition: 'new' | 'used'
  vat_applicable: boolean
  cost_price: string
  selling_price: string
  original_rrp: string
  model_number: string
  year_of_manufacture: string
  electrical_requirements: string
  notes: string
  body_html: string
  width_cm: string
  height_cm: string
  depth_cm: string
  dimensions_unknown: boolean
  weight_kg: string
  supplier: QboVendor | null
  product_type: string
  vendor: string
  collections: { id: string; title: string }[]
  tags: string
  free_delivery_included: boolean
  warranty_term_code: string
  warranty_user_set: boolean
  shipping_tier_override: '' | '0' | '1' | '2'
  photos: File[]
}

function emptyDraft(): ProductDraft {
  return {
    sku_override: '', title: '', condition: 'used', vat_applicable: false,
    cost_price: '', selling_price: '', original_rrp: '',
    model_number: '', year_of_manufacture: '', electrical_requirements: '',
    notes: '', body_html: '', width_cm: '', height_cm: '', depth_cm: '', dimensions_unknown: false, weight_kg: '',
    supplier: null, product_type: '', vendor: '', collections: [], tags: '',
    free_delivery_included: false,
    warranty_term_code: '',
    warranty_user_set: false,
    shipping_tier_override: '',
    photos: [],
  }
}

interface Props {
  productTypes: string[]
  vendors: string[]
}

export default function ProductFormStrategic({ productTypes, vendors }: Props) {
  const router = useRouter()
  const [draft, setDraft] = useState<ProductDraft>(emptyDraft())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [missing, setMissing] = useState<string[]>([])
  const [success, setSuccess] = useState<{ sku: string; id: string; photoErrors: string[] } | null>(null)
  const [warrantyTemplates, setWarrantyTemplates] = useState<WarrantyTemplate[]>([])

  useEffect(() => {
    fetch('/api/warranty-templates')
      .then((r) => (r.ok ? r.json() : []))
      .then((data: WarrantyTemplate[]) => setWarrantyTemplates(data.filter((t) => t.active)))
      .catch(() => setWarrantyTemplates([]))
  }, [])

  function update(patch: Partial<ProductDraft>) {
    setDraft((d) => {
      const next = { ...d, ...patch }
      if (
        (patch.vendor !== undefined || patch.condition !== undefined) &&
        !next.warranty_user_set
      ) {
        const match =
          warrantyTemplates.find(
            (t) =>
              t.default_for_vendor &&
              t.default_for_vendor.toLowerCase() === next.vendor.trim().toLowerCase() &&
              (t.applies_to_condition === null || t.applies_to_condition === next.condition)
          ) ?? null
        if (match) next.warranty_term_code = match.code
      }
      return next
    })
  }

  function validate(): string[] {
    const m: string[] = []
    if (!draft.title.trim()) m.push('Title')
    if (!draft.cost_price || parseFloat(draft.cost_price) <= 0) m.push('Cost Price')
    if (!draft.selling_price || parseFloat(draft.selling_price) <= 0) m.push('Selling Price')
    if (!draft.dimensions_unknown) {
      const w = parseFloat(draft.width_cm)
      const h = parseFloat(draft.height_cm)
      const dp = parseFloat(draft.depth_cm)
      if (!draft.width_cm || w <= 0 || w >= 500) m.push('Width')
      if (!draft.height_cm || h <= 0 || h >= 500) m.push('Height')
      if (!draft.depth_cm || dp <= 0 || dp >= 500) m.push('Depth')
    }
    if (!draft.product_type.trim()) m.push('Product Type')
    if (!draft.vendor.trim()) m.push('Vendor / Brand')
    return m
  }

  async function uploadPhotos(productId: string, files: File[]): Promise<string[]> {
    if (files.length === 0) return []
    const fd = new FormData()
    files.forEach((f) => fd.append('images', f))
    const res = await fetch(`/api/products-strategic/${productId}/photos`, {
      method: 'POST',
      body: fd,
    })
    const data = await res.json().catch(() => ({}))
    return (data?.errors as string[]) ?? []
  }

  async function handleSubmit() {
    const m = validate()
    setMissing(m)
    if (m.length > 0) return
    setSaving(true)
    setError(null)
    setSuccess(null)

    const payload = {
      sku_override: draft.sku_override.trim() || undefined,
      title: draft.title,
      condition: draft.condition,
      vat_applicable: draft.vat_applicable,
      cost_price: parseFloat(draft.cost_price) || 0,
      selling_price: parseFloat(draft.selling_price) || 0,
      original_rrp: draft.original_rrp ? parseFloat(draft.original_rrp) : null,
      model_number: draft.model_number || null,
      year_of_manufacture: draft.year_of_manufacture ? parseInt(draft.year_of_manufacture, 10) : null,
      electrical_requirements: draft.electrical_requirements || null,
      notes: draft.dimensions_unknown
        ? `[DIMENSIONS PENDING]${draft.notes ? '\n' + draft.notes : ''}`
        : (draft.notes || null),
      body_html: draft.body_html || null,
      width_cm: draft.dimensions_unknown ? 1 : (parseFloat(draft.width_cm) || 0),
      height_cm: draft.dimensions_unknown ? 1 : (parseFloat(draft.height_cm) || 0),
      depth_cm: draft.dimensions_unknown ? 1 : (parseFloat(draft.depth_cm) || 0),
      weight_kg: draft.weight_kg ? parseFloat(draft.weight_kg) : null,
      qbo_vendor_id: draft.supplier?.id || null,
      qbo_vendor_name: draft.supplier?.name || null,
      product_type: draft.product_type,
      vendor: draft.vendor,
      collections: draft.collections.map((c) => c.id),
      tags: draft.tags.split(',').map((t) => t.trim()).filter(Boolean),
      free_delivery_included: draft.free_delivery_included,
      warranty_term_code: draft.warranty_term_code || null,
      shipping_tier_override: draft.shipping_tier_override === '' ? null : (parseInt(draft.shipping_tier_override, 10) as 0 | 1 | 2),
    }

    try {
      const res = await fetch('/api/products-strategic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok && res.status !== 207) {
        setError(data?.error || `HTTP ${res.status}`)
        return
      }
      const result = data.products?.[0]
      if (!result || result.error) {
        setError(result?.error || 'Unknown error')
        return
      }
      // Upload photos if any
      const photoErrors = await uploadPhotos(result.id, draft.photos)
      setSuccess({ sku: result.sku, id: result.id, photoErrors })
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  const shippingTier = useMemo(() => {
    const w = parseFloat(draft.width_cm)
    const h = parseFloat(draft.height_cm)
    const d = parseFloat(draft.depth_cm)
    const wt = draft.weight_kg ? parseFloat(draft.weight_kg) : null
    if (isNaN(w) || isNaN(h) || isNaN(d)) return null
    return calculateShippingTier(w, h, d, wt)
  }, [draft.width_cm, draft.height_cm, draft.depth_cm, draft.weight_kg])

  const eligibleWarranties = warrantyTemplates.filter(
    (t) => t.applies_to_condition === null || t.applies_to_condition === draft.condition
  )

  const missingSet = new Set(missing)
  const inputCls = 'w-full bg-surface border border-edge rounded-md px-3 py-2 text-sm text-primary placeholder:text-secondary/50 focus:outline-none focus:border-accent'
  const inputErr = 'w-full bg-surface border border-fail rounded-md px-3 py-2 text-sm text-primary placeholder:text-secondary/50 focus:outline-none focus:border-fail'
  const labelCls = 'block text-xs font-medium text-secondary mb-1'

  if (success) {
    return (
      <div className="space-y-4">
        <div className="bg-ok/10 border border-ok/25 text-ok rounded-md px-4 py-3 text-sm">
          Created <strong>{success.sku}</strong>. Saved to Supabase + QBO. Photos uploaded to Supabase Storage.
        </div>
        {success.photoErrors.length > 0 && (
          <div className="bg-warn/10 border border-warn/25 text-warn rounded-md px-4 py-3 text-sm">
            Some photos failed: {success.photoErrors.join('; ')}
          </div>
        )}
        <div className="flex gap-2">
          <button
            onClick={() => { setSuccess(null); setDraft(emptyDraft()) }}
            className="px-4 py-2 text-sm bg-accent text-white rounded-md hover:bg-accent-hi"
          >
            Add another
          </button>
          <button
            onClick={() => router.push(`/products/${success.id}`)}
            className="px-4 py-2 text-sm border border-edge text-secondary rounded-md hover:text-primary"
          >
            View product
          </button>
          <button
            onClick={() => router.push('/products')}
            className="px-4 py-2 text-sm text-secondary rounded-md hover:text-primary"
          >
            Back to products
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {missing.length > 0 && (
        <div className="bg-fail/10 border border-fail/25 text-fail rounded-md px-3 py-2 text-sm">
          Missing required fields: {missing.join(', ')}
        </div>
      )}
      {error && (
        <div className="bg-fail/10 border border-fail/25 text-fail rounded-md px-3 py-2 text-sm">{error}</div>
      )}

      <div className="bg-surface border border-edge rounded-lg p-6 space-y-5">
        <fieldset className="space-y-3">
          <legend className="text-xs font-semibold text-accent uppercase tracking-wide mb-2">Product Details</legend>
          <div className="grid grid-cols-[120px_1fr] gap-3">
            <div>
              <label className={labelCls}>SKU</label>
              <input className={inputCls} placeholder="Auto" value={draft.sku_override} onChange={(e) => update({ sku_override: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Title *</label>
              <input className={missingSet.has('Title') ? inputErr : inputCls} placeholder="e.g. Foster Xtra Single Upright Fridge" value={draft.title} onChange={(e) => update({ title: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className={labelCls}>Condition *</label>
              <select className={inputCls} value={draft.condition} onChange={(e) => update({ condition: e.target.value as 'new' | 'used' })}>
                <option value="used">Used</option>
                <option value="new">New</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>VAT Applicable</label>
              <select className={inputCls} value={draft.vat_applicable ? 'yes' : 'no'} onChange={(e) => update({ vat_applicable: e.target.value === 'yes' })}>
                <option value="no">No (Margin Scheme)</option>
                <option value="yes">Yes (20%)</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Cost Price (£) *</label>
              <input className={missingSet.has('Cost Price') ? inputErr : inputCls} type="number" step="0.01" min="0" value={draft.cost_price} onChange={(e) => update({ cost_price: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Selling Price (£) *</label>
              <input className={missingSet.has('Selling Price') ? inputErr : inputCls} type="number" step="0.01" min="0" value={draft.selling_price} onChange={(e) => update({ selling_price: e.target.value })} />
            </div>
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-xs font-semibold text-accent uppercase tracking-wide mb-2">Model & Specs</legend>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className={labelCls}>Model Number</label>
              <input className={inputCls} value={draft.model_number} onChange={(e) => update({ model_number: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Year of Manufacture</label>
              <input className={inputCls} type="number" min="1990" max="2030" value={draft.year_of_manufacture} onChange={(e) => update({ year_of_manufacture: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Electrical Requirements</label>
              <input className={inputCls} value={draft.electrical_requirements} onChange={(e) => update({ electrical_requirements: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Original RRP (£)</label>
              <input className={inputCls} type="number" step="0.01" min="0" value={draft.original_rrp} onChange={(e) => update({ original_rrp: e.target.value })} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Notes</label>
            <textarea className={`${inputCls} resize-none`} rows={2} value={draft.notes} onChange={(e) => update({ notes: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Description</label>
            <textarea className={`${inputCls} resize-none`} rows={4} placeholder="Product description (shown on storefront)..." value={draft.body_html} onChange={(e) => update({ body_html: e.target.value })} />
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-xs font-semibold text-accent uppercase tracking-wide mb-2">Dimensions & Shipping</legend>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className={labelCls}>Width (cm) *</label>
              <input className={missingSet.has('Width') ? inputErr : inputCls} type="number" step="0.1" min="0" max="500" value={draft.dimensions_unknown ? '' : draft.width_cm} disabled={draft.dimensions_unknown} onChange={(e) => update({ width_cm: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Height (cm) *</label>
              <input className={missingSet.has('Height') ? inputErr : inputCls} type="number" step="0.1" min="0" max="500" value={draft.dimensions_unknown ? '' : draft.height_cm} disabled={draft.dimensions_unknown} onChange={(e) => update({ height_cm: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Depth (cm) *</label>
              <input className={missingSet.has('Depth') ? inputErr : inputCls} type="number" step="0.1" min="0" max="500" value={draft.dimensions_unknown ? '' : draft.depth_cm} disabled={draft.dimensions_unknown} onChange={(e) => update({ depth_cm: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Weight (kg)</label>
              <input className={inputCls} type="number" step="0.1" min="0" placeholder="Optional" value={draft.weight_kg} onChange={(e) => update({ weight_kg: e.target.value })} />
            </div>
          </div>
          <p className="text-xs text-secondary mt-1">
            Width = front, left to right. Depth = front to back. Height = floor to top.
          </p>
          <label className="flex items-center gap-2 text-sm text-secondary mt-2 cursor-pointer">
            <input type="checkbox" checked={draft.dimensions_unknown} onChange={(e) => update({ dimensions_unknown: e.target.checked })} />
            <span>Dimensions unknown — flag for follow-up</span>
          </label>
          <div className="flex items-center gap-3 text-sm flex-wrap">
            <span className="text-secondary">Shipping tier:</span>
            <select
              className={inputCls + ' max-w-xs'}
              value={draft.shipping_tier_override}
              onChange={(e) => update({ shipping_tier_override: e.target.value as ProductDraft['shipping_tier_override'] })}
            >
              <option value="">Auto{shippingTier !== null ? ` (${SHIPPING_LABELS[shippingTier]})` : ''}</option>
              <option value="0">Parcel (override)</option>
              <option value="1">Single Pallet (override)</option>
              <option value="2">Double Pallet (override)</option>
            </select>
            {draft.shipping_tier_override === '' && shippingTier !== null && (
              <span className={`font-medium ${SHIPPING_COLORS[shippingTier]}`}>
                {SHIPPING_LABELS[shippingTier]}
              </span>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm text-primary cursor-pointer select-none">
            <input
              type="checkbox"
              checked={draft.free_delivery_included}
              onChange={(e) => update({ free_delivery_included: e.target.checked })}
              className="h-4 w-4 rounded border-edge bg-surface text-accent focus:ring-accent"
            />
            Delivery included in price
          </label>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-xs font-semibold text-accent uppercase tracking-wide mb-2">Classification</legend>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Product Type *</label>
              <input className={missingSet.has('Product Type') ? inputErr : inputCls} list="product-types" value={draft.product_type} onChange={(e) => update({ product_type: e.target.value })} />
              <datalist id="product-types">
                {productTypes.map((t) => <option key={t} value={t} />)}
              </datalist>
            </div>
            <div>
              <label className={labelCls}>Vendor / Brand *</label>
              <input className={missingSet.has('Vendor / Brand') ? inputErr : inputCls} list="vendors-list" value={draft.vendor} onChange={(e) => update({ vendor: e.target.value })} />
              <datalist id="vendors-list">
                {vendors.map((v) => <option key={v} value={v} />)}
              </datalist>
            </div>
          </div>
          <div>
            <label className={labelCls}>Collections</label>
            <CollectionTypeahead value={draft.collections} onChange={(collections) => update({ collections })} />
          </div>
          <div>
            <label className={labelCls}>Tags</label>
            <input className={inputCls} placeholder="Comma-separated" value={draft.tags} onChange={(e) => update({ tags: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Warranty</label>
            <select
              className={inputCls}
              value={draft.warranty_term_code}
              onChange={(e) => update({ warranty_term_code: e.target.value, warranty_user_set: true })}
            >
              <option value="">— None —</option>
              {eligibleWarranties.map((t) => (
                <option key={t.code} value={t.code}>
                  {t.label}{t.default_for_vendor ? ` (default for ${t.default_for_vendor})` : ''}
                </option>
              ))}
            </select>
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-xs font-semibold text-accent uppercase tracking-wide mb-2">Supplier</legend>
          <SupplierTypeahead value={draft.supplier} onChange={(s) => update({ supplier: s })} />
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-xs font-semibold text-accent uppercase tracking-wide mb-2">Photos</legend>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            multiple
            onChange={(e) => update({ photos: Array.from(e.target.files ?? []) })}
            className="text-sm text-secondary"
          />
          {draft.photos.length > 0 && (
            <p className="text-xs text-secondary">
              {draft.photos.length} file(s) ready: {draft.photos.map((f) => f.name).join(', ')}
            </p>
          )}
          <p className="text-xs text-secondary">
            Photos upload to Supabase Storage (`product-images` bucket). Public URLs are written to `product_images.src`.
          </p>
        </fieldset>
      </div>

      <div className="flex items-center gap-3 border-t border-edge pt-4">
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="px-5 py-2.5 bg-accent text-white text-sm font-medium rounded-md hover:bg-accent-hi disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Product'}
        </button>
        <button
          onClick={() => router.push('/products')}
          disabled={saving}
          className="px-5 py-2.5 text-secondary text-sm rounded-md hover:text-primary"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

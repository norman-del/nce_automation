'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import SupplierTypeahead, { type QboVendor } from './SupplierTypeahead'
import CollectionTypeahead from './CollectionTypeahead'
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

interface DeliveryProfile {
  id: string
  name: string
  default: boolean
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
  shopify_delivery_profile_id: string
  free_delivery_included: boolean
  warranty_term_code: string
  warranty_user_set: boolean
  shipping_tier_override: '' | '0' | '1' | '2'
}

function emptyDraft(): ProductDraft {
  return {
    sku_override: '', title: '', condition: 'used', vat_applicable: false,
    cost_price: '', selling_price: '', original_rrp: '',
    model_number: '', year_of_manufacture: '', electrical_requirements: '',
    notes: '', body_html: '', width_cm: '', height_cm: '', depth_cm: '', dimensions_unknown: false, weight_kg: '',
    supplier: null, product_type: '', vendor: '', collections: [] as { id: string; title: string }[], tags: '',
    shopify_delivery_profile_id: '',
    free_delivery_included: false,
    warranty_term_code: '',
    warranty_user_set: false,
    shipping_tier_override: '',
  }
}

interface Props {
  productTypes: string[]
  vendors: string[]
  deliveryProfiles: DeliveryProfile[]
}

export default function ProductForm({ productTypes, vendors, deliveryProfiles }: Props) {
  const router = useRouter()
  const [drafts, setDrafts] = useState<ProductDraft[]>([emptyDraft()])
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<(string | null)[]>([])
  const [successCount, setSuccessCount] = useState(0)
  const [warrantyTemplates, setWarrantyTemplates] = useState<WarrantyTemplate[]>([])

  useEffect(() => {
    fetch('/api/warranty-templates')
      .then((r) => (r.ok ? r.json() : []))
      .then((data: WarrantyTemplate[]) => setWarrantyTemplates(data.filter((t) => t.active)))
      .catch(() => setWarrantyTemplates([]))
  }, [])

  function updateDraft(index: number, patch: Partial<ProductDraft>) {
    setDrafts((prev) =>
      prev.map((d, i) => {
        if (i !== index) return d
        const next = { ...d, ...patch }
        // Auto-preselect warranty template when vendor or condition changes
        // and the user hasn't manually set one yet. Only fires on a fresh
        // form (warranty_user_set=false). Match priority: vendor + condition,
        // then condition only.
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
    )
  }

  function removeDraft(index: number) {
    if (drafts.length === 1) return
    setDrafts((prev) => prev.filter((_, i) => i !== index))
  }

  const [fieldErrors, setFieldErrors] = useState<Record<number, string[]>>({})

  function validateDraft(draft: ProductDraft, index: number): string[] {
    const missing: string[] = []
    if (!draft.title.trim()) missing.push('Title')
    if (!draft.cost_price || parseFloat(draft.cost_price) <= 0) missing.push('Cost Price')
    if (!draft.selling_price || parseFloat(draft.selling_price) <= 0) missing.push('Selling Price')
    if (!draft.dimensions_unknown) {
      const w = parseFloat(draft.width_cm)
      const h = parseFloat(draft.height_cm)
      const dp = parseFloat(draft.depth_cm)
      if (!draft.width_cm || w <= 0 || w >= 500) missing.push('Width')
      if (!draft.height_cm || h <= 0 || h >= 500) missing.push('Height')
      if (!draft.depth_cm || dp <= 0 || dp >= 500) missing.push('Depth')
    }
    if (!draft.product_type.trim()) missing.push('Product Type')
    if (!draft.vendor.trim()) missing.push('Vendor / Brand')
    return missing
  }

  async function handleSubmit(andAddAnother: boolean) {
    // Validate all drafts before submitting
    const newFieldErrors: Record<number, string[]> = {}
    let hasValidationErrors = false
    drafts.forEach((d, i) => {
      const missing = validateDraft(d, i)
      if (missing.length > 0) {
        newFieldErrors[i] = missing
        hasValidationErrors = true
      }
    })
    setFieldErrors(newFieldErrors)
    if (hasValidationErrors) return

    setSaving(true)
    setErrors([])
    setSuccessCount(0)

    const payloads = drafts.map((d) => ({
      sku_override: d.sku_override.trim() || undefined,
      title: d.title,
      condition: d.condition,
      vat_applicable: d.vat_applicable,
      cost_price: parseFloat(d.cost_price) || 0,
      selling_price: parseFloat(d.selling_price) || 0,
      original_rrp: d.original_rrp ? parseFloat(d.original_rrp) : null,
      model_number: d.model_number || null,
      year_of_manufacture: d.year_of_manufacture ? parseInt(d.year_of_manufacture, 10) : null,
      electrical_requirements: d.electrical_requirements || null,
      notes: d.dimensions_unknown
        ? `[DIMENSIONS PENDING]${d.notes ? '\n' + d.notes : ''}`
        : (d.notes || null),
      body_html: d.body_html || null,
      width_cm: d.dimensions_unknown ? 1 : (parseFloat(d.width_cm) || 0),
      height_cm: d.dimensions_unknown ? 1 : (parseFloat(d.height_cm) || 0),
      depth_cm: d.dimensions_unknown ? 1 : (parseFloat(d.depth_cm) || 0),
      weight_kg: d.weight_kg ? parseFloat(d.weight_kg) : null,
      qbo_vendor_id: d.supplier?.id || null,
      qbo_vendor_name: d.supplier?.name || null,
      product_type: d.product_type,
      vendor: d.vendor,
      collections: d.collections.map((c) => c.id),
      tags: d.tags.split(',').map((t) => t.trim()).filter(Boolean),
      shopify_delivery_profile_id: d.shopify_delivery_profile_id || null,
      free_delivery_included: d.free_delivery_included,
      warranty_term_code: d.warranty_term_code || null,
      shipping_tier_override: d.shipping_tier_override === '' ? null : (parseInt(d.shipping_tier_override, 10) as 0 | 1 | 2),
    }))

    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloads.length === 1 ? payloads[0] : payloads),
      })
      const data = await res.json()
      const results: { sku: string; id: string; error?: string }[] = data.products || []

      const newErrors = results.map((r) => r.error || null)
      setErrors(newErrors)

      const successes = results.filter((r) => !r.error).length
      setSuccessCount(successes)

      if (successes > 0 && !newErrors.some(Boolean)) {
        if (andAddAnother) {
          // Keep the supplier from the first draft for convenience
          const keepSupplier = drafts[0].supplier
          setDrafts([{ ...emptyDraft(), supplier: keepSupplier }])
        } else {
          router.push('/products')
        }
      }
    } catch (e) {
      setErrors([String(e)])
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {successCount > 0 && (
        <div className="bg-ok/10 border border-ok/25 text-ok rounded-md px-4 py-3 text-sm">
          {successCount} product{successCount > 1 ? 's' : ''} created successfully
        </div>
      )}

      {drafts.map((draft, idx) => (
        <ProductCard
          key={idx}
          draft={draft}
          index={idx}
          total={drafts.length}
          error={errors[idx] || null}
          missingFields={fieldErrors[idx] || []}
          productTypes={productTypes}
          vendors={vendors}
          deliveryProfiles={deliveryProfiles}
          warrantyTemplates={warrantyTemplates}
          onChange={(patch) => { updateDraft(idx, patch); setFieldErrors((prev) => { const next = { ...prev }; delete next[idx]; return next }) }}
          onRemove={() => removeDraft(idx)}
        />
      ))}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            const keepSupplier = drafts[0]?.supplier
            setDrafts((prev) => [...prev, { ...emptyDraft(), supplier: keepSupplier }])
          }}
          className="px-4 py-2 text-sm border border-edge text-secondary hover:text-primary hover:bg-overlay rounded-md transition-colors"
        >
          + Add Another Product
        </button>
      </div>

      <div className="flex items-center gap-3 border-t border-edge pt-4">
        <button
          onClick={() => handleSubmit(false)}
          disabled={saving}
          className="px-5 py-2.5 bg-accent text-white text-sm font-medium rounded-md hover:bg-accent-hi disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving...' : drafts.length > 1 ? `Save ${drafts.length} Products` : 'Save Product'}
        </button>
        <button
          onClick={() => handleSubmit(true)}
          disabled={saving}
          className="px-5 py-2.5 border border-accent text-accent text-sm font-medium rounded-md hover:bg-accent/10 disabled:opacity-50 transition-colors"
        >
          Save & Add Another
        </button>
        <button
          onClick={() => router.push('/products')}
          disabled={saving}
          className="px-5 py-2.5 text-secondary text-sm rounded-md hover:text-primary hover:bg-overlay disabled:opacity-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Single product card                                                 */
/* ------------------------------------------------------------------ */

interface CardProps {
  draft: ProductDraft
  index: number
  total: number
  error: string | null
  missingFields: string[]
  productTypes: string[]
  vendors: string[]
  deliveryProfiles: DeliveryProfile[]
  warrantyTemplates: WarrantyTemplate[]
  onChange: (patch: Partial<ProductDraft>) => void
  onRemove: () => void
}

function ProductCard({ draft, index, total, error, missingFields, productTypes, vendors, deliveryProfiles, warrantyTemplates, onChange, onRemove }: CardProps) {
  const eligibleWarranties = warrantyTemplates.filter(
    (t) => t.applies_to_condition === null || t.applies_to_condition === draft.condition
  )
  const shippingTier = useMemo(() => {
    const w = parseFloat(draft.width_cm)
    const h = parseFloat(draft.height_cm)
    const d = parseFloat(draft.depth_cm)
    const wt = draft.weight_kg ? parseFloat(draft.weight_kg) : null
    if (isNaN(w) || isNaN(h) || isNaN(d)) return null
    return calculateShippingTier(w, h, d, wt)
  }, [draft.width_cm, draft.height_cm, draft.depth_cm, draft.weight_kg])

  const missingSet = new Set(missingFields)
  const inputCls = 'w-full bg-surface border border-edge rounded-md px-3 py-2 text-sm text-primary placeholder:text-secondary/50 focus:outline-none focus:border-accent'
  const inputErr = 'w-full bg-surface border border-fail rounded-md px-3 py-2 text-sm text-primary placeholder:text-secondary/50 focus:outline-none focus:border-fail'
  const labelCls = 'block text-xs font-medium text-secondary mb-1'

  return (
    <div className="bg-surface border border-edge rounded-lg p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-primary">
          {total > 1 ? `Product ${index + 1}` : 'New Product'}
        </h3>
        {total > 1 && (
          <button type="button" onClick={onRemove} className="text-xs text-secondary hover:text-fail">
            Remove
          </button>
        )}
      </div>

      {missingFields.length > 0 && (
        <div className="bg-fail/10 border border-fail/25 text-fail rounded-md px-3 py-2 text-sm">
          Missing required fields: {missingFields.join(', ')}
        </div>
      )}

      {error && (
        <div className="bg-fail/10 border border-fail/25 text-fail rounded-md px-3 py-2 text-sm">{error}</div>
      )}

      {/* Product Details */}
      <fieldset className="space-y-3">
        <legend className="text-xs font-semibold text-accent uppercase tracking-wide mb-2">Product Details</legend>
        <div className="grid grid-cols-[120px_1fr] gap-3">
          <div>
            <label className={labelCls}>SKU</label>
            <input className={inputCls} placeholder="Auto" value={draft.sku_override} onChange={(e) => onChange({ sku_override: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Title *</label>
            <input className={missingSet.has('Title') ? inputErr : inputCls} placeholder="e.g. Foster Xtra Single Upright Fridge" value={draft.title} onChange={(e) => onChange({ title: e.target.value })} />
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className={labelCls}>Condition *</label>
            <select className={inputCls} value={draft.condition} onChange={(e) => onChange({ condition: e.target.value as 'new' | 'used' })}>
              <option value="used">Used</option>
              <option value="new">New</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>VAT Applicable</label>
            <select className={inputCls} value={draft.vat_applicable ? 'yes' : 'no'} onChange={(e) => onChange({ vat_applicable: e.target.value === 'yes' })}>
              <option value="no">No (Margin Scheme)</option>
              <option value="yes">Yes (20%)</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Cost Price (£) *</label>
            <input className={missingSet.has('Cost Price') ? inputErr : inputCls} type="number" step="0.01" min="0" placeholder="0.00" value={draft.cost_price} onChange={(e) => onChange({ cost_price: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Selling Price (£) *</label>
            <input className={missingSet.has('Selling Price') ? inputErr : inputCls} type="number" step="0.01" min="0" placeholder="0.00" value={draft.selling_price} onChange={(e) => onChange({ selling_price: e.target.value })} />
          </div>
        </div>
      </fieldset>

      {/* Model & Specs */}
      <fieldset className="space-y-3">
        <legend className="text-xs font-semibold text-accent uppercase tracking-wide mb-2">Model & Specs</legend>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className={labelCls}>Model Number</label>
            <input className={inputCls} placeholder="e.g. Xr600h" value={draft.model_number} onChange={(e) => onChange({ model_number: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Year of Manufacture</label>
            <input className={inputCls} type="number" min="1990" max="2030" placeholder="e.g. 2020" value={draft.year_of_manufacture} onChange={(e) => onChange({ year_of_manufacture: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Electrical Requirements</label>
            <input className={inputCls} placeholder="e.g. 32amp 3ph" value={draft.electrical_requirements} onChange={(e) => onChange({ electrical_requirements: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Original RRP (£)</label>
            <input className={inputCls} type="number" step="0.01" min="0" placeholder="0.00" value={draft.original_rrp} onChange={(e) => onChange({ original_rrp: e.target.value })} />
          </div>
        </div>
        <div>
          <label className={labelCls}>Notes</label>
          <textarea className={`${inputCls} resize-none`} rows={2} placeholder="Any additional info..." value={draft.notes} onChange={(e) => onChange({ notes: e.target.value })} />
        </div>
        <div>
          <label className={labelCls}>Description</label>
          <textarea className={`${inputCls} resize-none`} rows={4} placeholder="Product description (shown on storefront)..." value={draft.body_html} onChange={(e) => onChange({ body_html: e.target.value })} />
        </div>
      </fieldset>

      {/* Dimensions & Shipping */}
      <fieldset className="space-y-3">
        <legend className="text-xs font-semibold text-accent uppercase tracking-wide mb-2">Dimensions & Shipping</legend>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className={labelCls}>Width (cm) *</label>
            <input className={missingSet.has('Width') ? inputErr : inputCls} type="number" step="0.1" min="0" max="500" placeholder="0" value={draft.dimensions_unknown ? '' : draft.width_cm} disabled={draft.dimensions_unknown} onChange={(e) => onChange({ width_cm: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Height (cm) *</label>
            <input className={missingSet.has('Height') ? inputErr : inputCls} type="number" step="0.1" min="0" max="500" placeholder="0" value={draft.dimensions_unknown ? '' : draft.height_cm} disabled={draft.dimensions_unknown} onChange={(e) => onChange({ height_cm: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Depth (cm) *</label>
            <input className={missingSet.has('Depth') ? inputErr : inputCls} type="number" step="0.1" min="0" max="500" placeholder="0" value={draft.dimensions_unknown ? '' : draft.depth_cm} disabled={draft.dimensions_unknown} onChange={(e) => onChange({ depth_cm: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Weight (kg)</label>
            <input className={inputCls} type="number" step="0.1" min="0" placeholder="Optional" value={draft.weight_kg} onChange={(e) => onChange({ weight_kg: e.target.value })} />
          </div>
        </div>
        <p className="text-xs text-secondary mt-1">
          Width = front, left to right. Depth = front to back. Height = floor to top. Spec sheets vary (some quote W×H×D, others W×D×H) — double-check before typing. Values must be between 0 and 500 cm.
        </p>
        <label className="flex items-center gap-2 text-sm text-secondary mt-2 cursor-pointer">
          <input type="checkbox" checked={draft.dimensions_unknown} onChange={(e) => onChange({ dimensions_unknown: e.target.checked })} />
          <span>Dimensions unknown — flag for follow-up (saves with [DIMENSIONS PENDING] in notes)</span>
        </label>
        <div className="flex items-center gap-3 text-sm flex-wrap">
          <span className="text-secondary">Shipping tier:</span>
          <select
            className={inputCls + ' max-w-xs'}
            value={draft.shipping_tier_override}
            onChange={(e) => onChange({ shipping_tier_override: e.target.value as ProductDraft['shipping_tier_override'] })}
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
          {draft.shipping_tier_override !== '' && (
            <span className="text-xs text-secondary">(overriding auto)</span>
          )}
        </div>
        {deliveryProfiles.length > 0 && (
          <div>
            <label className={labelCls}>Shopify Delivery Profile</label>
            <select
              className={inputCls}
              value={draft.shopify_delivery_profile_id}
              onChange={(e) => onChange({ shopify_delivery_profile_id: e.target.value })}
            >
              <option value="">— Use default (assign manually later) —</option>
              {deliveryProfiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}{p.default ? ' (store default)' : ''}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-secondary">
              Picks which Shopify shipping profile this product belongs to (e.g. Pallet, Small Courier, Free Shipping).
            </p>
          </div>
        )}
        <label className="flex items-center gap-2 text-sm text-primary cursor-pointer select-none">
          <input
            type="checkbox"
            checked={draft.free_delivery_included}
            onChange={(e) => onChange({ free_delivery_included: e.target.checked })}
            className="h-4 w-4 rounded border-edge bg-surface text-accent focus:ring-accent"
          />
          Delivery included in price
          <span className="text-xs text-secondary">
            (storefront suppresses shipping charge + shows a free-delivery badge)
          </span>
        </label>
      </fieldset>

      {/* Classification */}
      <fieldset className="space-y-3">
        <legend className="text-xs font-semibold text-accent uppercase tracking-wide mb-2">Classification</legend>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Product Type *</label>
            <input
              className={missingSet.has('Product Type') ? inputErr : inputCls}
              list={`product-types-${index}`}
              placeholder="e.g. Fridges"
              value={draft.product_type}
              onChange={(e) => onChange({ product_type: e.target.value })}
            />
            <datalist id={`product-types-${index}`}>
              {productTypes.map((t) => <option key={t} value={t} />)}
            </datalist>
          </div>
          <div>
            <label className={labelCls}>Vendor / Brand *</label>
            <input
              className={missingSet.has('Vendor / Brand') ? inputErr : inputCls}
              list={`vendors-${index}`}
              placeholder="e.g. Foster"
              value={draft.vendor}
              onChange={(e) => onChange({ vendor: e.target.value })}
            />
            <datalist id={`vendors-${index}`}>
              {vendors.map((v) => <option key={v} value={v} />)}
            </datalist>
          </div>
        </div>
        <div>
          <label className={labelCls}>Collections</label>
          <CollectionTypeahead
            value={draft.collections}
            onChange={(collections) => onChange({ collections })}
          />
        </div>
        <div>
          <label className={labelCls}>Tags</label>
          <input className={inputCls} placeholder="Comma-separated, e.g. Foster, Used, Fridge" value={draft.tags} onChange={(e) => onChange({ tags: e.target.value })} />
        </div>
        <div>
          <label className={labelCls}>Warranty</label>
          <select
            className={inputCls}
            value={draft.warranty_term_code}
            onChange={(e) => onChange({ warranty_term_code: e.target.value, warranty_user_set: true })}
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

      {/* Supplier */}
      <fieldset className="space-y-3">
        <legend className="text-xs font-semibold text-accent uppercase tracking-wide mb-2">Supplier</legend>
        <SupplierTypeahead value={draft.supplier} onChange={(s) => onChange({ supplier: s })} />
      </fieldset>
    </div>
  )
}

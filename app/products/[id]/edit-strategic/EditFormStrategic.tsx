'use client'

// Strategic edit form — mirror of ../edit/EditProductForm minus all Shopify
// fields and the Shopify delivery-profile selector. Writes go to
// /api/products-strategic/[id] (Supabase + QBO only).

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import SupplierTypeahead, { type QboVendor } from '../../new/SupplierTypeahead'
import CollectionTypeahead from '../../new/CollectionTypeahead'
import { calculateShippingTier } from '@/lib/products/shipping'

interface WarrantyTemplate {
  code: string
  label: string
  applies_to_condition: 'new' | 'used' | null
  default_for_vendor: string | null
  active: boolean
  display_order: number
}

const SHIPPING_LABELS: Record<number, string> = { 0: 'Parcel', 1: 'Single Pallet', 2: 'Double Pallet' }
const SHIPPING_COLORS: Record<number, string> = { 0: 'text-ok', 1: 'text-warn', 2: 'text-fail' }

interface Product {
  id: string
  sku: string
  title: string
  condition: 'new' | 'used'
  vat_applicable: boolean
  cost_price: number
  selling_price: number
  original_rrp: number | null
  model_number: string | null
  year_of_manufacture: number | null
  electrical_requirements: string | null
  notes: string | null
  body_html: string | null
  width_cm: number
  height_cm: number
  depth_cm: number
  weight_kg: number | null
  product_type: string
  vendor: string
  collections: string[]
  tags: string[]
  qbo_vendor_id: string | null
  qbo_vendor_name: string | null
  free_delivery_included: boolean
  warranty_term_code: string | null
  shipping_tier_override: number | null
}

interface Props {
  product: Product
  productTypes: string[]
  vendors: string[]
  initialCollections: { id: string; title: string }[]
}

export default function EditFormStrategic({ product, productTypes, vendors, initialCollections }: Props) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [sku, setSku] = useState(product.sku)
  const [title, setTitle] = useState(product.title)
  const [condition, setCondition] = useState(product.condition)
  const [vatApplicable, setVatApplicable] = useState(product.vat_applicable)
  const [costPrice, setCostPrice] = useState(String(product.cost_price))
  const [sellingPrice, setSellingPrice] = useState(String(product.selling_price))
  const [originalRrp, setOriginalRrp] = useState(product.original_rrp ? String(product.original_rrp) : '')
  const [modelNumber, setModelNumber] = useState(product.model_number || '')
  const [yearOfManufacture, setYearOfManufacture] = useState(product.year_of_manufacture ? String(product.year_of_manufacture) : '')
  const [electricalRequirements, setElectricalRequirements] = useState(product.electrical_requirements || '')
  const [notes, setNotes] = useState(product.notes || '')
  const [bodyHtml, setBodyHtml] = useState(product.body_html || '')
  const [widthCm, setWidthCm] = useState(String(product.width_cm))
  const [heightCm, setHeightCm] = useState(String(product.height_cm))
  const [depthCm, setDepthCm] = useState(String(product.depth_cm))
  const [weightKg, setWeightKg] = useState(product.weight_kg ? String(product.weight_kg) : '')
  const [productType, setProductType] = useState(product.product_type)
  const [vendor, setVendor] = useState(product.vendor)
  const [selectedCollections, setSelectedCollections] = useState<{ id: string; title: string }[]>(initialCollections)
  const [tags, setTags] = useState((product.tags || []).join(', '))
  const [supplier, setSupplier] = useState<QboVendor | null>(
    product.qbo_vendor_id ? { id: product.qbo_vendor_id, name: product.qbo_vendor_name || '' } : null
  )
  const [freeDeliveryIncluded, setFreeDeliveryIncluded] = useState(!!product.free_delivery_included)
  const [warrantyTermCode, setWarrantyTermCode] = useState(product.warranty_term_code ?? '')
  const [shippingTierOverride, setShippingTierOverride] = useState<'' | '0' | '1' | '2'>(
    product.shipping_tier_override === null || product.shipping_tier_override === undefined
      ? ''
      : (String(product.shipping_tier_override) as '0' | '1' | '2')
  )
  const [warrantyTemplates, setWarrantyTemplates] = useState<WarrantyTemplate[]>([])

  useEffect(() => {
    fetch('/api/warranty-templates')
      .then((r) => (r.ok ? r.json() : []))
      .then((data: WarrantyTemplate[]) => setWarrantyTemplates(data))
      .catch(() => setWarrantyTemplates([]))
  }, [])

  const eligibleWarranties = warrantyTemplates.filter(
    (t) =>
      (t.active || t.code === warrantyTermCode) &&
      (t.applies_to_condition === null || t.applies_to_condition === condition)
  )

  const shippingTier = useMemo(() => {
    const w = parseFloat(widthCm)
    const h = parseFloat(heightCm)
    const d = parseFloat(depthCm)
    const wt = weightKg ? parseFloat(weightKg) : null
    if (isNaN(w) || isNaN(h) || isNaN(d)) return null
    return calculateShippingTier(w, h, d, wt)
  }, [widthCm, heightCm, depthCm, weightKg])

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/products-strategic/${product.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(sku !== product.sku ? { sku } : {}),
          title,
          condition,
          vat_applicable: vatApplicable,
          cost_price: parseFloat(costPrice) || 0,
          selling_price: parseFloat(sellingPrice) || 0,
          original_rrp: originalRrp ? parseFloat(originalRrp) : null,
          model_number: modelNumber || null,
          year_of_manufacture: yearOfManufacture ? parseInt(yearOfManufacture, 10) : null,
          electrical_requirements: electricalRequirements || null,
          notes: notes || null,
          body_html: bodyHtml || null,
          width_cm: parseFloat(widthCm) || 0,
          height_cm: parseFloat(heightCm) || 0,
          depth_cm: parseFloat(depthCm) || 0,
          weight_kg: weightKg ? parseFloat(weightKg) : null,
          product_type: productType,
          vendor,
          collections: selectedCollections.map((c) => c.id),
          tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
          qbo_vendor_id: supplier?.id || null,
          qbo_vendor_name: supplier?.name || null,
          free_delivery_included: freeDeliveryIncluded,
          warranty_term_code: warrantyTermCode || null,
          shipping_tier_override: shippingTierOverride === '' ? null : parseInt(shippingTierOverride, 10),
        }),
      })

      if (!res.ok && res.status !== 207) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `Save failed (${res.status})`)
      }

      const data = await res.json()
      if (data._syncErrors?.length) {
        setError(`Saved with sync errors: ${data._syncErrors.join('; ')}`)
        setSaving(false)
        return
      }

      router.push(`/products/${product.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full bg-surface border border-edge rounded-md px-3 py-2 text-sm text-primary placeholder:text-secondary/50 focus:outline-none focus:border-accent'
  const labelCls = 'block text-xs font-medium text-secondary mb-1'

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-fail/10 border border-fail/25 text-fail rounded-md px-4 py-3 text-sm">{error}</div>
      )}

      <div className="bg-surface border border-edge rounded-lg p-6 space-y-5">
        {/* Product Details */}
        <fieldset className="space-y-3">
          <legend className="text-xs font-semibold text-accent uppercase tracking-wide mb-2">Product Details</legend>
          <div className="grid grid-cols-[120px_1fr] gap-3">
            <div>
              <label className={labelCls}>SKU</label>
              <input className={inputCls} value={sku} onChange={(e) => setSku(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Title *</label>
              <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className={labelCls}>Condition *</label>
              <select className={inputCls} value={condition} onChange={(e) => setCondition(e.target.value as 'new' | 'used')}>
                <option value="used">Used</option>
                <option value="new">New</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>VAT Applicable</label>
              <select className={inputCls} value={vatApplicable ? 'yes' : 'no'} onChange={(e) => setVatApplicable(e.target.value === 'yes')}>
                <option value="no">No (Margin Scheme)</option>
                <option value="yes">Yes (20%)</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Cost Price (£) *</label>
              <input className={inputCls} type="number" step="0.01" min="0" value={costPrice} onChange={(e) => setCostPrice(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Selling Price (£) *</label>
              <input className={inputCls} type="number" step="0.01" min="0" value={sellingPrice} onChange={(e) => setSellingPrice(e.target.value)} />
            </div>
          </div>
        </fieldset>

        {/* Model & Specs */}
        <fieldset className="space-y-3">
          <legend className="text-xs font-semibold text-accent uppercase tracking-wide mb-2">Model & Specs</legend>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className={labelCls}>Model Number</label>
              <input className={inputCls} value={modelNumber} onChange={(e) => setModelNumber(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Year of Manufacture</label>
              <input className={inputCls} type="number" min="1990" max="2030" value={yearOfManufacture} onChange={(e) => setYearOfManufacture(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Electrical Requirements</label>
              <input className={inputCls} value={electricalRequirements} onChange={(e) => setElectricalRequirements(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Original RRP (£)</label>
              <input className={inputCls} type="number" step="0.01" min="0" value={originalRrp} onChange={(e) => setOriginalRrp(e.target.value)} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Notes</label>
            <textarea className={`${inputCls} resize-none`} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Description</label>
            <textarea className={`${inputCls} resize-none`} rows={4} placeholder="Product description (shown on storefront)..." value={bodyHtml} onChange={(e) => setBodyHtml(e.target.value)} />
          </div>
        </fieldset>

        {/* Dimensions */}
        <fieldset className="space-y-3">
          <legend className="text-xs font-semibold text-accent uppercase tracking-wide mb-2">Dimensions & Shipping</legend>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className={labelCls}>Width (cm) *</label>
              <input className={inputCls} type="number" step="0.1" min="0" value={widthCm} onChange={(e) => setWidthCm(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Height (cm) *</label>
              <input className={inputCls} type="number" step="0.1" min="0" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Depth (cm) *</label>
              <input className={inputCls} type="number" step="0.1" min="0" value={depthCm} onChange={(e) => setDepthCm(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Weight (kg)</label>
              <input className={inputCls} type="number" step="0.1" min="0" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} />
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm flex-wrap">
            <span className="text-secondary">Shipping tier:</span>
            <select
              className={inputCls + ' max-w-xs'}
              value={shippingTierOverride}
              onChange={(e) => setShippingTierOverride(e.target.value as '' | '0' | '1' | '2')}
            >
              <option value="">Auto{shippingTier !== null ? ` (${SHIPPING_LABELS[shippingTier]})` : ''}</option>
              <option value="0">Parcel (override)</option>
              <option value="1">Single Pallet (override)</option>
              <option value="2">Double Pallet (override)</option>
            </select>
            {shippingTierOverride === '' && shippingTier !== null && (
              <span className={`font-medium ${SHIPPING_COLORS[shippingTier]}`}>{SHIPPING_LABELS[shippingTier]}</span>
            )}
            {shippingTierOverride !== '' && (
              <span className="text-xs text-secondary">(overriding auto)</span>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm text-primary cursor-pointer select-none">
            <input
              type="checkbox"
              checked={freeDeliveryIncluded}
              onChange={(e) => setFreeDeliveryIncluded(e.target.checked)}
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
              <input className={inputCls} list="edit-strat-product-types" value={productType} onChange={(e) => setProductType(e.target.value)} />
              <datalist id="edit-strat-product-types">
                {productTypes.map((t) => <option key={t} value={t} />)}
              </datalist>
            </div>
            <div>
              <label className={labelCls}>Vendor / Brand *</label>
              <input className={inputCls} list="edit-strat-vendors" value={vendor} onChange={(e) => setVendor(e.target.value)} />
              <datalist id="edit-strat-vendors">
                {vendors.map((v) => <option key={v} value={v} />)}
              </datalist>
            </div>
          </div>
          <div>
            <label className={labelCls}>Collections</label>
            <CollectionTypeahead value={selectedCollections} onChange={setSelectedCollections} />
          </div>
          <div>
            <label className={labelCls}>Tags</label>
            <input className={inputCls} value={tags} onChange={(e) => setTags(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Warranty</label>
            <select
              className={inputCls}
              value={warrantyTermCode}
              onChange={(e) => setWarrantyTermCode(e.target.value)}
            >
              <option value="">— None —</option>
              {eligibleWarranties.map((t) => (
                <option key={t.code} value={t.code}>
                  {t.label}{t.active ? '' : ' (inactive)'}
                </option>
              ))}
            </select>
          </div>
        </fieldset>

        {/* Supplier */}
        <fieldset className="space-y-3">
          <legend className="text-xs font-semibold text-accent uppercase tracking-wide mb-2">Supplier</legend>
          <SupplierTypeahead value={supplier} onChange={setSupplier} />
        </fieldset>
      </div>

      <div className="flex items-center gap-3 border-t border-edge pt-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2.5 bg-accent text-white text-sm font-medium rounded-md hover:bg-accent-hi disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
        <button
          onClick={() => router.push(`/products/${product.id}`)}
          disabled={saving}
          className="px-5 py-2.5 text-secondary text-sm rounded-md hover:text-primary hover:bg-overlay disabled:opacity-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

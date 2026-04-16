import { createServiceClient } from '@/lib/supabase/client'
import { isQboSalesSyncEnabled } from '@/lib/qbo/config'
import { findOrCreateQboCustomer, type OrderCustomerInput } from '@/lib/qbo/sales-customers'
import {
  buildInvoicePayload,
  createQboInvoice,
  createQboPaymentForInvoice,
  type ProductLineRef,
} from '@/lib/qbo/sales-invoice'

export interface SyncResult {
  orderId: string
  orderNumber: string | null
  status: 'success' | 'dry_run' | 'error' | 'skipped'
  qboCustomerId: string | null
  qboInvoiceId: string | null
  qboPaymentId: string | null
  error?: string
  warnings?: string[]
  payload?: Record<string, unknown>
}

interface Address {
  name?: string
  line1?: string
  line2?: string
  city?: string
  county?: string
  postcode?: string
  country?: string
  phone?: string
}

interface OrderRow {
  id: string
  order_number: string | null
  created_at: string
  status: string
  subtotal_pence: number
  shipping_pence: number
  total_pence: number
  currency: string
  shipping_address: Address | null
  billing_address: Address | null
  guest_email: string | null
  customer_id: string | null
  stripe_payment_intent_id: string | null
}

interface OrderItemRow {
  product_id: string | null
  product_title: string
  product_sku: string | null
  unit_price_pence: number
  quantity: number
  line_total_pence: number
}

interface ProductLookupRow {
  id: string
  sku: string
  qbo_item_id: string | null
  vat_applicable: boolean
}

async function upsertSyncRow(
  orderId: string,
  patch: Record<string, unknown>
): Promise<void> {
  const db = createServiceClient()
  const now = new Date().toISOString()
  await db
    .from('order_qbo_sync')
    .upsert(
      { order_id: orderId, ...patch, updated_at: now },
      { onConflict: 'order_id' }
    )
}

export async function syncOrderToQbo(orderId: string): Promise<SyncResult> {
  const db = createServiceClient()
  const dryRun = !isQboSalesSyncEnabled()
  const warnings: string[] = []

  // Idempotency: if already synced successfully, skip
  const { data: existingSync } = await db
    .from('order_qbo_sync')
    .select('*')
    .eq('order_id', orderId)
    .single()

  if (existingSync?.status === 'success' && existingSync.qbo_invoice_id) {
    return {
      orderId,
      orderNumber: null,
      status: 'skipped',
      qboCustomerId: existingSync.qbo_customer_id,
      qboInvoiceId: existingSync.qbo_invoice_id,
      qboPaymentId: existingSync.qbo_payment_id,
      warnings: ['already synced'],
    }
  }

  // Load order + items + customer
  const { data: order, error: orderErr } = await db
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .single<OrderRow>()

  if (orderErr || !order) {
    return {
      orderId,
      orderNumber: null,
      status: 'error',
      qboCustomerId: null,
      qboInvoiceId: null,
      qboPaymentId: null,
      error: orderErr?.message ?? 'Order not found',
    }
  }

  const { data: items, error: itemsErr } = await db
    .from('order_items')
    .select('product_id, product_title, product_sku, unit_price_pence, quantity, line_total_pence')
    .eq('order_id', orderId)

  if (itemsErr || !items || items.length === 0) {
    const err = itemsErr?.message ?? 'Order has no line items'
    await upsertSyncRow(orderId, { status: 'error', error_message: err })
    return {
      orderId,
      orderNumber: order.order_number,
      status: 'error',
      qboCustomerId: null,
      qboInvoiceId: null,
      qboPaymentId: null,
      error: err,
    }
  }

  // Resolve products → qbo_item_id + vat_applicable
  const skus = items.map((i: OrderItemRow) => i.product_sku).filter(Boolean) as string[]
  const { data: products } = await db
    .from('products')
    .select('id, sku, qbo_item_id, vat_applicable')
    .in('sku', skus.length > 0 ? skus : ['__never__'])

  const productBySku = new Map<string, ProductLookupRow>(
    ((products ?? []) as ProductLookupRow[]).map(p => [p.sku, p])
  )

  const lines: ProductLineRef[] = (items as OrderItemRow[]).map(item => {
    const prod = item.product_sku ? productBySku.get(item.product_sku) : undefined
    if (!prod) warnings.push(`SKU ${item.product_sku ?? '(none)'}: no matching product in Supabase`)
    if (prod && !prod.qbo_item_id) warnings.push(`SKU ${item.product_sku}: product has no qbo_item_id`)
    return {
      qboItemId: prod?.qbo_item_id ?? null,
      sku: item.product_sku,
      title: item.product_title,
      quantity: item.quantity,
      unitPricePence: item.unit_price_pence,
      lineTotalPence: item.line_total_pence,
      vatApplicable: prod?.vat_applicable ?? true, // default to standard-rated if unknown
    }
  })

  // Customer lookup/build
  let customerName: string | null = null
  let customerEmail: string | null = order.guest_email
  let customerPhone: string | null = null
  if (order.customer_id) {
    const { data: cust } = await db
      .from('customers')
      .select('full_name, email, phone')
      .eq('id', order.customer_id)
      .single()
    if (cust) {
      customerName = cust.full_name
      customerEmail = cust.email
      customerPhone = cust.phone
    }
  }
  // Fall back to shipping address name if we still don't have one
  if (!customerName) customerName = order.shipping_address?.name ?? null

  const customerInput: OrderCustomerInput = {
    email: customerEmail,
    fullName: customerName,
    phone: customerPhone ?? order.shipping_address?.phone ?? null,
    billingAddress: order.billing_address ?? order.shipping_address ?? null,
    shippingAddress: order.shipping_address ?? null,
  }

  let customerResult
  try {
    customerResult = await findOrCreateQboCustomer(customerInput, { dryRun })
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e)
    await upsertSyncRow(orderId, { status: 'error', error_message: `Customer lookup failed: ${err}` })
    return {
      orderId,
      orderNumber: order.order_number,
      status: 'error',
      qboCustomerId: null,
      qboInvoiceId: null,
      qboPaymentId: null,
      error: err,
    }
  }

  // Build invoice payload
  const orderDate = order.created_at.slice(0, 10) // YYYY-MM-DD
  const orderNumber = order.order_number ?? `ORD-${order.id.slice(0, 8)}`
  const { payload, unresolvedSkus, hasStandardRatedLines } = await buildInvoicePayload({
    orderNumber,
    orderDate,
    qboCustomerId: customerResult.qboCustomerId,
    qboCustomerDisplayName: customerResult.displayName,
    lines,
    shippingPence: order.shipping_pence,
    totalPence: order.total_pence,
    currency: order.currency,
  })

  if (unresolvedSkus.length) {
    warnings.push(`Unresolved QBO items: ${unresolvedSkus.join(', ')}`)
  }
  void hasStandardRatedLines // reserved for future tax-tree checks

  const storedPayload = {
    customer: {
      mode: customerResult.mode,
      displayName: customerResult.displayName,
      payload: customerResult.payload,
    },
    invoice: payload,
    dryRun,
  }

  // ==================
  // DRY RUN — stop here, nothing written to QBO
  // ==================
  if (dryRun) {
    await upsertSyncRow(orderId, {
      status: 'dry_run',
      qbo_customer_id: customerResult.qboCustomerId,
      payload: storedPayload,
      error_message: null,
      synced_at: new Date().toISOString(),
    })
    return {
      orderId,
      orderNumber,
      status: 'dry_run',
      qboCustomerId: customerResult.qboCustomerId,
      qboInvoiceId: null,
      qboPaymentId: null,
      warnings,
      payload: storedPayload,
    }
  }

  // ==================
  // LIVE — create invoice + payment in QBO
  // ==================
  if (!customerResult.qboCustomerId) {
    const err = 'Customer resolution failed in live mode'
    await upsertSyncRow(orderId, {
      status: 'error',
      payload: storedPayload,
      error_message: err,
    })
    return {
      orderId,
      orderNumber,
      status: 'error',
      qboCustomerId: null,
      qboInvoiceId: null,
      qboPaymentId: null,
      error: err,
    }
  }

  // Fix the customer ref in the payload now that we have a real ID
  payload.CustomerRef = { value: customerResult.qboCustomerId }

  let qboInvoiceId: string
  try {
    qboInvoiceId = await createQboInvoice(payload)
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e)
    await upsertSyncRow(orderId, {
      status: 'error',
      qbo_customer_id: customerResult.qboCustomerId,
      payload: storedPayload,
      error_message: err,
    })
    return {
      orderId,
      orderNumber,
      status: 'error',
      qboCustomerId: customerResult.qboCustomerId,
      qboInvoiceId: null,
      qboPaymentId: null,
      error: err,
    }
  }

  // Look up the stripe receipt account for deposit
  const { data: qboConn } = await db
    .from('qbo_connections')
    .select('stripe_receipt_account_id, bank_account_id')
    .limit(1)
    .single()
  const depositAccountId = qboConn?.stripe_receipt_account_id ?? qboConn?.bank_account_id
  if (!depositAccountId) {
    const err = 'No QBO deposit account mapped (stripe_receipt_account_id or bank_account_id)'
    await upsertSyncRow(orderId, {
      status: 'error',
      qbo_customer_id: customerResult.qboCustomerId,
      qbo_invoice_id: qboInvoiceId,
      payload: storedPayload,
      error_message: err,
    })
    return {
      orderId,
      orderNumber,
      status: 'error',
      qboCustomerId: customerResult.qboCustomerId,
      qboInvoiceId,
      qboPaymentId: null,
      error: err,
    }
  }

  let qboPaymentId: string
  try {
    qboPaymentId = await createQboPaymentForInvoice({
      qboCustomerId: customerResult.qboCustomerId,
      qboInvoiceId,
      totalAmount: +(order.total_pence / 100).toFixed(2),
      paymentDate: orderDate,
      orderNumber,
      depositAccountId,
    })
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e)
    await upsertSyncRow(orderId, {
      status: 'error',
      qbo_customer_id: customerResult.qboCustomerId,
      qbo_invoice_id: qboInvoiceId,
      payload: storedPayload,
      error_message: `Invoice created but payment failed: ${err}`,
    })
    return {
      orderId,
      orderNumber,
      status: 'error',
      qboCustomerId: customerResult.qboCustomerId,
      qboInvoiceId,
      qboPaymentId: null,
      error: err,
    }
  }

  await upsertSyncRow(orderId, {
    status: 'success',
    qbo_customer_id: customerResult.qboCustomerId,
    qbo_invoice_id: qboInvoiceId,
    qbo_payment_id: qboPaymentId,
    payload: storedPayload,
    error_message: null,
    synced_at: new Date().toISOString(),
  })

  return {
    orderId,
    orderNumber,
    status: 'success',
    qboCustomerId: customerResult.qboCustomerId,
    qboInvoiceId,
    qboPaymentId,
    warnings: warnings.length ? warnings : undefined,
    payload: storedPayload,
  }
}

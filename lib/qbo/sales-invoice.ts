import { getQboClient } from './client'
import { getTaxCodes } from './refs'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QboAny = any

export interface ProductLineRef {
  qboItemId: string | null // null = unresolved (product has no qbo_item_id)
  sku: string | null
  title: string
  quantity: number
  unitPricePence: number
  lineTotalPence: number
  vatApplicable: boolean
}

export interface InvoiceInput {
  orderNumber: string
  orderDate: string // YYYY-MM-DD
  qboCustomerId: string | null // null when customer was would_create
  qboCustomerDisplayName: string
  lines: ProductLineRef[]
  shippingPence: number
  totalPence: number
  currency: string
}

export interface InvoiceBuildResult {
  payload: Record<string, unknown>
  unresolvedSkus: string[]
  hasStandardRatedLines: boolean
}

export async function buildInvoicePayload(input: InvoiceInput): Promise<InvoiceBuildResult> {
  // Tax codes needed at build time. If QBO unreachable, fall back to placeholders
  // so dry-run still shows a useful payload.
  let taxCodes: { standardRated: string; margin: string }
  try {
    taxCodes = await getTaxCodes()
  } catch {
    taxCodes = { standardRated: 'TAX_STANDARD_PLACEHOLDER', margin: 'TAX_MARGIN_PLACEHOLDER' }
  }

  const unresolvedSkus: string[] = []
  let hasStandardRatedLines = false

  const lineItems: Record<string, unknown>[] = input.lines.map((l, idx) => {
    if (!l.qboItemId) unresolvedSkus.push(l.sku ?? `line-${idx}`)
    if (l.vatApplicable) hasStandardRatedLines = true

    return {
      DetailType: 'SalesItemLineDetail',
      Amount: +(l.lineTotalPence / 100).toFixed(2),
      Description: l.title,
      SalesItemLineDetail: {
        ItemRef: { value: l.qboItemId ?? 'UNRESOLVED_ITEM' },
        UnitPrice: +(l.unitPricePence / 100).toFixed(2),
        Qty: l.quantity,
        TaxCodeRef: { value: l.vatApplicable ? taxCodes.standardRated : taxCodes.margin },
      },
    }
  })

  // Shipping as a separate line if present. Treat as standard-rated.
  if (input.shippingPence > 0) {
    lineItems.push({
      DetailType: 'SalesItemLineDetail',
      Amount: +(input.shippingPence / 100).toFixed(2),
      Description: 'Shipping',
      SalesItemLineDetail: {
        ItemRef: { value: 'SHIPPING' }, // QBO convention for shipping line
        TaxCodeRef: { value: taxCodes.standardRated },
      },
    })
    hasStandardRatedLines = true
  }

  const payload: Record<string, unknown> = {
    CustomerRef: { value: input.qboCustomerId ?? 'WOULD_CREATE_CUSTOMER' },
    TxnDate: input.orderDate,
    DocNumber: input.orderNumber,
    CurrencyRef: { value: input.currency.toUpperCase() },
    Line: lineItems,
    PrivateNote: `Created by nce_automation sales sync — NCE order ${input.orderNumber}`,
    GlobalTaxCalculation: 'TaxInclusive',
  }

  return { payload, unresolvedSkus, hasStandardRatedLines }
}

export async function createQboInvoice(payload: Record<string, unknown>): Promise<string> {
  const { client: _c } = await getQboClient()
  const client = _c as QboAny
  return new Promise((resolve, reject) => {
    client.createInvoice(payload, (err: unknown, inv: { Id: string }) => {
      if (err) {
        const axErr = err as { response?: { data?: unknown }; message?: string }
        const detail = axErr.response?.data ? JSON.stringify(axErr.response.data) : axErr.message || String(err)
        reject(new Error(`QBO createInvoice: ${detail}`))
      } else {
        resolve(inv.Id)
      }
    })
  })
}

export async function createQboPaymentForInvoice(params: {
  qboCustomerId: string
  qboInvoiceId: string
  totalAmount: number // in pounds
  paymentDate: string // YYYY-MM-DD
  orderNumber: string
  depositAccountId: string
}): Promise<string> {
  const { client: _c } = await getQboClient()
  const client = _c as QboAny
  const payment = {
    TxnDate: params.paymentDate,
    CustomerRef: { value: params.qboCustomerId },
    TotalAmt: params.totalAmount,
    DepositToAccountRef: { value: params.depositAccountId },
    PrivateNote: `NCE order ${params.orderNumber} — Stripe payment, synced by nce_automation`,
    Line: [
      {
        Amount: params.totalAmount,
        LinkedTxn: [{ TxnId: params.qboInvoiceId, TxnType: 'Invoice' }],
      },
    ],
  }

  return new Promise((resolve, reject) => {
    client.createPayment(payment, (err: unknown, p: { Id: string }) => {
      if (err) {
        const axErr = err as { response?: { data?: unknown }; message?: string }
        const detail = axErr.response?.data ? JSON.stringify(axErr.response.data) : axErr.message || String(err)
        reject(new Error(`QBO createPayment: ${detail}`))
      } else {
        resolve(p.Id)
      }
    })
  })
}

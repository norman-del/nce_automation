export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/client'
import { notFound } from 'next/navigation'
import { getPaymentDetails } from '@/lib/stripe/payment-details'
import { getStaffUser } from '@/lib/auth/staff'
import OrderStatusButtons from './OrderStatusButtons'
import ShippingForm from './ShippingForm'
import QboSyncPanel from './QboSyncPanel'
import { isQboSalesSyncEnabled } from '@/lib/qbo/config'

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

interface LineItem {
  id: string
  product_title: string
  product_sku: string | null
  unit_price_pence: number
  quantity: number
  line_total_pence: number
}

interface Order {
  id: string
  order_number: string | null
  created_at: string
  updated_at: string
  status: string
  subtotal_pence: number
  shipping_pence: number
  total_pence: number
  currency: string
  shipping_address: Address
  billing_address: Address | null
  stripe_payment_intent_id: string | null
  tracking_number: string | null
  guest_email: string | null
  notes: string | null
  customer_id: string | null
  customers: { id: string; full_name: string; email: string; phone: string | null } | null
  order_items: LineItem[]
}

const statusStyles: Record<string, { pill: string; label: string }> = {
  paid:       { pill: 'bg-accent/10 text-accent border border-accent/25',   label: 'Paid'       },
  processing: { pill: 'bg-warn/10 text-warn border border-warn/25',         label: 'Processing' },
  shipped:    { pill: 'bg-ok/10 text-ok border border-ok/25',               label: 'Shipped'    },
  delivered:  { pill: 'bg-ok/10 text-ok border border-ok/25',               label: 'Delivered'  },
  cancelled:  { pill: 'bg-overlay text-secondary border border-edge',       label: 'Cancelled'  },
  refunded:   { pill: 'bg-fail/10 text-fail border border-fail/25',         label: 'Refunded'   },
}

function pence(amount: number): string {
  return `\u00A3${(amount / 100).toFixed(2)}`
}

function formatAddress(addr: Address | null): string[] {
  if (!addr) return ['—']
  return [addr.name, addr.line1, addr.line2, addr.city, addr.county, addr.postcode, addr.country]
    .filter(Boolean) as string[]
}

async function getOrder(id: string): Promise<Order | null> {
  const db = createServiceClient()
  const { data } = await db
    .from('orders')
    .select('*, customers(id, full_name, email, phone), order_items(*)')
    .eq('id', id)
    .single()
  return data as Order | null
}

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [order, staff] = await Promise.all([getOrder(id), getStaffUser()])
  if (!order) notFound()
  const canRefund = staff?.role === 'admin'
  const isAdminUser = staff?.role === 'admin'

  let qboSync: {
    status: string
    qbo_customer_id: string | null
    qbo_invoice_id: string | null
    qbo_payment_id: string | null
    payload: unknown
    error_message: string | null
    synced_at: string | null
  } | null = null
  if (isAdminUser) {
    const db = createServiceClient()
    const { data } = await db
      .from('order_qbo_sync')
      .select('status, qbo_customer_id, qbo_invoice_id, qbo_payment_id, payload, error_message, synced_at')
      .eq('order_id', order.id)
      .single()
    qboSync = data ?? null
  }

  const s = statusStyles[order.status] ?? statusStyles.paid
  const date = new Date(order.created_at).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })

  const customerName = order.customers?.full_name ?? order.shipping_address?.name ?? '—'
  const customerEmail = order.customers?.email ?? order.guest_email ?? '—'
  const customerPhone = order.customers?.phone ?? order.shipping_address?.phone ?? null

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-6">
        <div>
          <div className="mb-2">
            <Link href="/orders" className="text-secondary hover:text-primary text-sm transition-colors">
              ← Orders
            </Link>
          </div>
          <h2 className="text-2xl font-semibold text-primary">
            Order {order.order_number ?? order.id.slice(0, 8)}
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
            <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${s.pill}`}>
              {s.label}
            </span>
            <span className="text-secondary">{date}</span>
            <span className="text-primary font-medium">{pence(order.total_pence)}</span>
          </div>
        </div>
        <OrderStatusButtons orderId={order.id} currentStatus={order.status} canRefund={canRefund} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column — line items + order summary */}
        <div className="lg:col-span-2 space-y-6">
          {/* Line items */}
          <div className="bg-surface border border-edge rounded-lg overflow-hidden">
            <div className="px-5 py-3 border-b border-edge">
              <p className="text-sm font-medium text-primary">
                {order.order_items.length} item{order.order_items.length !== 1 ? 's' : ''}
              </p>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-overlay border-b border-edge">
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-secondary uppercase tracking-wide">Product</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-secondary uppercase tracking-wide">SKU</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-secondary uppercase tracking-wide">Price</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-secondary uppercase tracking-wide">Qty</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-secondary uppercase tracking-wide">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-edge">
                {order.order_items.map((item) => (
                  <tr key={item.id} className="hover:bg-overlay transition-colors">
                    <td className="px-4 py-3 text-primary">{item.product_title}</td>
                    <td className="px-4 py-3 font-mono text-xs text-secondary">{item.product_sku ?? '—'}</td>
                    <td className="px-4 py-3 text-right text-secondary">{pence(item.unit_price_pence)}</td>
                    <td className="px-4 py-3 text-right text-secondary">{item.quantity}</td>
                    <td className="px-4 py-3 text-right font-medium text-primary">{pence(item.line_total_pence)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-5 py-3 border-t border-edge space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-secondary">Subtotal</span>
                <span className="text-primary">{pence(order.subtotal_pence)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-secondary">Shipping</span>
                <span className="text-primary">{pence(order.shipping_pence)}</span>
              </div>
              <div className="flex justify-between text-sm font-medium pt-1.5 border-t border-edge">
                <span className="text-primary">Total</span>
                <span className="text-primary">{pence(order.total_pence)}</span>
              </div>
            </div>
          </div>

          {/* Shipping / tracking */}
          <ShippingForm
            orderId={order.id}
            currentStatus={order.status}
            trackingNumber={order.tracking_number}
          />
        </div>

        {/* Right column — customer, addresses, payment */}
        <div className="space-y-6">
          {/* Customer */}
          <div className="bg-surface border border-edge rounded-lg p-5">
            <h3 className="text-sm font-medium text-primary mb-3">Customer</h3>
            <p className="text-sm text-primary font-medium">{customerName}</p>
            <p className="text-sm text-secondary">{customerEmail}</p>
            {customerPhone && <p className="text-sm text-secondary mt-1">{customerPhone}</p>}
            {order.customer_id && (
              <Link
                href={`/customers/${order.customer_id}`}
                className="inline-block mt-2 text-xs text-accent hover:text-accent-hi transition-colors"
              >
                View customer →
              </Link>
            )}
          </div>

          {/* Shipping address */}
          <div className="bg-surface border border-edge rounded-lg p-5">
            <h3 className="text-sm font-medium text-primary mb-3">Shipping address</h3>
            {formatAddress(order.shipping_address).map((line, i) => (
              <p key={i} className="text-sm text-secondary">{line}</p>
            ))}
          </div>

          {/* Billing address */}
          {order.billing_address && (
            <div className="bg-surface border border-edge rounded-lg p-5">
              <h3 className="text-sm font-medium text-primary mb-3">Billing address</h3>
              {formatAddress(order.billing_address).map((line, i) => (
                <p key={i} className="text-sm text-secondary">{line}</p>
              ))}
            </div>
          )}

          {/* Payment */}
          <PaymentCard
            paymentIntentId={order.stripe_payment_intent_id}
            totalPence={order.total_pence}
          />

          {/* QBO sync — admin only */}
          {isAdminUser && (
            <QboSyncPanel
              orderId={order.id}
              initial={qboSync}
              syncEnabled={isQboSalesSyncEnabled()}
            />
          )}

          {/* Notes */}
          {order.notes && (
            <div className="bg-surface border border-edge rounded-lg p-5">
              <h3 className="text-sm font-medium text-primary mb-3">Notes</h3>
              <p className="text-sm text-secondary whitespace-pre-wrap">{order.notes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

async function PaymentCard({
  paymentIntentId,
  totalPence,
}: {
  paymentIntentId: string | null
  totalPence: number
}) {
  if (!paymentIntentId) {
    return (
      <div className="bg-surface border border-edge rounded-lg p-5">
        <h3 className="text-sm font-medium text-primary mb-3">Payment</h3>
        <p className="text-sm text-secondary">No Stripe payment linked</p>
      </div>
    )
  }

  const details = await getPaymentDetails(paymentIntentId)

  return (
    <div className="bg-surface border border-edge rounded-lg p-5">
      <h3 className="text-sm font-medium text-primary mb-3">Payment</h3>
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-secondary">Amount</span>
          <span className="text-primary font-medium">{pence(totalPence)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-secondary">Payment Intent</span>
          <span className="font-mono text-xs text-primary">{paymentIntentId}</span>
        </div>
        {details ? (
          <>
            {details.chargeId && (
              <div className="flex justify-between text-sm">
                <span className="text-secondary">Charge</span>
                <span className="font-mono text-xs text-primary">{details.chargeId}</span>
              </div>
            )}
            {details.paymentMethod && (
              <div className="flex justify-between text-sm">
                <span className="text-secondary">Method</span>
                <span className="text-primary capitalize">
                  {details.cardBrand && details.cardLast4
                    ? `${details.cardBrand} ****${details.cardLast4}`
                    : details.paymentMethod}
                </span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-secondary">Status</span>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                details.status === 'succeeded'
                  ? 'bg-ok/10 text-ok border border-ok/25'
                  : 'bg-warn/10 text-warn border border-warn/25'
              }`}>
                {details.status}
              </span>
            </div>
            {details.refunded && details.refundAmount != null && (
              <div className="flex justify-between text-sm">
                <span className="text-secondary">Refunded</span>
                <span className="text-fail font-medium">{pence(details.refundAmount)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-secondary">Date</span>
              <span className="text-secondary text-xs">
                {new Date(details.created).toLocaleDateString('en-GB', {
                  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
                })}
              </span>
            </div>
          </>
        ) : (
          <p className="text-xs text-secondary mt-1">
            Could not fetch Stripe details — check STRIPE_SECRET_KEY
          </p>
        )}
      </div>
    </div>
  )
}

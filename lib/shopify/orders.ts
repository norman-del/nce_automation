import { shopifyFetch } from './client'

export interface ShopifyOrder {
  id: number
  name: string // order number, e.g. "#NCE1573"
  order_number: number
  customer: {
    first_name: string
    last_name: string
    default_address?: {
      company?: string
    }
  } | null
  billing_address: {
    company?: string
    first_name?: string
    last_name?: string
  } | null
}

interface OrderResponse {
  order: ShopifyOrder
}

export async function fetchOrder(orderId: number): Promise<ShopifyOrder> {
  const data = await shopifyFetch<OrderResponse>(`/orders/${orderId}.json`)
  return data.order
}

export function extractOrderDetails(order: ShopifyOrder): {
  orderNumber: string
  customerName: string
  companyName: string
} {
  const orderNumber = order.name.replace('#', '') // "NCE1573"

  const firstName =
    order.customer?.first_name ?? order.billing_address?.first_name ?? ''
  const lastName =
    order.customer?.last_name ?? order.billing_address?.last_name ?? ''
  const customerName = [firstName, lastName].filter(Boolean).join(' ') || 'Unknown'

  const companyName =
    order.billing_address?.company ||
    order.customer?.default_address?.company ||
    customerName

  return { orderNumber, customerName, companyName }
}

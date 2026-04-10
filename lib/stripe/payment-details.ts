import { getStripe } from './client'

export interface StripePaymentDetails {
  chargeId: string | null
  paymentMethod: string | null
  cardBrand: string | null
  cardLast4: string | null
  status: string
  created: string
  refunded: boolean
  refundAmount: number | null
}

export async function getPaymentDetails(paymentIntentId: string): Promise<StripePaymentDetails | null> {
  try {
    const stripe = getStripe()
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: ['latest_charge', 'latest_charge.payment_method_details'],
    })

    const charge = typeof pi.latest_charge === 'object' ? pi.latest_charge : null

    return {
      chargeId: charge?.id ?? null,
      paymentMethod: charge?.payment_method_details?.type ?? null,
      cardBrand: charge?.payment_method_details?.card?.brand ?? null,
      cardLast4: charge?.payment_method_details?.card?.last4 ?? null,
      status: pi.status,
      created: new Date(pi.created * 1000).toISOString(),
      refunded: charge?.refunded ?? false,
      refundAmount: charge?.amount_refunded ?? null,
    }
  } catch (e) {
    console.warn('[stripe] Failed to fetch payment details:', String(e))
    return null
  }
}

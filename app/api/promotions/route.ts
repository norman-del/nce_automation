import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getStripe } from '@/lib/stripe/client'
import { getStaffUserFromRequest } from '@/lib/auth/staff'

// GET /api/promotions — list active promotion codes
export async function GET() {
  try {
    const stripe = getStripe()

    const promotionCodes = await stripe.promotionCodes.list({
      limit: 50,
      active: true,
      expand: ['data.promotion.coupon'],
    })

    const codes = promotionCodes.data.map(pc => {
      const coupon = pc.promotion.coupon as Stripe.Coupon | null
      return {
        id: pc.id,
        code: pc.code,
        active: pc.active,
        timesRedeemed: pc.times_redeemed,
        maxRedemptions: pc.max_redemptions,
        expiresAt: pc.expires_at ? new Date(pc.expires_at * 1000).toISOString() : null,
        coupon: coupon ? {
          id: coupon.id,
          percentOff: coupon.percent_off,
          amountOff: coupon.amount_off,
          currency: coupon.currency,
          duration: coupon.duration,
        } : null,
        created: new Date(pc.created * 1000).toISOString(),
      }
    })

    return NextResponse.json(codes)
  } catch (e) {
    console.error('[promotions/GET] error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// POST /api/promotions — create a new promotion code (admin only)
export async function POST(req: NextRequest) {
  try {
    const staff = await getStaffUserFromRequest(req)
    if (!staff || staff.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const body = await req.json()
    const { code, percent_off, amount_off, max_redemptions, expires_at } = body

    if (!code || typeof code !== 'string') {
      return NextResponse.json({ error: 'code is required' }, { status: 400 })
    }

    if (percent_off == null && amount_off == null) {
      return NextResponse.json({ error: 'Either percent_off or amount_off is required' }, { status: 400 })
    }

    const stripe = getStripe()

    // Create coupon first
    const couponParams: Stripe.CouponCreateParams = {
      duration: 'once',
    }
    if (percent_off != null) {
      couponParams.percent_off = Number(percent_off)
    } else {
      couponParams.amount_off = Math.round(Number(amount_off) * 100) // pence
      couponParams.currency = 'gbp'
    }

    const coupon = await stripe.coupons.create(couponParams)

    // Create promotion code
    const promoParams: Stripe.PromotionCodeCreateParams = {
      promotion: { type: 'coupon', coupon: coupon.id },
      code: code.toUpperCase().trim(),
    }

    if (max_redemptions) {
      promoParams.max_redemptions = Number(max_redemptions)
    }

    if (expires_at) {
      promoParams.expires_at = Math.floor(new Date(expires_at).getTime() / 1000)
    }

    const promotionCode = await stripe.promotionCodes.create(promoParams)

    return NextResponse.json({
      id: promotionCode.id,
      code: promotionCode.code,
    }, { status: 201 })
  } catch (e) {
    console.error('[promotions/POST] error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

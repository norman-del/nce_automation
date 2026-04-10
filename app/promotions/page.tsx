export const dynamic = 'force-dynamic'

import PromotionsList from './PromotionsList'

export default function PromotionsPage() {
  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-primary">Promotions</h2>
        <p className="mt-1 text-sm text-secondary">
          Manage discount codes for the storefront. Customers enter these at Stripe Checkout.
        </p>
      </div>
      <PromotionsList />
    </div>
  )
}

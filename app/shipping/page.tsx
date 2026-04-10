export const dynamic = 'force-dynamic'

import ShippingRatesEditor from './ShippingRatesEditor'

export default function ShippingPage() {
  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-primary">Shipping Rates</h2>
        <p className="mt-1 text-sm text-secondary">
          Configure delivery rates per shipping tier. These rates are used at checkout on the storefront.
        </p>
      </div>
      <ShippingRatesEditor />
    </div>
  )
}

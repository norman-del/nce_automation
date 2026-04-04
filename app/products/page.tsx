export const dynamic = 'force-dynamic'

import ProductList from './ProductList'

export default function ProductsPage() {
  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-primary">Products</h2>
        <p className="mt-1 text-sm text-secondary">
          Manage products across Supabase, Shopify, and QuickBooks Online
        </p>
      </div>
      <ProductList />
    </div>
  )
}

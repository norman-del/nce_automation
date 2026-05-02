export const dynamic = 'force-dynamic'

import Link from 'next/link'
import ProductList from './ProductList'

export default function ProductsPage() {
  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-primary">Products</h2>
          <p className="mt-1 text-sm text-secondary">
            Manage products across Supabase, Shopify, and QuickBooks Online
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/products/import"
            className="px-4 py-2 text-sm font-medium border border-edge text-secondary rounded-md hover:text-primary hover:border-secondary transition-colors"
          >
            Import CSV
          </Link>
          <Link
            href="/products/new"
            className="px-4 py-2 text-sm font-medium bg-accent text-white rounded-md ring-1 ring-amber-500/60 hover:bg-accent-hi transition-colors"
            title="Current solution — writes to Shopify + QBO"
          >
            + New Product
          </Link>
        </div>
      </div>
      <ProductList />
    </div>
  )
}

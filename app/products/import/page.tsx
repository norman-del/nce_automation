export const dynamic = 'force-dynamic'

import CsvImporter from './CsvImporter'

export default function ImportPage() {
  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-primary">Import Products</h2>
        <p className="mt-1 text-sm text-secondary">
          Upload a CSV to bulk-import existing products into Supabase. Products that already exist in
          Shopify/QBO can include those IDs to skip re-creation.
        </p>
      </div>
      <CsvImporter />
    </div>
  )
}

export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getStaffUser } from '@/lib/auth/staff'
import CollectionProductsManager from './CollectionProductsManager'

export default async function CollectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const staff = await getStaffUser()
  if (!staff) redirect('/login')
  if (staff.role !== 'admin') redirect('/')

  const { id } = await params
  return (
    <div>
      <div className="mb-6">
        <Link href="/settings?tab=collections" className="text-xs text-accent hover:text-accent-hi">← Back to collections</Link>
        <h2 className="mt-2 text-2xl font-semibold text-primary">Manage Collection Products</h2>
      </div>
      <CollectionProductsManager collectionId={id} />
    </div>
  )
}

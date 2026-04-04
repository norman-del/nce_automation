'use client'

import { useRouter } from 'next/navigation'
import PhotoUpload from './PhotoUpload'

interface Props {
  productId: string
  hasShopifyId: boolean
}

export default function PhotoUploadWrapper({ productId, hasShopifyId }: Props) {
  const router = useRouter()

  return (
    <PhotoUpload
      productId={productId}
      hasShopifyId={hasShopifyId}
      onActivated={() => router.refresh()}
    />
  )
}

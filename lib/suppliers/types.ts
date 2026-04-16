export interface FeedRow {
  sku: string
  quantity: number
}

export interface FeedRunResult {
  supplierId: string
  supplierName: string
  status: 'success' | 'aborted' | 'error'
  rowCount: number
  matchedCount: number
  updatedCount: number
  error?: string
  abortReason?: string
  zeroingRows?: string[]
}

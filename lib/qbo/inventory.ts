// QBO inventory reader — paginated Item query that returns a
// { qbo_item_id → QtyOnHand } map across the entire active catalog.
// Used by the Phase 0 shadow-read cron (lib/qbo/inventory).

import { getQboClient } from './client'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QboAny = any

interface QboItemRow {
  Id: string
  Type?: string
  TrackQtyOnHand?: boolean
  QtyOnHand?: number
  Active?: boolean
}

const PAGE_SIZE = 1000 // QBO max
const MAX_PAGES = 50   // safety cap → 50,000 items, far above our ~2,400 catalog

export interface InventorySnapshot {
  itemQty: Map<string, number>
  totalScanned: number
  inventoryItems: number
}

/**
 * Pull QtyOnHand for every Inventory-type Item in QBO. Pagination uses
 * STARTPOSITION + MAXRESULTS (node-quickbooks's `findItems` accepts these
 * via the criteria object).
 *
 * Only Inventory items are returned by QBO with a real QtyOnHand. Service
 * and NonInventory items omit it entirely; we skip those.
 */
export async function pullQboInventory(): Promise<InventorySnapshot> {
  const { client: _client } = await getQboClient()
  const client = _client as QboAny

  const itemQty = new Map<string, number>()
  let totalScanned = 0
  let inventoryItems = 0
  let startPosition = 1

  for (let page = 0; page < MAX_PAGES; page++) {
    const items = await new Promise<QboItemRow[]>((resolve, reject) => {
      client.findItems(
        {
          // node-quickbooks translates `limit` → MAXRESULTS and
          // `offset` → STARTPOSITION in the SQL-like query it builds.
          // Lowercase shortcuts (`startposition`/`maxresults`) hit
          // QBO's parser and 4000-error.
          limit: PAGE_SIZE,
          offset: startPosition,
        },
        (err: unknown, result: { QueryResponse: { Item?: QboItemRow[] } }) => {
          if (err) {
            const detail = (err as { response?: { data?: unknown }; message?: string })
              .response?.data
              ? JSON.stringify((err as { response: { data: unknown } }).response.data)
              : (err as { message?: string }).message || String(err)
            reject(new Error(`QBO findItems page ${page} (start=${startPosition}): ${detail}`))
          } else {
            resolve(result.QueryResponse.Item || [])
          }
        }
      )
    })

    if (items.length === 0) break
    totalScanned += items.length

    for (const item of items) {
      if (item.Type === 'Inventory' && item.TrackQtyOnHand && typeof item.QtyOnHand === 'number') {
        itemQty.set(item.Id, item.QtyOnHand)
        inventoryItems++
      }
    }

    if (items.length < PAGE_SIZE) break
    startPosition += PAGE_SIZE
  }

  return { itemQty, totalScanned, inventoryItems }
}

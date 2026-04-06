import { getQboClient } from './client'

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface QboItem {
  Id: string
  Name: string
  Sku: string
}

interface QboVendor {
  Id: string
  DisplayName: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QboAny = any

/* ------------------------------------------------------------------ */
/* Find or create a QBO Vendor from our supplier record                */
/* ------------------------------------------------------------------ */

export async function findOrCreateQboVendor(supplier: {
  name: string
  contact_name: string | null
  phone: string | null
  email: string | null
  address_line1: string | null
  address_line2: string | null
  city: string | null
  county: string | null
  postcode: string | null
}): Promise<string> {
  const { client: _client } = await getQboClient()
  const client = _client as QboAny

  // Try to find existing vendor by name
  const existing = await new Promise<QboVendor[]>((resolve, reject) => {
    client.findVendors(
      { DisplayName: supplier.name },
      (err: unknown, result: { QueryResponse: { Vendor?: QboVendor[] } }) => {
        if (err) reject(err)
        else resolve(result.QueryResponse.Vendor || [])
      }
    )
  })

  if (existing.length > 0) {
    return existing[0].Id
  }

  // Create new vendor
  const vendorData: Record<string, unknown> = {
    DisplayName: supplier.name,
  }

  if (supplier.contact_name) {
    const parts = supplier.contact_name.trim().split(/\s+/)
    vendorData.GivenName = parts[0]
    if (parts.length > 1) vendorData.FamilyName = parts.slice(1).join(' ')
  }

  if (supplier.phone) {
    vendorData.PrimaryPhone = { FreeFormNumber: supplier.phone }
  }

  if (supplier.email) {
    vendorData.PrimaryEmailAddr = { Address: supplier.email }
  }

  if (supplier.address_line1) {
    vendorData.BillAddr = {
      Line1: supplier.address_line1,
      Line2: supplier.address_line2 || undefined,
      City: supplier.city || undefined,
      CountrySubDivisionCode: supplier.county || undefined,
      PostalCode: supplier.postcode || undefined,
      Country: 'GB',
    }
  }

  const created = await new Promise<QboVendor>((resolve, reject) => {
    client.createVendor(
      vendorData,
      (err: unknown, vendor: QboVendor) => {
        if (err) reject(err)
        else resolve(vendor)
      }
    )
  })

  return created.Id
}

/* ------------------------------------------------------------------ */
/* Create a QBO Item with full fields (cost, VAT, supplier)            */
/* ------------------------------------------------------------------ */

export async function createQboItem(params: {
  sku: string
  title: string
  sellingPrice: number
  costPrice: number
  vatApplicable: boolean
  qboVendorId: string | null
}): Promise<string> {
  const { client: _client } = await getQboClient()
  const client = _client as QboAny
  const { sku, title, sellingPrice, costPrice, vatApplicable, qboVendorId } = params

  // Find tax codes and accounts
  const taxCodes = await findTaxCodes()
  const accounts = await findAccountsByType()

  const itemData: Record<string, unknown> = {
    Name: `${title} (NCE${sku})`.slice(0, 100), // QBO has 100 char limit on Name
    Sku: sku,
    Description: title,
    Type: 'Inventory',
    TrackQtyOnHand: true,
    QtyOnHand: 0,
    InvStartDate: new Date().toISOString().split('T')[0],

    // Asset account for stock
    AssetAccountRef: { value: accounts.asset || '1' },

    // Sales info — always VAT inclusive
    UnitPrice: sellingPrice,
    IncomeAccountRef: { value: accounts.income || '1' },
    SalesTaxIncluded: true,
    SalesTaxCodeRef: { value: vatApplicable ? taxCodes.standardRated : taxCodes.margin },

    // Purchase info — always VAT inclusive
    PurchaseCost: costPrice,
    ExpenseAccountRef: { value: accounts.expense || '1' },
    PurchaseTaxIncluded: true,
    PurchaseTaxCodeRef: { value: vatApplicable ? taxCodes.standardRated : taxCodes.margin },
  }

  if (qboVendorId) {
    itemData.PrefVendorRef = { value: qboVendorId }
  }

  console.log('[qbo-items] Creating inventory item:', sku, JSON.stringify({
    type: 'Inventory', vatApplicable,
    salesTax: vatApplicable ? 'standardRated' : 'margin',
    taxCodeIds: { standard: taxCodes.standardRated, margin: taxCodes.margin },
    accountIds: { income: accounts.income, expense: accounts.expense, asset: accounts.asset },
    vendor: qboVendorId || 'none',
  }))

  const created = await new Promise<QboItem>((resolve, reject) => {
    client.createItem(
      itemData,
      (err: unknown, item: QboItem) => {
        if (err) {
          // Extract QBO error detail from Axios response
          const axErr = err as { response?: { data?: unknown }; message?: string }
          const detail = axErr.response?.data
            ? JSON.stringify(axErr.response.data)
            : axErr.message || String(err)
          console.error('[qbo-items] createItem FAILED:', detail)
          reject(new Error(`QBO createItem: ${detail}`))
        } else {
          resolve(item)
        }
      }
    )
  })

  console.log('[qbo-items] Item created:', sku, '→ QBO id', created.Id)
  return created.Id
}

/* ------------------------------------------------------------------ */
/* Find UK VAT tax codes                                               */
/* ------------------------------------------------------------------ */

interface TaxCodeResult {
  standardRated: string
  margin: string
}

let cachedTaxCodes: TaxCodeResult | null = null

async function findTaxCodes(): Promise<TaxCodeResult> {
  if (cachedTaxCodes) return cachedTaxCodes

  const { client: _c } = await getQboClient()
  const client = _c as QboAny

  const result = await new Promise<{ Id: string; Name: string }[]>((resolve, reject) => {
    client.findTaxCodes(
      {},
      (err: unknown, data: { QueryResponse: { TaxCode?: { Id: string; Name: string }[] } }) => {
        if (err) reject(err)
        else resolve(data.QueryResponse.TaxCode || [])
      }
    )
  })

  console.log('[qbo-items] Available tax codes:', result.map(tc => `${tc.Id}="${tc.Name}"`).join(', '))

  let standardRated = '1' // fallback
  let margin = '0' // fallback

  for (const tc of result) {
    const name = tc.Name.toLowerCase()
    if (name.includes('20') && (name.includes('s') || name.includes('standard'))) {
      standardRated = tc.Id
    } else if (name.includes('margin')) {
      margin = tc.Id
    }
  }

  console.log('[qbo-items] Selected tax codes — standardRated:', standardRated, ', margin:', margin)
  cachedTaxCodes = { standardRated, margin }
  return cachedTaxCodes
}

/* ------------------------------------------------------------------ */
/* Find income and expense accounts                                    */
/* ------------------------------------------------------------------ */

interface AccountRefs {
  income: string | null
  expense: string | null
  asset: string | null
}

let cachedAccounts: AccountRefs | null = null

async function findAccountsByType(): Promise<AccountRefs> {
  if (cachedAccounts) return cachedAccounts

  const { client: _c } = await getQboClient()
  const client = _c as QboAny

  const result = await new Promise<{ Id: string; Name: string; AccountType: string }[]>(
    (resolve, reject) => {
      client.findAccounts(
        {},
        (err: unknown, data: { QueryResponse: { Account?: { Id: string; Name: string; AccountType: string }[] } }) => {
          if (err) reject(err)
          else resolve(data.QueryResponse.Account || [])
        }
      )
    }
  )

  console.log('[qbo-items] Available accounts:', result.map(a => `${a.Id}="${a.Name}" (${a.AccountType})`).join(', '))

  let income: string | null = null
  let expense: string | null = null
  let asset: string | null = null

  for (const acc of result) {
    const name = acc.Name.toLowerCase()
    if (name.includes('sales of product income') || name.includes('sales income')) {
      income = acc.Id
    }
    if (name.includes('cost of sales') || name.includes('cost of goods')) {
      expense = acc.Id
    }
    if (name === 'stock' && (acc.AccountType === 'Other Current Asset' || acc.AccountType.includes('Asset'))) {
      asset = acc.Id
    }
  }

  console.log('[qbo-items] Selected accounts — income:', income, ', expense:', expense, ', asset (stock):', asset)
  cachedAccounts = { income, expense, asset }
  return cachedAccounts
}

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
    PurchaseDesc: title,
    PurchaseCost: costPrice,
    ExpenseAccountRef: { value: accounts.expense || '1' },
    PurchaseTaxIncluded: true,
    PurchaseTaxCodeRef: { value: vatApplicable ? taxCodes.standardRated : taxCodes.margin },
  }

  if (qboVendorId) {
    itemData.PrefVendorRef = { value: qboVendorId }
  }

  console.log('[qbo-items] Creating inventory item:', sku, JSON.stringify(itemData, null, 0))

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
  standardRatedName: string
  margin: string
  marginName: string
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

  let standardRated: string | null = null
  let standardRatedName = ''
  let margin: string | null = null
  let marginName = ''

  for (const tc of result) {
    const name = tc.Name.toLowerCase()
    if (name.includes('20')) {
      standardRated = tc.Id
      standardRatedName = tc.Name
    }
    if (name.includes('margin')) {
      margin = tc.Id
      marginName = tc.Name
    }
  }

  if (!standardRated) console.error('[qbo-items] WARNING: No 20% tax code found!')
  if (!margin) console.error('[qbo-items] WARNING: No Margin tax code found!')
  console.log('[qbo-items] Selected tax codes — standard:', standardRated, `"${standardRatedName}"`, ', margin:', margin, `"${marginName}"`)
  if (!standardRated || !margin) {
    throw new Error(
      `QBO tax codes not found. Available: ${result.map(tc => `${tc.Id}="${tc.Name}"`).join(', ')}. ` +
      `Need a "20%" code and a "Margin" code.`
    )
  }

  cachedTaxCodes = { standardRated, standardRatedName, margin, marginName }
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

  const result = await new Promise<{ Id: string; Name: string; AccountType: string; AccountSubType?: string }[]>(
    (resolve, reject) => {
      client.findAccounts(
        {},
        (err: unknown, data: { QueryResponse: { Account?: { Id: string; Name: string; AccountType: string; AccountSubType?: string }[] } }) => {
          if (err) reject(err)
          else resolve(data.QueryResponse.Account || [])
        }
      )
    }
  )

  console.log('[qbo-items] Available accounts:', result.map(a => `${a.Id}="${a.Name}" (${a.AccountType}/${a.AccountSubType || '?'})`).join(', '))

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
    // QBO API uses "Other Current Asset" with SubType "Inventory" for stock asset accounts
    // But also match by name regardless of type, since QBO auto-creates with varying types
    if (
      (acc.AccountSubType === 'Inventory') ||
      (acc.AccountType.includes('Asset') && (
        name === 'stock' || name === 'stock asset' || name === 'inventory'
        || name === 'inventory asset' || name.includes('stock asset')
      ))
    ) {
      // Prefer "Stock Asset" over "Uncategorized Stock Asset"
      if (!asset || name === 'stock asset' || name === 'stock') {
        asset = acc.Id
      }
    }
  }

  // If no stock asset account found, auto-create via raw API call
  // (node-quickbooks createAccount mangles the payload for UK QBO)
  if (!asset) {
    console.log('[qbo-items] No stock asset account found. Current asset accounts:',
      result.filter(a => a.AccountType.includes('Current')).map(a => `${a.Id}="${a.Name}" (${a.AccountType}/${a.AccountSubType || '?'})`).join(', ') || 'NONE')
    console.log('[qbo-items] Auto-creating "Stock Asset" account via raw API...')

    const { accessToken, connection: freshConn } = await getQboClient()
    const isSandbox = process.env.QBO_ENVIRONMENT?.trim() !== 'production'
    const baseUrl = isSandbox
      ? 'https://sandbox-quickbooks.api.intuit.com'
      : 'https://quickbooks.api.intuit.com'

    const createRes = await fetch(
      `${baseUrl}/v3/company/${freshConn.realm_id}/account?minorversion=65`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          Name: 'Stock Asset',
          AccountType: 'Other Current Asset',
          AccountSubType: 'Inventory',
        }),
      }
    )

    const createBody = await createRes.json()
    if (!createRes.ok) {
      console.error('[qbo-items] Failed to create inventory asset account:', JSON.stringify(createBody))
      throw new Error(`QBO needs a stock asset account but auto-creation failed: ${JSON.stringify(createBody.Fault?.Error?.[0]?.Detail || createBody)}`)
    }

    asset = createBody.Account?.Id
    console.log('[qbo-items] Created "Stock Asset" account, id:', asset)
  }

  console.log('[qbo-items] Selected accounts — income:', income, ', expense:', expense, ', asset (stock):', asset)
  cachedAccounts = { income, expense, asset }
  return cachedAccounts
}

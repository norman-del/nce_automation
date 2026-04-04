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

  // First, find the correct tax codes for UK VAT
  // Standard rated = 20% VAT, Exempt = margin scheme / no VAT
  const taxCodes = await findTaxCodes()

  const itemData: Record<string, unknown> = {
    Name: `${title} ${sku}`.slice(0, 100), // QBO has 100 char limit on Name
    Sku: sku,
    Description: title,
    Type: 'NonInventory',
    TrackQtyOnHand: false,

    // Sales info
    UnitPrice: sellingPrice,
    IncomeAccountRef: { value: '1' }, // Sales of Product Income (default)
    SalesTaxIncluded: vatApplicable,
    SalesTaxCodeRef: { value: vatApplicable ? taxCodes.standardRated : taxCodes.exempt },

    // Purchase info
    PurchaseCost: costPrice,
    ExpenseAccountRef: { value: '1' }, // Will be set to Cost of Sales
    PurchaseTaxIncluded: vatApplicable,
    PurchaseTaxCodeRef: { value: vatApplicable ? taxCodes.standardRated : taxCodes.exempt },
  }

  if (qboVendorId) {
    itemData.PrefVendorRef = { value: qboVendorId }
  }

  // Look up the correct income and expense accounts
  const accounts = await findAccountsByType()
  if (accounts.income) itemData.IncomeAccountRef = { value: accounts.income }
  if (accounts.expense) itemData.ExpenseAccountRef = { value: accounts.expense }

  const created = await new Promise<QboItem>((resolve, reject) => {
    client.createItem(
      itemData,
      (err: unknown, item: QboItem) => {
        if (err) reject(err)
        else resolve(item)
      }
    )
  })

  return created.Id
}

/* ------------------------------------------------------------------ */
/* Find UK VAT tax codes                                               */
/* ------------------------------------------------------------------ */

interface TaxCodeResult {
  standardRated: string
  exempt: string
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

  // UK QBO typically has: "20.0% S" for standard rate, "Exempt" or "No VAT" for exempt
  let standardRated = '1' // fallback
  let exempt = '0' // fallback

  for (const tc of result) {
    const name = tc.Name.toLowerCase()
    if (name.includes('20') && (name.includes('s') || name.includes('standard'))) {
      standardRated = tc.Id
    } else if (name.includes('exempt') || name.includes('no vat') || name === 'o') {
      exempt = tc.Id
    }
  }

  cachedTaxCodes = { standardRated, exempt }
  return cachedTaxCodes
}

/* ------------------------------------------------------------------ */
/* Find income and expense accounts                                    */
/* ------------------------------------------------------------------ */

interface AccountRefs {
  income: string | null
  expense: string | null
}

async function findAccountsByType(): Promise<AccountRefs> {
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

  let income: string | null = null
  let expense: string | null = null

  for (const acc of result) {
    const name = acc.Name.toLowerCase()
    if (name.includes('sales of product income') || name.includes('sales income')) {
      income = acc.Id
    }
    if (name.includes('cost of sales') || name.includes('cost of goods')) {
      expense = acc.Id
    }
  }

  return { income, expense }
}

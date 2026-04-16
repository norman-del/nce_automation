import { getQboClient } from './client'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QboAny = any

export interface TaxCodes {
  standardRated: string
  margin: string
}

export interface AccountRefs {
  income: string | null
  expense: string | null
  asset: string | null
}

let cachedTax: TaxCodes | null = null
let cachedAccounts: AccountRefs | null = null

export async function getTaxCodes(): Promise<TaxCodes> {
  if (cachedTax) return cachedTax
  const { client: _c } = await getQboClient()
  const client = _c as QboAny
  const codes = await new Promise<{ Id: string; Name: string }[]>((resolve, reject) => {
    client.findTaxCodes({}, (err: unknown, data: { QueryResponse: { TaxCode?: { Id: string; Name: string }[] } }) => {
      if (err) reject(err)
      else resolve(data.QueryResponse.TaxCode || [])
    })
  })

  let standardRated = ''
  let margin = ''
  for (const tc of codes) {
    const n = tc.Name.toLowerCase()
    if (!standardRated && n.includes('20')) standardRated = tc.Id
    if (!margin && n.includes('margin')) margin = tc.Id
  }
  if (!standardRated || !margin) {
    throw new Error(`QBO tax codes missing — need "20%" and "Margin". Got: ${codes.map(c => c.Name).join(', ')}`)
  }
  cachedTax = { standardRated, margin }
  return cachedTax
}

export async function getAccounts(): Promise<AccountRefs> {
  if (cachedAccounts) return cachedAccounts
  const { client: _c } = await getQboClient()
  const client = _c as QboAny
  const accounts = await new Promise<{ Id: string; Name: string; AccountType: string; AccountSubType?: string }[]>(
    (resolve, reject) => {
      client.findAccounts({}, (err: unknown, data: { QueryResponse: { Account?: { Id: string; Name: string; AccountType: string; AccountSubType?: string }[] } }) => {
        if (err) reject(err)
        else resolve(data.QueryResponse.Account || [])
      })
    }
  )

  let income: string | null = null
  let expense: string | null = null
  let asset: string | null = null
  for (const a of accounts) {
    const n = a.Name.toLowerCase()
    if (!income && (n.includes('sales of product income') || n.includes('sales income'))) income = a.Id
    if (!expense && (n.includes('cost of sales') || n.includes('cost of goods'))) expense = a.Id
    if (!asset && (a.AccountSubType === 'Inventory' || n === 'stock asset' || n === 'stock')) asset = a.Id
  }
  cachedAccounts = { income, expense, asset }
  return cachedAccounts
}

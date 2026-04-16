import { getQboClient } from './client'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QboAny = any

export interface OrderCustomerInput {
  email: string | null
  fullName: string | null
  phone: string | null
  billingAddress: {
    name?: string
    line1?: string
    line2?: string
    city?: string
    county?: string
    postcode?: string
    country?: string
  } | null
  shippingAddress: {
    name?: string
    line1?: string
    line2?: string
    city?: string
    county?: string
    postcode?: string
    country?: string
  } | null
}

export interface QboCustomerMatch {
  mode: 'found' | 'would_create' | 'created'
  qboCustomerId: string | null
  displayName: string
  payload?: Record<string, unknown>
}

function deriveDisplayName(input: OrderCustomerInput): string {
  return (
    input.fullName?.trim() ||
    input.billingAddress?.name?.trim() ||
    input.shippingAddress?.name?.trim() ||
    input.email?.trim() ||
    'Unknown customer'
  )
}

function buildCustomerPayload(input: OrderCustomerInput): Record<string, unknown> {
  const displayName = deriveDisplayName(input)
  const addr = input.billingAddress ?? input.shippingAddress
  const payload: Record<string, unknown> = { DisplayName: displayName }

  if (input.fullName) {
    const parts = input.fullName.trim().split(/\s+/)
    payload.GivenName = parts[0]
    if (parts.length > 1) payload.FamilyName = parts.slice(1).join(' ')
  }
  if (input.email) payload.PrimaryEmailAddr = { Address: input.email }
  if (input.phone) payload.PrimaryPhone = { FreeFormNumber: input.phone }
  if (addr?.line1) {
    payload.BillAddr = {
      Line1: addr.line1,
      Line2: addr.line2 || undefined,
      City: addr.city || undefined,
      CountrySubDivisionCode: addr.county || undefined,
      PostalCode: addr.postcode || undefined,
      Country: addr.country || 'GB',
    }
  }
  if (input.shippingAddress?.line1) {
    payload.ShipAddr = {
      Line1: input.shippingAddress.line1,
      Line2: input.shippingAddress.line2 || undefined,
      City: input.shippingAddress.city || undefined,
      CountrySubDivisionCode: input.shippingAddress.county || undefined,
      PostalCode: input.shippingAddress.postcode || undefined,
      Country: input.shippingAddress.country || 'GB',
    }
  }
  return payload
}

async function findQboCustomer(input: OrderCustomerInput): Promise<{ Id: string; DisplayName: string } | null> {
  const { client: _c } = await getQboClient()
  const client = _c as QboAny

  type CustomerResponse = { QueryResponse: { Customer?: Array<{ Id: string; DisplayName: string }> } }

  // Try email first
  if (input.email) {
    try {
      const res = await new Promise<CustomerResponse>((resolve, reject) => {
        client.findCustomers(
          [{ field: 'PrimaryEmailAddr', value: input.email }],
          (err: unknown, data: CustomerResponse) => (err ? reject(err) : resolve(data))
        )
      })
      const match = res?.QueryResponse?.Customer?.[0]
      if (match) return match
    } catch {
      // fall through to name match
    }
  }

  // Fallback: display name match
  const displayName = deriveDisplayName(input)
  try {
    const res = await new Promise<CustomerResponse>((resolve, reject) => {
      client.findCustomers(
        [{ field: 'DisplayName', value: displayName }],
        (err: unknown, data: CustomerResponse) => (err ? reject(err) : resolve(data))
      )
    })
    return res?.QueryResponse?.Customer?.[0] ?? null
  } catch {
    return null
  }
}

export async function findOrCreateQboCustomer(
  input: OrderCustomerInput,
  opts: { dryRun: boolean }
): Promise<QboCustomerMatch> {
  const displayName = deriveDisplayName(input)
  const payload = buildCustomerPayload(input)

  // In dry-run we still try to READ QBO for a match (safe, read-only), so the
  // payload reflects reality. If QBO is unreachable, degrade gracefully.
  let existing: { Id: string; DisplayName: string } | null = null
  try {
    existing = await findQboCustomer(input)
  } catch {
    existing = null
  }

  if (existing) {
    return {
      mode: 'found',
      qboCustomerId: existing.Id,
      displayName: existing.DisplayName,
      payload,
    }
  }

  if (opts.dryRun) {
    return {
      mode: 'would_create',
      qboCustomerId: null,
      displayName,
      payload,
    }
  }

  // Live create (only when sync is enabled)
  const { client: _c } = await getQboClient()
  const client = _c as QboAny
  const created = await new Promise<{ Id: string; DisplayName: string }>((resolve, reject) => {
    client.createCustomer(payload, (err: unknown, cust: { Id: string; DisplayName: string }) => {
      if (err) reject(err)
      else resolve(cust)
    })
  })

  return {
    mode: 'created',
    qboCustomerId: created.Id,
    displayName: created.DisplayName,
    payload,
  }
}

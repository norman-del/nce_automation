import { createServiceClient } from '@/lib/supabase/client'

type ReindexKind = 'page' | 'product' | 'collection'

export function fireCollectionReindex(handle: string, kind: ReindexKind = 'page') {
  const siteUrl = process.env.NCE_SITE_URL
  const internalKey = process.env.INTERNAL_API_KEY
  if (!siteUrl || !internalKey || !handle) return

  fetch(`${siteUrl}/api/chat/reindex`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': internalKey,
    },
    body: JSON.stringify({ kind, id: handle }),
  })
    .then(async (res) => {
      if (!res.ok) {
        const respBody = await res.json().catch(() => ({}))
        console.warn('[collections] chat reindex failed:', respBody.error ?? res.status)
        await logSafe({
          action: 'nce_site_chat_reindex',
          status: 'error',
          details: { handle, kind, http_status: res.status, error: respBody.error ?? null },
        })
      }
    })
    .catch(async (err) => {
      console.warn('[collections] chat reindex request failed:', String(err))
      await logSafe({
        action: 'nce_site_chat_reindex',
        status: 'error',
        details: { handle, kind, error: String(err) },
      })
    })
}

async function logSafe(row: { action: string; status: string; details: unknown }) {
  try {
    await createServiceClient().from('sync_log').insert(row)
  } catch {
    // ignore secondary logging failure
  }
}

export async function logCollectionAction(
  action: string,
  status: 'success' | 'error',
  details: Record<string, unknown>,
) {
  await logSafe({ action: `collection_${action}`, status, details })
}

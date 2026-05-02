/**
 * Strategic ingestion toggle — controls whether the Strategic product form
 * is allowed to actually write (Supabase + QBO + Storage). Default false so
 * Norman/Rich don't accidentally land test items in real QBO during dev.
 *
 * Flip to STRATEGIC_INGESTION_ENABLED=true in Vercel when ready to QA.
 */
export function isStrategicIngestionEnabled(): boolean {
  return process.env.STRATEGIC_INGESTION_ENABLED === 'true'
}

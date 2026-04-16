/**
 * QBO sales sync toggle — controls whether order→QBO sync writes
 * to QuickBooks. Default OFF. Post-cutover set QBO_SALES_SYNC_ENABLED=true.
 *
 * When OFF: orchestrator produces a full payload and stores it in
 * order_qbo_sync with status='dry_run'. No QBO API writes.
 *
 * When ON: actually creates QBO customer (if needed), invoice, payment.
 */
export function isQboSalesSyncEnabled(): boolean {
  return process.env.QBO_SALES_SYNC_ENABLED === 'true'
}

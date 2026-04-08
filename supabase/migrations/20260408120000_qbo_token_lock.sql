-- Add columns for distributed token refresh coordination
ALTER TABLE qbo_connections ADD COLUMN IF NOT EXISTS last_refreshed_by TEXT;
ALTER TABLE qbo_connections ADD COLUMN IF NOT EXISTS refresh_lock_holder TEXT;
ALTER TABLE qbo_connections ADD COLUMN IF NOT EXISTS refresh_lock_at TIMESTAMPTZ;

-- Atomic compare-and-swap: claim the refresh lock.
-- Only succeeds if no one else holds it (or the lock is stale > 30s).
-- Returns the connection row if this caller won the lock, empty if lost.
CREATE OR REPLACE FUNCTION claim_qbo_refresh_lock(
  conn_id UUID,
  caller_id TEXT
) RETURNS TABLE (
  id UUID,
  realm_id TEXT,
  access_token_encrypted TEXT,
  refresh_token_encrypted TEXT,
  token_expires_at TIMESTAMPTZ,
  refresh_token_expires_at TIMESTAMPTZ,
  company_name TEXT,
  shopify_fees_account_id TEXT,
  bank_account_id TEXT,
  updated_at TIMESTAMPTZ,
  last_refreshed_by TEXT
) LANGUAGE plpgsql AS $$
BEGIN
  -- Atomic UPDATE: only one caller wins. Lock is considered stale after 30s.
  RETURN QUERY
  UPDATE qbo_connections c SET
    refresh_lock_holder = caller_id,
    refresh_lock_at = NOW()
  WHERE c.id = conn_id
    AND (
      c.refresh_lock_holder IS NULL
      OR c.refresh_lock_at < NOW() - INTERVAL '30 seconds'
    )
  RETURNING
    c.id, c.realm_id, c.access_token_encrypted, c.refresh_token_encrypted,
    c.token_expires_at, c.refresh_token_expires_at, c.company_name,
    c.shopify_fees_account_id, c.bank_account_id, c.updated_at,
    c.last_refreshed_by;
END;
$$;

-- Save refreshed tokens and release the lock in one atomic operation.
CREATE OR REPLACE FUNCTION save_refreshed_qbo_token(
  conn_id UUID,
  new_access_token_encrypted TEXT,
  new_refresh_token_encrypted TEXT,
  new_token_expires_at TIMESTAMPTZ,
  new_refresh_token_expires_at TIMESTAMPTZ,
  refreshed_by TEXT
) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  UPDATE qbo_connections SET
    access_token_encrypted = new_access_token_encrypted,
    refresh_token_encrypted = new_refresh_token_encrypted,
    token_expires_at = new_token_expires_at,
    refresh_token_expires_at = new_refresh_token_expires_at,
    updated_at = NOW(),
    last_refreshed_by = refreshed_by,
    refresh_lock_holder = NULL,
    refresh_lock_at = NULL
  WHERE id = conn_id;
END;
$$;

-- Release a stale lock without saving (used on refresh failure).
CREATE OR REPLACE FUNCTION release_qbo_refresh_lock(conn_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  UPDATE qbo_connections SET
    refresh_lock_holder = NULL,
    refresh_lock_at = NULL
  WHERE id = conn_id;
END;
$$;

-- Drop the old function that doesn't work
DROP FUNCTION IF EXISTS acquire_qbo_token_lock(UUID);

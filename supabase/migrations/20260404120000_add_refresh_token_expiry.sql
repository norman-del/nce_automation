ALTER TABLE qbo_connections
ADD COLUMN IF NOT EXISTS refresh_token_expires_at TIMESTAMPTZ;

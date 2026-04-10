-- Shipping rate configuration (shared between nce-site and nce_automation)
CREATE TABLE IF NOT EXISTS shipping_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tier integer NOT NULL UNIQUE,            -- 0=Parcel, 1=Single Pallet, 2=Double Pallet
  label text NOT NULL,                     -- display name
  rate_pence integer NOT NULL,             -- cost in pence
  free_threshold_pence integer,            -- order total above which shipping is free (null = never free)
  estimated_days text,                     -- e.g. "2-3 working days"
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Seed with current hardcoded rates from nce-site
INSERT INTO shipping_rates (tier, label, rate_pence, free_threshold_pence, estimated_days) VALUES
  (0, 'Parcel', 499, 100000, '2-3 working days'),
  (1, 'Single Pallet', 4900, 100000, '3-5 working days'),
  (2, 'Double Pallet', 9900, 100000, '5-7 working days')
ON CONFLICT (tier) DO NOTHING;

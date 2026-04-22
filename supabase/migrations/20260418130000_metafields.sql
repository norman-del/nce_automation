-- Structured specs / metafields system. Staff can define fields without a code deploy.

create table if not exists metafield_definitions (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  label text not null,
  field_type text not null check (field_type in ('text','number','boolean','dimension','select')),
  unit text,
  options jsonb,
  display_group text,
  sort_order integer not null default 0,
  required boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists metafield_definitions_sort_idx
  on metafield_definitions (display_group, sort_order);

create table if not exists product_metafields (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  definition_id uuid not null references metafield_definitions(id) on delete cascade,
  value_text text,
  value_number numeric,
  value_boolean boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, definition_id)
);

create index if not exists product_metafields_product_idx on product_metafields (product_id);

-- Staff users table for role-based access control
-- Linked to Supabase Auth users via auth_user_id

create table if not exists staff_users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique,
  email text not null unique,
  name text not null,
  role text not null default 'staff' check (role in ('admin', 'staff')),
  created_at timestamptz not null default now()
);

create index idx_staff_users_auth on staff_users (auth_user_id);
create index idx_staff_users_email on staff_users (email);

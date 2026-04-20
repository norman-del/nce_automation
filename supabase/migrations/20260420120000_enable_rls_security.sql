-- Security hardening: enable RLS on all public tables
--
-- Context: Supabase flagged critical risk because most public tables had
-- row_security disabled. The anon key (exposed in browsers) could read/write
-- them via the REST API. Service-role code in both apps bypasses RLS, so
-- enabling RLS with no policies is safe for tables only touched server-side.
--
-- Browser-client access in nce-site: customers, customer_addresses. These
-- need policies so signed-in users can reach their own rows only.

-- 1. Enable RLS on every public table that was unprotected.
ALTER TABLE public.blog_articles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collections           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_addresses    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metafield_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_qbo_sync        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pages                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.policies              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_images        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_metafields    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipping_rates        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_users           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_adjustments     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers             ENABLE ROW LEVEL SECURITY;

-- 2. Customer-owned tables: scope access to the signed-in user.
-- customers.email is the link to auth.users.email (customer.id is independent).
CREATE POLICY "customers_self_select" ON public.customers
  FOR SELECT TO authenticated
  USING (email = (auth.jwt() ->> 'email'));

CREATE POLICY "customers_self_update" ON public.customers
  FOR UPDATE TO authenticated
  USING (email = (auth.jwt() ->> 'email'))
  WITH CHECK (email = (auth.jwt() ->> 'email'));

-- customer_addresses: allowed when the row's customer_id belongs to the caller.
CREATE POLICY "customer_addresses_self_select" ON public.customer_addresses
  FOR SELECT TO authenticated
  USING (
    customer_id IN (
      SELECT id FROM public.customers
      WHERE email = (auth.jwt() ->> 'email')
    )
  );

CREATE POLICY "customer_addresses_self_insert" ON public.customer_addresses
  FOR INSERT TO authenticated
  WITH CHECK (
    customer_id IN (
      SELECT id FROM public.customers
      WHERE email = (auth.jwt() ->> 'email')
    )
  );

CREATE POLICY "customer_addresses_self_update" ON public.customer_addresses
  FOR UPDATE TO authenticated
  USING (
    customer_id IN (
      SELECT id FROM public.customers
      WHERE email = (auth.jwt() ->> 'email')
    )
  )
  WITH CHECK (
    customer_id IN (
      SELECT id FROM public.customers
      WHERE email = (auth.jwt() ->> 'email')
    )
  );

CREATE POLICY "customer_addresses_self_delete" ON public.customer_addresses
  FOR DELETE TO authenticated
  USING (
    customer_id IN (
      SELECT id FROM public.customers
      WHERE email = (auth.jwt() ->> 'email')
    )
  );

-- All other tables: no policies. anon/authenticated get zero access via
-- PostgREST; the service role bypasses RLS, so API routes in both apps
-- continue to work unchanged.

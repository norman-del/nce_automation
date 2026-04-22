-- Collection CRUD enhancements: new display_order column and storage bucket for images.
-- Note: existing `sort_order` (text) stores the Shopify product-sort strategy
-- ('price-asc', 'alpha-asc', etc.) and is left alone.

alter table collections add column if not exists display_order integer not null default 0;

create index if not exists collections_display_order_idx on collections (display_order);

-- Public read bucket for collection images.
insert into storage.buckets (id, name, public)
values ('collection-images', 'collection-images', true)
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'collection_images_public_read'
  ) then
    create policy "collection_images_public_read" on storage.objects
      for select using (bucket_id = 'collection-images');
  end if;
end$$;

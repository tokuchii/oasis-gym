-- Run this in the Supabase SQL Editor after creating your project.
-- All access goes through Nuxt server routes (service role key); RLS stays enabled with no public policies.

create table if not exists walkin_passes (
  id                uuid primary key default gen_random_uuid(),
  pass_code         text unique not null,
  full_name         text not null,
  email             text not null,
  phone             text not null,
  emergency_contact text not null,
  visit_date        date not null default (timezone('Asia/Manila', now()))::date,
  status            text not null default 'registered' check (status in ('registered', 'checked_in', 'expired')),
  created_at        timestamptz not null default now(),
  checked_in_at     timestamptz,
  checked_in_by     text
);

create index if not exists walkin_passes_pass_code_idx on walkin_passes (pass_code);
create index if not exists walkin_passes_visit_date_status_idx on walkin_passes (visit_date, status);
create index if not exists walkin_passes_phone_visit_date_idx on walkin_passes (phone, visit_date);

alter table walkin_passes enable row level security;

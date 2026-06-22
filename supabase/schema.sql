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
  payment_amount    numeric default 0,
  created_at        timestamptz not null default now(),
  checked_in_at     timestamptz,
  checked_in_by     text
);

create index if not exists walkin_passes_pass_code_idx on walkin_passes (pass_code);
create index if not exists walkin_passes_visit_date_status_idx on walkin_passes (visit_date, status);
create index if not exists walkin_passes_phone_visit_date_idx on walkin_passes (phone, visit_date);

alter table walkin_passes enable row level security;

-- Membership payments (weekly/monthly)
create table if not exists membership_payments (
  id                uuid primary key default gen_random_uuid(),
  full_name         text not null,
  email             text not null,
  phone             text not null,
  plan              text not null check (plan in ('weekly', 'monthly')),
  coach             text,
  payment_method    text not null,
  reference_no      text,
  amount            numeric not null,
  receipt_url       text,
  status            text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at        timestamptz not null default now()
);

create index if not exists membership_payments_email_idx on membership_payments (email);
create index if not exists membership_payments_status_idx on membership_payments (status);

alter table membership_payments enable row level security;

-- Client sessions (tracking)
create table if not exists client_sessions (
  id                uuid primary key default gen_random_uuid(),
  client_name       text not null,
  client_email      text not null,
  client_phone      text not null,
  coach_name        text,
  plan              text not null check (plan in ('weekly', 'monthly')),
  total_sessions    int not null,
  sessions_used     int not null default 0,
  start_date        date not null default (timezone('Asia/Manila', now()))::date,
  end_date          date not null,
  status            text not null default 'active' check (status in ('active', 'completed', 'expired')),
  created_at        timestamptz not null default now()
);

create index if not exists client_sessions_coach_idx on client_sessions (coach_name);
create index if not exists client_sessions_status_idx on client_sessions (status);

alter table client_sessions enable row level security;

-- Coaches
create table if not exists coaches (
  id                uuid primary key default gen_random_uuid(),
  full_name         text not null,
  specialty         text,
  bio               text,
  photo_url         text,
  display_order     int not null default 0,
  active            boolean not null default true,
  created_at        timestamptz not null default now()
);

create index if not exists coaches_active_idx on coaches (active, display_order);

alter table coaches enable row level security;

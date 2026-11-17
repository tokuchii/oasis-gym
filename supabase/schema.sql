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
  checked_in_by     text,
  points            numeric not null default 0,
  member_status     text not null default 'walkin' check (member_status in ('walkin', 'weekly', 'monthly')),
  customer_type     text not null default 'non_member' check (customer_type in ('member', 'non_member')),
  removed           boolean not null default false
);

create index if not exists walkin_passes_pass_code_idx on walkin_passes (pass_code);
create index if not exists walkin_passes_visit_date_status_idx on walkin_passes (visit_date, status);
create index if not exists walkin_passes_phone_visit_date_idx on walkin_passes (phone, visit_date);

alter table walkin_passes enable row level security;

-- Membership payments (daily/weekly/monthly)
create table if not exists membership_payments (
  id                uuid primary key default gen_random_uuid(),
  full_name         text not null,
  email             text not null,
  phone             text not null,
  plan              text not null check (plan in ('daily', 'weekly', 'monthly')),
  customer_type     text not null default 'member' check (customer_type in ('member', 'non_member')),
  plan_price        numeric,
  membership_fee    numeric not null default 0,
  instructor_fee    numeric not null default 0,
  coach             text,
  payment_method    text not null,
  reference_no      text,
  amount            numeric not null,
  receipt_url       text,
  status            text not null default 'pending' check (status in ('pending', 'partial', 'approved', 
'rejected')),
  expiry_date       date,
  note              text,
  paid_amount       numeric,
  reminder_sent     boolean not null default false,
  created_at        timestamptz not null default now()
);

create index if not exists membership_payments_email_idx on membership_payments (email);
create index if not exists membership_payments_status_idx on membership_payments (status);
create index if not exists membership_payments_expiry_idx on membership_payments (expiry_date, status, reminder_sent);

alter table membership_payments enable row level security;

-- Client sessions (tracking)
create table if not exists client_sessions (
  id                uuid primary key default gen_random_uuid(),
  client_name       text not null,
  client_email      text not null,
  client_phone      text not null,
  coach_name        text,
  plan              text not null check (plan in ('daily', 'weekly', 'monthly')),
  customer_type     text not null default 'member' check (customer_type in ('member', 'non_member')),
  payment_id        uuid,
  total_sessions    int not null,
  sessions_used     int not null default 0,
  start_date        date not null default (timezone('Asia/Manila', now()))::date,
  end_date          date not null,
  status            text not null default 'active' check (status in ('active', 'completed', 'expired')),
  removed           boolean not null default false,
  note              text,
  paid_amount       numeric,
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

-- ---------------------------------------------------------------------------
-- Migrations (safe to re-run on an existing database)
-- ---------------------------------------------------------------------------

-- Walk-in member status (walk-in / weekly / monthly) + soft removal.
alter table walkin_passes add column if not exists member_status text not null default 'walkin';
alter table walkin_passes add column if not exists customer_type text not null default 'non_member';
alter table walkin_passes add column if not exists removed boolean not null default false;

-- Daily plan replaces the old yearly plan. Convert any legacy yearly rows so the
-- new constraints can be applied safely.
update walkin_passes set member_status = 'monthly' where member_status = 'yearly';
update membership_payments set plan = 'monthly' where plan = 'yearly';
update client_sessions set plan = 'monthly' where plan = 'yearly';

alter table walkin_passes drop constraint if exists walkin_passes_member_status_check;
alter table walkin_passes
  add constraint walkin_passes_member_status_check
  check (member_status in ('walkin', 'weekly', 'monthly'));

alter table walkin_passes drop constraint if exists walkin_passes_customer_type_check;
alter table walkin_passes
  add constraint walkin_passes_customer_type_check
  check (customer_type in ('member', 'non_member'));

create index if not exists walkin_passes_removed_member_status_idx on walkin_passes (removed, member_status);
create index if not exists walkin_passes_removed_customer_type_idx on walkin_passes (removed, customer_type);

-- Daily plan support on membership payments and client sessions.
alter table membership_payments drop constraint if exists membership_payments_plan_check;
alter table membership_payments
  add constraint membership_payments_plan_check
  check (plan in ('daily', 'weekly', 'monthly'));

alter table client_sessions drop constraint if exists client_sessions_plan_check;
alter table client_sessions
  add constraint client_sessions_plan_check
  check (plan in ('daily', 'weekly', 'monthly'));

-- Pricing breakdown + member/non-member type.
alter table membership_payments add column if not exists customer_type text not null default 'member';
alter table membership_payments add column if not exists plan_price numeric;
alter table membership_payments add column if not exists membership_fee numeric not null default 0;
alter table membership_payments add column if not exists instructor_fee numeric not null default 0;

alter table membership_payments drop constraint if exists membership_payments_customer_type_check;
alter table membership_payments
  add constraint membership_payments_customer_type_check
  check (customer_type in ('member', 'non_member'));

alter table client_sessions add column if not exists customer_type text not null default 'member';
alter table client_sessions add column if not exists payment_id uuid;

alter table client_sessions drop constraint if exists client_sessions_customer_type_check;
alter table client_sessions
  add constraint client_sessions_customer_type_check
  check (customer_type in ('member', 'non_member'));

create index if not exists client_sessions_payment_id_idx on client_sessions (payment_id);

-- Session reminders + completion tracking on client sessions.
alter table client_sessions add column if not exists low_session_reminder_sent boolean not null default false;
alter table client_sessions add column if not exists completion_notified boolean not null default false;
alter table client_sessions add column if not exists completed_at timestamptz;

-- Every successful plan check-out is logged so sessions can be counted in reports.
create table if not exists client_session_usage (
  id                uuid primary key default gen_random_uuid(),
  session_id        uuid,
  client_name       text not null,
  client_email      text,
  client_phone      text not null,
  plan              text not null check (plan in ('daily', 'weekly', 'monthly')),
  used_at           timestamptz not null default now(),
  used_date         date not null default (timezone('Asia/Manila', now()))::date,
  pass_code         text,
  staff             text
);

create index if not exists client_session_usage_date_idx on client_session_usage (used_date);
create index if not exists client_session_usage_session_idx on client_session_usage (session_id);
create index if not exists client_session_usage_phone_idx on client_session_usage (client_phone);

alter table client_session_usage enable row level security;

-- Phone is optional and may be shared; duplicates are prevented by name + phone + email.
alter table walkin_passes drop constraint if exists walkin_passes_phone_key;
drop index if exists walkin_passes_phone_unique_idx;

-- Align existing session totals with the current plan definitions (weekly = 7, monthly = 30).
update client_sessions set total_sessions = 7 where plan = 'weekly' and total_sessions <> 7;
update client_sessions set total_sessions = 30 where plan = 'monthly' and total_sessions <> 30;
update client_sessions set total_sessions = 1 where plan = 'daily' and total_sessions <> 1;

-- Re-open sessions that were marked complete only because of an old lower session total.
update client_sessions
set status = 'active',
    completed_at = null,
    completion_notified = false
where status = 'completed'
  and sessions_used < total_sessions
  and end_date >= (timezone('Asia/Manila', now()))::date;

-- ---------------------------------------------------------------------------
-- Activity log (all staff actions across the system)
-- ---------------------------------------------------------------------------
create table if not exists activity_logs (
  id                uuid primary key default gen_random_uuid(),
  category          text not null,
  action            text not null,
  title             text not null,
  description       text,
  client_name       text,
  client_phone      text,
  client_email      text,
  amount            numeric,
  reference         text,
  metadata          jsonb,
  staff             text not null default 'staff',
  created_at        timestamptz not null default now()
);

create index if not exists activity_logs_created_at_idx on activity_logs (created_at desc);
create index if not exists activity_logs_category_idx on activity_logs (category);
create index if not exists activity_logs_client_email_idx on activity_logs (client_email);

alter table activity_logs enable row level security;

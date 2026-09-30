-- Explain Your Data — Postgres schema (metadata only; files live in object storage)
create extension if not exists pgcrypto;

create table users (
  id uuid primary key,                         -- matches the auth provider's user id (Supabase auth.users.id)
  email text unique not null,
  plan text not null default 'free',           -- free | plus | pro | team
  created_at timestamptz not null default now()
);

create table projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table project_members (
  project_id uuid references projects(id) on delete cascade,
  user_id uuid references users(id) on delete cascade,
  role text not null default 'viewer',         -- owner | editor | viewer
  primary key (project_id, user_id)
);

create table files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  filename text not null,
  bytes bigint not null,
  storage_key text not null,                   -- {user}/{project}/{dataset}/original/...
  sha256 text,
  created_at timestamptz not null default now()
);

create table datasets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  file_id uuid references files(id) on delete set null,
  name text not null,
  kind text not null default 'table',          -- table | text
  schema jsonb not null,                       -- [{name, type, unit, order}]
  row_count bigint, column_count int, quality_score int,
  created_at timestamptz not null default now()
);

create table dataset_versions (                -- lineage: every cleaning step, replayable
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid not null references datasets(id) on delete cascade,
  seq int not null,
  op text not null, params jsonb not null, label text not null,
  code_py text, code_r text,
  row_count bigint,
  created_at timestamptz not null default now(),
  unique (dataset_id, seq)
);

create table conversations (id uuid primary key default gen_random_uuid(), dataset_id uuid references datasets(id) on delete cascade, created_at timestamptz default now());
create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  role text not null, content text not null,
  tool_calls jsonb, unverified_numbers text[],
  model text, tokens_in int, tokens_out int,
  created_at timestamptz not null default now()
);

create table analysis_jobs (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid not null references datasets(id) on delete cascade,
  name text not null, params jsonb not null,
  status text not null default 'queued',       -- queued | running | finished | failed
  result jsonb, error text, runtime_ms int,
  created_at timestamptz not null default now()
);

create table charts (id uuid primary key default gen_random_uuid(), dataset_id uuid references datasets(id) on delete cascade, spec jsonb not null, title text, created_at timestamptz default now());
create table dashboards (id uuid primary key default gen_random_uuid(), project_id uuid references projects(id) on delete cascade, name text, layout jsonb not null, filters jsonb, created_at timestamptz default now());
create table reports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  title text not null, style text not null default 'executive',
  items jsonb not null, narrative jsonb,
  public_slug text unique,                     -- /story/{slug} share links (charts + text only, never raw rows)
  created_at timestamptz default now(), updated_at timestamptz default now()
);

create table usage (                            -- metering for credits and billing
  id bigserial primary key,
  user_id uuid not null references users(id) on delete cascade,
  kind text not null,                          -- file_processing | ai_tokens | python_compute | ml_compute | export
  quantity numeric not null, credits numeric not null default 0,
  created_at timestamptz not null default now()
);
create index usage_user_month on usage (user_id, created_at);

create table subscriptions (
  user_id uuid primary key references users(id) on delete cascade,
  stripe_customer_id text, stripe_subscription_id text,
  plan text not null, status text not null, current_period_end timestamptz
);


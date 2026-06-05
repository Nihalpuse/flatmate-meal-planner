-- =========================================================
-- FlatMate Meal Planner — initial schema + RLS
-- =========================================================

-- ---------- ENUMS ----------
create type member_role    as enum ('admin', 'member');
create type session_status as enum ('open', 'voting', 'finalized', 'cancelled');
create type meal_type      as enum ('lunch', 'dinner');

-- ---------- PROFILES (1:1 with auth.users) ----------
create table profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  name       text,
  email      text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------- GROUPS ----------
create table groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  invite_code text not null unique,
  created_by  uuid not null references profiles (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------- GROUP MEMBERS ----------
create table group_members (
  id        uuid primary key default gen_random_uuid(),
  group_id  uuid not null references groups (id) on delete cascade,
  user_id   uuid not null references profiles (id) on delete cascade,
  role      member_role not null default 'member',
  joined_at timestamptz not null default now(),
  unique (group_id, user_id)
);
create index group_members_user_idx  on group_members (user_id);
create index group_members_group_idx on group_members (group_id);

-- ---------- INGREDIENTS (pantry) ----------
create table ingredients (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references groups (id) on delete cascade,
  name       text not null,
  quantity   numeric,
  unit       text,
  available  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Case-insensitive uniqueness needs an expression index, not an inline
-- UNIQUE constraint (Postgres disallows expressions in table constraints).
create unique index ingredients_group_lower_name_idx
  on ingredients (group_id, lower(name));
create index ingredients_group_idx on ingredients (group_id);

-- ---------- MEAL SESSIONS (lunch + dinner per day) ----------
create table meal_sessions (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references groups (id) on delete cascade,
  session_date date not null,
  meal_type    meal_type not null,
  status       session_status not null default 'open',
  created_at   timestamptz not null default now(),
  unique (group_id, session_date, meal_type)
);
create index meal_sessions_group_idx on meal_sessions (group_id, session_date);

-- ---------- MEAL SUGGESTIONS ----------
create table meal_suggestions (
  id                   uuid primary key default gen_random_uuid(),
  session_id           uuid not null references meal_sessions (id) on delete cascade,
  meal_name            text not null,
  ai_generated         boolean not null default true,
  required_ingredients jsonb not null default '[]',
  created_at           timestamptz not null default now()
);
create index meal_suggestions_session_idx on meal_suggestions (session_id);

-- ---------- VOTES ----------
create table votes (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references meal_sessions (id)    on delete cascade,
  suggestion_id uuid not null references meal_suggestions (id) on delete cascade,
  user_id       uuid not null references profiles (id)         on delete cascade,
  created_at    timestamptz not null default now(),
  unique (session_id, user_id)
);
create index votes_session_idx    on votes (session_id);
create index votes_suggestion_idx on votes (suggestion_id);

-- ---------- FINALIZED MEALS ----------
create table finalized_meals (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null unique references meal_sessions (id) on delete cascade,
  suggestion_id uuid references meal_suggestions (id),
  meal_name     text not null,
  finalized_by  uuid not null references profiles (id),
  finalized_at  timestamptz not null default now()
);

-- ---------- MEAL HISTORY (derived view) ----------
create view meal_history as
select
  fm.id,
  ms.group_id,
  fm.meal_name,
  ms.session_date as date,
  ms.meal_type,
  fm.finalized_at
from finalized_meals fm
join meal_sessions ms on ms.id = fm.session_id;

-- =========================================================
-- ROW-LEVEL SECURITY
-- =========================================================

create function is_group_member(gid uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from group_members
    where group_id = gid and user_id = auth.uid()
  );
$$;

create function is_group_admin(gid uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from group_members
    where group_id = gid and user_id = auth.uid() and role = 'admin'
  );
$$;

alter table profiles         enable row level security;
alter table groups           enable row level security;
alter table group_members    enable row level security;
alter table ingredients      enable row level security;
alter table meal_sessions    enable row level security;
alter table meal_suggestions enable row level security;
alter table votes            enable row level security;
alter table finalized_meals  enable row level security;

-- profiles
create policy profiles_self_read   on profiles for select using (id = auth.uid());
create policy profiles_self_update on profiles for update using (id = auth.uid());

-- groups
create policy groups_member_read  on groups for select using (is_group_member(id));
create policy groups_admin_update on groups for update using (is_group_admin(id));
create policy groups_insert       on groups for insert with check (created_by = auth.uid());

-- group_members
create policy gm_member_read on group_members for select using (is_group_member(group_id));
create policy gm_admin_write on group_members for all
  using (is_group_admin(group_id)) with check (is_group_admin(group_id));

-- ingredients
create policy ingredients_member_all on ingredients for all
  using (is_group_member(group_id)) with check (is_group_member(group_id));

-- meal_sessions
create policy sessions_member_all on meal_sessions for all
  using (is_group_member(group_id)) with check (is_group_member(group_id));

-- meal_suggestions
create policy suggestions_member_all on meal_suggestions for all
  using (is_group_member((select group_id from meal_sessions where id = session_id)))
  with check (is_group_member((select group_id from meal_sessions where id = session_id)));

-- votes
create policy votes_member_read on votes for select
  using (is_group_member((select group_id from meal_sessions where id = session_id)));
create policy votes_self_write on votes for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- finalized_meals
create policy finalized_member_read on finalized_meals for select
  using (is_group_member((select group_id from meal_sessions where id = session_id)));
create policy finalized_admin_write on finalized_meals for all
  using (is_group_admin((select group_id from meal_sessions where id = session_id)))
  with check (is_group_admin((select group_id from meal_sessions where id = session_id)));

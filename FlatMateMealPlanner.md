# 🍛 FlatMate Meal Planner

## Overview

FlatMate Meal Planner is a web application designed to solve a common problem faced by roommates and shared apartments: **deciding what food to cook every day**.

Instead of having the same discussion every time the cook arrives, flatmates can:

* Vote on meals
* Get AI-powered meal suggestions
* Track meal history
* Manage available ingredients
* Avoid repeating meals
* Generate grocery lists

The application acts as a single source of truth for daily meal planning.

---

# Problem Statement

In shared apartments:

* Multiple people have different food preferences.
* Available ingredients change frequently.
* Some vegetables or groceries may be missing.
* The same meals get repeated often.
* Decisions happen at the last minute.

This creates confusion and wastes time every day.

The goal is to reduce meal decision-making from 15–20 minutes to under 2 minutes.

---

# Target Users

### Primary Users

* Flatmates
* Shared apartments
* Hostel rooms
* PG residents

### Example Use Case

3 roommates live together.

Every day:

1. Cook arrives.
2. Nobody knows what to make.
3. Everyone suggests different dishes.
4. Some ingredients are unavailable.
5. Decision takes 15–20 minutes.

FlatMate Meal Planner solves this process.

---

# Tech Stack

## Frontend

* Next.js 15 (App Router)
* TypeScript
* Tailwind CSS
* shadcn/ui

## Backend

* Next.js Server Actions
* Next.js Route Handlers

## Database

* Supabase PostgreSQL

## Authentication

* Supabase Auth
* Google Login
* Email/Password Login

## AI

* Gemini API

## Deployment

* Vercel

---

# Core Features

## 1. Authentication

Users can:

* Register
* Login
* Logout
* Join a group

Supported login methods:

* Google
* Email + Password

---

## 2. Group Management

### Create Group

Example:

Flat 302

### Invite Members

Invite via:

* Invite Link
* Invite Code

Example:

FLAT302-ABCD

### Roles

#### Admin

Can:

* Manage group
* Invite members
* Manage inventory

#### Member

Can:

* Vote
* View meals
* Update ingredients

---

## 3. Pantry Management

Store available ingredients.

### Example

| Ingredient | Quantity | Unit |
| ---------- | -------- | ---- |
| Potato     | 2        | kg   |
| Onion      | 1        | kg   |
| Rice       | 5        | kg   |
| Egg        | 12       | pcs  |

### Actions

* Add Ingredient
* Edit Ingredient
* Delete Ingredient
* Mark Available / Unavailable

---

## 4. Daily Meal Session

Each day creates two meal sessions: **Lunch** and **Dinner**. Each is voted on and
finalized independently.

Example:

Date: 2026-06-05

Meal: Lunch

Status: Open

This session contains:

* Available ingredients
* Suggested meals
* Votes
* Final decision

---

## 5. AI Meal Suggestions

Generate meal suggestions based on:

* Available ingredients
* Previous meals
* Budget-friendly recipes
* Easy-to-cook recipes

### Example Input

Available Ingredients:

* Onion
* Potato
* Rice
* Egg

Recent Meals:

* Rajma Rice
* Aloo Gobi

### Example Output

1. Egg Fried Rice
2. Aloo Jeera + Roti
3. Potato Rice Bowl
4. Egg Curry + Rice
5. Masala Rice

---

## 6. Voting System

Each member gets one vote.

### Example

| Meal           | Votes |
| -------------- | ----- |
| Egg Fried Rice | 2     |
| Egg Curry      | 1     |

Winner:

Egg Fried Rice

### Rules

* One vote per user
* Vote can be changed until finalization
* Highest votes win

---

## 7. Meal Finalization

Once voting ends:

Status becomes:

Finalized

Display:

Today's Meal: Egg Fried Rice

This is what the cook should prepare.

---

## 8. Meal History

Track previously cooked meals.

### Example

| Date       | Meal       |
| ---------- | ---------- |
| 2026-06-01 | Rajma Rice |
| 2026-06-02 | Egg Curry  |
| 2026-06-03 | Veg Pulao  |

Purpose:

* Avoid repetition
* Improve AI recommendations

---

## 9. Missing Ingredient Detection

When a meal is selected:

Check required ingredients.

Example:

Selected Meal:

Paneer Butter Masala

Required:

* Paneer
* Tomato
* Cream

Available:

* Tomato

Missing:

* Paneer
* Cream

Result:

Shopping Required

---

## 10. Grocery List Generator

Generate grocery lists automatically.

### Example

Buy:

* Paneer
* Cream
* Coriander

Actions:

* Copy List
* Share on WhatsApp

---

# Database Schema

> **Design decisions baked into this schema**
>
> * **Two meal sessions per group per day: Lunch and Dinner.** Each has its own
>   ingredients, suggestions, votes, and finalized meal. Enforced by
>   `unique (group_id, session_date, meal_type)`.
> * **Availability is presence-based, not quantity-based, in v1.** Quantities are
>   stored for display and grocery lists but don't block a meal.
> * **Voting ends when an admin finalizes.** Tie-break: earliest-suggested meal wins.
> * **Identity lives in Supabase Auth** (`auth.users`); app data hangs off a
>   `profiles` table, not a duplicate `users` table.
> * **Meal history is a derived view** over finalized meals — single source of truth.

## Enums

```sql
create type member_role    as enum ('admin', 'member');
create type session_status as enum ('open', 'voting', 'finalized', 'cancelled');
create type meal_type      as enum ('lunch', 'dinner');
```

## profiles (1:1 with auth.users — do NOT recreate auth)

```sql
create table profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  name       text,
  email      text,
  avatar_url text,
  created_at timestamptz not null default now()
);

-- Auto-create a profile row when a user signs up
create function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, email, name, avatar_url)
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
```

## groups

```sql
create table groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  invite_code text not null unique,                 -- e.g. FLAT302-ABCD
  created_by  uuid not null references profiles (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
```

## group_members

```sql
create table group_members (
  id        uuid primary key default gen_random_uuid(),
  group_id  uuid not null references groups (id) on delete cascade,
  user_id   uuid not null references profiles (id) on delete cascade,
  role      member_role not null default 'member',
  joined_at timestamptz not null default now(),
  unique (group_id, user_id)                         -- a user joins a group once
);

create index group_members_user_idx  on group_members (user_id);
create index group_members_group_idx on group_members (group_id);
```

## ingredients (pantry, per group)

```sql
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

-- Case-insensitive uniqueness must be an expression index, not an inline
-- UNIQUE constraint (Postgres disallows expressions in table constraints).
create unique index ingredients_group_lower_name_idx
  on ingredients (group_id, lower(name));
create index ingredients_group_idx on ingredients (group_id);
```

## meal_sessions (two per group per day: lunch + dinner)

```sql
create table meal_sessions (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references groups (id) on delete cascade,
  session_date date not null,
  meal_type    meal_type not null,
  status       session_status not null default 'open',
  created_at   timestamptz not null default now(),
  unique (group_id, session_date, meal_type)         -- one lunch + one dinner per day
);

create index meal_sessions_group_idx on meal_sessions (group_id, session_date);
```

## meal_suggestions (carries required ingredients → powers missing-ingredient detection)

```sql
create table meal_suggestions (
  id                   uuid primary key default gen_random_uuid(),
  session_id           uuid not null references meal_sessions (id) on delete cascade,
  meal_name            text not null,
  ai_generated         boolean not null default true,
  required_ingredients jsonb not null default '[]',  -- e.g. ["paneer","tomato","cream"]
  created_at           timestamptz not null default now()
);

create index meal_suggestions_session_idx on meal_suggestions (session_id);
```

## votes (one per user per session)

```sql
create table votes (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references meal_sessions (id)    on delete cascade,
  suggestion_id uuid not null references meal_suggestions (id) on delete cascade,
  user_id       uuid not null references profiles (id)         on delete cascade,
  created_at    timestamptz not null default now(),
  unique (session_id, user_id)                       -- one vote per user; UPSERT to change
);

create index votes_session_idx    on votes (session_id);
create index votes_suggestion_idx on votes (suggestion_id);
```

## finalized_meals (one per session)

```sql
create table finalized_meals (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null unique references meal_sessions (id) on delete cascade,
  suggestion_id uuid references meal_suggestions (id),
  meal_name     text not null,
  finalized_by  uuid not null references profiles (id),
  finalized_at  timestamptz not null default now()
);
```

## meal_history (derived view — no manual maintenance, no drift)

```sql
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
```

---

# Row-Level Security

Without RLS, any logged-in user could read every group's pantry and votes. These
policies scope all data access to groups the user belongs to.

```sql
-- Helpers
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

-- Enable RLS
alter table profiles         enable row level security;
alter table groups           enable row level security;
alter table group_members    enable row level security;
alter table ingredients      enable row level security;
alter table meal_sessions    enable row level security;
alter table meal_suggestions enable row level security;
alter table votes            enable row level security;
alter table finalized_meals  enable row level security;

-- profiles: only your own
create policy profiles_self_read   on profiles for select using (id = auth.uid());
create policy profiles_self_update on profiles for update using (id = auth.uid());

-- groups: members read, admins update
create policy groups_member_read  on groups for select using (is_group_member(id));
create policy groups_admin_update on groups for update using (is_group_admin(id));
create policy groups_insert       on groups for insert with check (created_by = auth.uid());

-- group_members: members read roster, admins manage
create policy gm_member_read on group_members for select using (is_group_member(group_id));
create policy gm_admin_write on group_members for all
  using (is_group_admin(group_id)) with check (is_group_admin(group_id));

-- ingredients: any member can manage (per spec)
create policy ingredients_member_all on ingredients for all
  using (is_group_member(group_id)) with check (is_group_member(group_id));

-- meal_sessions: members read & create
create policy sessions_member_all on meal_sessions for all
  using (is_group_member(group_id)) with check (is_group_member(group_id));

-- meal_suggestions: scoped via parent session's group
create policy suggestions_member_all on meal_suggestions for all
  using (is_group_member((select group_id from meal_sessions where id = session_id)))
  with check (is_group_member((select group_id from meal_sessions where id = session_id)));

-- votes: members read, you vote only as yourself
create policy votes_member_read on votes for select
  using (is_group_member((select group_id from meal_sessions where id = session_id)));
create policy votes_self_write on votes for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- finalized_meals: members read, admins finalize
create policy finalized_member_read on finalized_meals for select
  using (is_group_member((select group_id from meal_sessions where id = session_id)));
create policy finalized_admin_write on finalized_meals for all
  using (is_group_admin((select group_id from meal_sessions where id = session_id)))
  with check (is_group_admin((select group_id from meal_sessions where id = session_id)));
```

## Missing-ingredient detection (logic)

The AI returns required ingredients per suggestion, so detection is a set difference:

```ts
const pantry = new Set(
  ingredients.filter(i => i.available).map(i => i.name.toLowerCase())
);
const missing = suggestion.required_ingredients
  .filter(name => !pantry.has(name.toLowerCase()));

const shoppingRequired = missing.length > 0;   // grocery list = `missing`
```

## Vote tally + tie-break (logic)

```sql
select s.id, s.meal_name, count(v.id) as votes, min(s.created_at) as suggested_at
from meal_suggestions s
left join votes v on v.suggestion_id = s.id
where s.session_id = :session_id
group by s.id
order by votes desc, suggested_at asc   -- earliest suggestion wins a tie
limit 1;
```

---

# Application Pages

## Public Pages

### Landing Page

Features:

* Product overview
* Benefits
* Login button
* Register button

### Authentication

* Login
* Register

---

## Protected Pages

### Dashboard

Shows:

* Today's meal session
* Available ingredients
* AI suggestions
* Current votes

### Pantry

Manage ingredients.

### Voting

Vote on suggested meals.

### History

View meal history.

### Settings

Manage group information.

---

# UI Requirements

Theme:

* Modern
* Minimal
* Mobile First

Design System:

* shadcn/ui

Components:

* Cards
* Dialogs
* Drawers
* Tables
* Badges
* Toast Notifications

---

# MVP Scope (Version 1)

The first version should include:

* Authentication
* Group Management
* Pantry Management
* AI Meal Suggestions
* Voting System
* Meal Finalization
* Meal History

---

# Future Enhancements

## Weekly Meal Planner

Generate meals for:

* Monday
* Tuesday
* Wednesday
* Thursday
* Friday
* Saturday
* Sunday

---

## Smart Inventory Tracking

Automatically reduce ingredient quantities after meal completion.

---

## Cook Dashboard

Simple screen showing:

Today's Meal

Servings

Required Ingredients

---

## WhatsApp Integration

Automatically send final meal decision to the cook.

---

# Success Metrics

The application is successful when:

* Meal decisions take less than 2 minutes.
* Users stop discussing meals manually.
* Meal repetition decreases.
* Grocery planning becomes easier.
* The cook receives clear meal instructions.

---

# MVP User Flow

```text
Login
  ↓
Join/Create Group
  ↓
Add Available Ingredients
  ↓
Generate AI Suggestions
  ↓
Vote on Meals
  ↓
Finalize Meal
  ↓
View History
```

# Project Goal

Make meal planning effortless for flatmates by combining:

* Shared decision making
* AI recommendations
* Ingredient tracking
* Voting
* Meal history

into one simple application.

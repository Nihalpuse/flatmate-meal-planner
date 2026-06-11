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

* Next.js 16 (App Router)
* TypeScript
* Tailwind CSS v4
* shadcn-style components (Base UI + cva)

## Backend

* Next.js Server Actions

## Database

* Neon Postgres (serverless) via Drizzle ORM
* Schema source of truth: `src/db/schema.ts`; migrations in `drizzle/`

## Authentication

* Auth.js v5 (Credentials provider, JWT sessions)
* Authorization is enforced in server actions (group-scoped queries), not RLS

## AI

* Gemini API (`gemini-2.5-flash`, structured JSON output)

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

The schema lives in [`src/db/schema.ts`](src/db/schema.ts) (Drizzle) — that file is
the source of truth; migrations are generated into `drizzle/`. Design decisions:

* **Two meal sessions per group per day: Lunch and Dinner.** Enforced by
  `unique (group_id, session_date, meal_type)`. Session dates are computed in the
  group's timezone.
* **Availability is presence-based, not quantity-based, in v1.** Quantities are
  stored for display and grocery lists but don't block a meal.
* **Voting ends when an admin finalizes.** Tie-break: earliest-suggested meal wins.
* **One vote per user per session** (`unique (session_id, user_id)`, upsert to move).
* **Meal history is derived from finalized meals** — single source of truth.
* **Regeneration is locked once voting starts** and rate-limited per session.

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

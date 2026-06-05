# FlatMate Meal Planner — UI/UX Design Spec

**Date:** 2026-06-05
**Status:** Approved (design direction)
**Scope:** Frontend UI/UX design language and screen plan. The data model, schema,
and RLS are defined separately in [`FlatMateMealPlanner.md`](../../../FlatMateMealPlanner.md).

---

## 1. Design Language — "Honey Butter" Liquid Glass

A calm, warm, food-appropriate take on iOS-style Liquid Glass. Frosted translucent
surfaces float over soft pastel fields with minimal gradient.

### Material
- **Glass surfaces:** translucent cards using `backdrop-filter: blur(13–16px) saturate(150%)`.
- **Background:** a soft pastel field plus two large, very soft blurred shapes (`blur(40px)`,
  ~50% opacity) for the glass to refract — **not** a strong gradient.
- **Always provide a solid fallback** for `backdrop-filter` (browsers without support get a
  near-opaque tinted surface) so text never becomes unreadable.

### Color — Light mode
| Role | Value |
| --- | --- |
| Background | `#FBF1DC` (butter cream) |
| Soft shapes | `#FBE2A8`, `#F7D9B0` (honey, warm sand) |
| Glass fill | `rgba(255,255,255,0.62)` + top inner highlight `rgba(255,255,255,0.95)` |
| Accent (primary) | `#C98A2E` (honey) |
| Accent (deep / pressed) | `#A6690F` (deep amber) |
| Text (primary) | `#241F17` (near-black) |
| Text (secondary) | `#6A5A38` (brown) |
| Warning / missing | `#A8341B` (dark red) |

### Color — Dark mode
| Role | Value |
| --- | --- |
| Background | `#191309` (warm espresso, never cold black) |
| Soft shapes | `#7A5A1E`, `#5A4418` (low opacity) |
| Glass fill | `rgba(255,240,210,0.08)` + border `rgba(255,225,170,0.18)` |
| Accent | `#E0A94A` (honey, on dark text `#1D1505`) |
| Text (primary) | `#F4E9D4` |
| Text (secondary) | `#BDAC88` |

Modes: **light / dark / system** (user-selectable in Settings; default = system).

### Typography
- **Plus Jakarta Sans** — UI font. Weight 800 for meal names and headings, 600–700 for body.
- **Space Mono** (700) — small uppercase labels: badges, vote counts, kickers. This mono
  detail is the retained "personality" cue from the earlier brutalist exploration.

### Contrast rule (firm)
Accent color is for **fills and buttons**; **dark text** for anything meant to be read.
Never light text on light glass. Vote counts use **solid accent chips with white numerals**,
not tinted text. This rule is non-negotiable and applies app-wide.

### Shape & depth
- Rounding: cards ~22px, rows ~18px, pills 999px, buttons 12–14px.
- Shadows: soft, amber-tinted (`rgba(120,90,40,0.10–0.12)`), plus a subtle inner top highlight.

---

## 2. Navigation & App Shell

### Mobile (primary)
- **Floating glass bottom tab bar**, four destinations:
  1. 🏠 **Dashboard** — today's Lunch & Dinner sessions
  2. 🥕 **Pantry** — ingredients
  3. 🗳️ **Voting** — current session voting
  4. 🕘 **History** — past finalized meals
- **Header:** group name + date (e.g. "🍛 Flat 302 · Thu, Jun 5"). The group name/avatar is
  the entry point to **Settings** (Settings is not a tab — it's infrequent).

### Desktop
- Bottom tab bar becomes a **top navigation bar** (same four items, horizontal); group/settings
  on the right. Content in a centered max-width column.

### Rationale
A tab bar (not a hamburger) keeps all four core screens one tap away — no hidden menu —
supporting the "decide in under 2 minutes" goal. Four items suits thumb reach.

### Outside the shell
Landing, Login, Register, and Create/Join-group have **no tab bar**.

---

## 3. Screens

### Landing *(public)*
Full-bleed pastel field. App name + one-line pitch. "Get started" (amber) and "Log in"
(glass outline). One scroll of benefit cards.

### Login / Register *(public)*
Single centered glass card. **Google** button (primary) + email/password fields. Minimal.

### Onboarding — Create / Join group *(public, post-auth)*
Two glass cards:
- **Create a group:** enter name → system generates an invite code (`FLAT302-ABCD`).
- **Join a group:** paste code or open invite link.

New users land here; returning members with a group skip straight to Dashboard.

### Dashboard 🏠
Header (group + date) → **Lunch / Dinner tabs** → the active session's state:
- **No suggestions yet:** glass empty-state card with **"✨ Generate AI suggestions"** (amber).
- **Suggestions exist:** summary card showing the current **leader** + vote progress
  ("3 votes · 2 to go") and a **Vote** button that routes to the Voting screen.
- **Finalized:** celebratory card — "Tonight: Paneer Butter Masala" — with cook-facing details
  (and the grocery list if ingredients are missing).
- **Desktop:** Lunch & Dinner shown **side-by-side** (two columns) instead of behind tabs.

### Voting 🗳️ — *tap-to-vote poll*
- Meal cards, each with a **solid amber count chip** and **voter avatars**; the user's current
  choice is ringed with a check. One vote per person, **changeable until finalized** (tap a
  different card to move the vote — implemented as an UPSERT).
- **Missing-ingredient flag** under any card needing shopping: `⚠ needs paneer, cream`.
- **"4 of 5 voted"** progress cue.
- **Admin-only Finalize bar** showing the current leader; one tap finalizes the session.
- Tie-break: earliest-suggested meal leads (matches the data spec); admin may finalize any.
- Lunch/Dinner context carries from the tab the user entered through.

### Pantry 🥕
Searchable list of ingredient glass rows: name, quantity + unit, **available toggle**.
Floating amber "**+ Add**" button → glass bottom-sheet form. Tap to edit, swipe/menu to delete.
Unavailable items render dimmed. Any group member can manage (per data spec).

### History 🕘
Reverse-chronological list grouped by date; each entry tagged **Lunch** or **Dinner** with the
finalized meal name. Scannable; supports avoiding repeats and improving AI suggestions.

### Settings *(behind group name)*
Group name; **invite code with copy/share**; member list with roles (admin can manage members);
leave group; **light/dark/system** theme toggle; logout.

---

## 4. Cross-Screen Patterns

- **Toasts** for confirmations (voted, finalized, ingredient added).
- **Glass bottom-sheets** for forms and dialogs (Add/Edit ingredient, confirm finalize).
- **Skeleton loaders** on glass surfaces while data loads.
- **Live updates** on votes and session status via **Supabase Realtime** — counts and the
  leader move without manual refresh, reinforcing the speed goal.
- **Grocery list** (from missing ingredients) appears on the finalized meal card with a
  **Copy / Share on WhatsApp** action — not a separate tab in v1.
- **Empty states** are designed glass cards with a clear primary action, never blank screens.
- **Accessibility:** all interactive targets ≥44px; the contrast rule above keeps text legible
  on glass; respect `prefers-reduced-motion` and `prefers-color-scheme`.

---

## 5. Component Inventory (shadcn / Base UI + custom)

Built on the installed shadcn (Base UI) primitives, themed to Honey Butter:
- **GlassCard** — the core surface (with solid fallback).
- **TabSwitch** — Lunch / Dinner segmented control.
- **MealVoteRow** — meal name, count chip, avatars, selected state, missing-ingredient flag.
- **CountChip**, **Badge/Kicker** (Space Mono), **Avatar / AvatarStack**.
- **BottomTabBar** (mobile) / **TopNav** (desktop).
- **BottomSheet**, **Toast**, **Skeleton**, **EmptyState**.
- **IngredientRow**, **AddIngredientSheet**.
- **FinalizeBar** (admin), **FinalizedMealCard**.

---

## 6. Decisions Locked

| Decision | Choice |
| --- | --- |
| Visual style | Honey Butter pastel Liquid Glass, light + dark |
| Dashboard (two sessions) | Lunch/Dinner **tabs** on mobile; **side-by-side** on desktop |
| Navigation | Bottom tab bar (mobile) / top nav (desktop), 4 items |
| Voting interaction | Tap-to-vote poll with count chips + avatars + missing-ingredient flag |
| Theme modes | Light / dark / system |

## 7. Out of Scope (v1)

Weekly planner, smart inventory auto-decrement, dedicated cook dashboard, automated WhatsApp
send, quantity-aware availability — all deferred (consistent with the data spec's MVP scope).

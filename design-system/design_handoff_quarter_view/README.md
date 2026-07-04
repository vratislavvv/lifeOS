# Handoff: Quarter View (stat version)

## Overview
The **Quarter** view of lifeOS — a personal "operating system" app. It shows how the current quarter is tracking against per-area targets ("vectors"), lets the user open a **Revision** with an AI companion named **Lenna** who reviews the previous quarter, and lets the user browse **Past quarters**. A start-of-quarter **notification** announces that the prior quarter's review is ready.

This is the "stat version": a progress bar + days-left readout + per-vector pace rows, as opposed to a freeform whiteboard.

## About the Design Files
`Quarter View.dc.html` is a **design reference created in HTML** — a prototype showing the intended look and behavior, **not production code to copy directly**. The task is to **recreate these designs in the target codebase's existing environment** (React, Vue, SwiftUI, etc.) using its established components, patterns, and libraries. If no environment exists yet, pick the most appropriate framework and implement there.

The HTML uses CSS custom properties (design tokens) and inline styles. It also references a runtime helper (`support.js`) purely so the prototype opens in a browser — **ignore `support.js` when implementing**; it is not part of the design.

To view: open `Quarter View.dc.html` in a browser. The three views are laid out as separate frames on a canvas.

## Fidelity
**High-fidelity.** Final colors, typography, spacing, and layout. Recreate pixel-accurately using the codebase's own component library. The frames are drawn at a 1.81× scale transform for canvas display — read the **inner** pixel values (font-size, padding, widths in px) as the true 1× spec; ignore the outer `transform:scale(1.81132)` wrapper.

## Screens / Views

### 1. Quarter · stats (main view)
**Purpose:** At-a-glance read on how the quarter is going and how far along it is.

**Layout:** Full app window, 1060×596 (at 1×). Left sidebar 190px (nav: Today / Quarter[active] / Focus / Clock / Stats‹Vectors, Net Worth, Running›; Settings pinned bottom). Main pane fills the rest, as a vertical stack:
1. **Rollover notification strip** (top, full-width) — amber-tinted bar, `background:rgba(184,134,60,0.10)`, `border-bottom:1px solid rgba(184,134,60,0.28)`, padding 10×20. Contains: 20px round avatar "L" (ink bg, bg-color text), message "Q2 is complete — I pulled your review together." + soft continuation, a solid **Review Q2 →** button (ink bg), and a ✕ dismiss.
2. **Header** (padding 14×20, hairline bottom border): left = title "Q3 · 2026" (18px/500) + mono subtitle "operating level 72 · Jul–Sep" (11px, ink-soft). Right = ‹ › prev/next quarter buttons (26px square, surface, hairline border, radius 6), a vertical hairline divider, a **Past quarters ▾** pill (bordered, surface), and a solid **Revision →** button (ink bg).
3. **Body** (padding 20/20/16):
   - **Quarter progress hero:** label "Quarter progress" (12px/500) + right-aligned "55%" (mono, ink) + "· 41 days left" (mono, ink-soft). Below: 8px-tall track, `background:var(--surface-sunk)`, radius 4, with a 55%-wide ink fill and an 11px ring knob (bg fill, 2px ink border) at the 55% point. Under the bar: mono 10px axis labels Jul 1 / Aug / Sep 30 (space-between).
   - **Vectors section:** header row "Vectors" (12px/500) + mono 10px hint "now → target · pace tick = where you should be today".
   - **Six vector pace rows**, each `padding:9px 0` with a `1px hairline` top border (last row also bottom border). Columns per row: [swatch 8px + name, width 112] · [mono "now → target", width 74] · [flex progress bar 6px tall, surface-sunk track, colored fill = progress toward target, plus a 2px vertical **pace tick** marking expected-today position] · [status label, width 60, right-aligned, mono 10px]. Data:
     - Craft — swatch v-craft — `64 → 70` — fill 91%, tick at 88% (ink-soft) — **Ahead** (positive color)
     - Body — v-body — `79 → 82` — fill 96%, tick 95% — **On pace** (positive)
     - Money — v-money — `62 → 75` — fill 83%, tick 90% (attention) — **−7 behind** (attention)
     - Mind — v-mind — `74 → 78` — fill 95%, tick 93% — **On pace** (positive)
     - Social — v-social — `48 → 60` — fill 80%, tick 89% (attention) — **−12 behind** (attention)
     - Rest — v-rest — `43 → 62` — fill 69%, tick 83% (attention) — **new · Jul** (ink-faint, 9px)

     Pace-tick color = ink-soft when on/ahead of pace, attention (amber) when behind.

### 2. Quarter · revision (Lenna reviews last quarter)
**Purpose:** Where the "Revision" button and the rollover notification lead. Lenna presents the just-closed quarter's data and walks the trends she spotted.

**Layout:** Same window & sidebar. Main area split into a **center scorecard** and a **right rail (296px, `background:var(--surface)`, left hairline border)**.
- **Header:** a "← Q3" mono chip (bordered) + "Reviewing · Q2 2026" (18px/500) + mono subtitle "closed Jun 30 · Apr–Jun".
- **Center scorecard** (padding 20):
  - **Operating level · close:** small mono uppercase caption; big number **68** (44px/500 mono, letter-spacing -0.03em); delta "▲ 7 vs Q1" (mono, positive). To the right, a 150×46 upward `<polyline>` trend line (ink-soft stroke) with an ink dot at the end.
  - **"Where each vector landed"** — 2-column grid, 8×22 gap. Each cell: swatch + name (flex) + final value (mono) + 40px right-aligned delta. Values: Craft 62 ▲9, Mind 71 ▲6, Body 77 ▲4, Money 59 ▼2, Social 45 ▼3, Rest 40 —. Up = positive color, down = attention, flat = ink-faint.
  - Footer caption (mono, ink-faint, top hairline): "Lenna is walking this on the right → ask her anything about the quarter."
- **Lenna rail** (right): header row (18px "L" avatar + "Lenna" 12px/500 + mono "Q2 review"). Body = a vertical stack of chat cards (`background:var(--bg)`, hairline border, radius 9, padding ~10×12, 12px/1.5 text), gap 11:
  1. "Q2's in the books — you closed at **68**, up 7 from Q1. Here's the two-minute version."
  2. **Trend card** — caption "trend · craft" (mono uppercase, v-craft) + "▲ 9"; a 244×30 `<polyline>` sparkline (v-craft stroke) with a dashed vertical marker at x=92; text explaining Craft carried the quarter, most of the gain after morning-blocking began (dashed line).
  3. "**Social** slid −3, dip clusters in June — lines up with travel weeks."
  4. "**Money** flattened after May — savings rate held at 24%."
  5. **Action card** (`background:var(--surface-sunk)`, radius 9): "I've carried Craft's momentum onto your Q3 board and flagged Social to protect." + two buttons: solid **Open Q3 board** (ink) and outline **Full report**.
  - Composer at bottom: hairline-topped input placeholder "Ask about Q2…".

  Bold vector names in messages are colored with that vector's token.

### 3. Past quarters (browser + empty state + notification)
Three standalone cards (this frame documents components, not a full window).
- **Past quarters · populated** — 400px card, radius 12, `box-shadow:0 8px 24px rgba(41,39,35,0.10)`. Header "Past quarters" (14px/500) + mono "3 recorded". Rows (padding 12, radius 9; first row highlighted with `background:var(--surface)`): each = [Qn / year, 44px] · [big mono score + delta chip, then one-line summary, ink-soft] · [Review button — solid ink on the most-recent row, outline on older ones]. Data: Q2 2026 · 68 ▲7 · "Craft led · Social slipped"; Q1 2026 · 61 ▲5 · "First full quarter tracked"; Q4 2025 · 56 baseline · "Partial · joined in Nov".
- **Past quarters · empty state** — same card shell. Centered: a 40px dashed-border rounded square holding a mono "—"; "No quarters recorded yet" (14px/500); body copy explaining the first review lands when Q3 closes and offering to set targets with Lenna; a solid **Chat with Lenna** button (ink bg, with a small inverted "L" avatar).
- **Start-of-quarter notification** — the reusable amber strip from view 1, shown standalone at radius 10 with a full border `1px solid rgba(184,134,60,0.30)`: "L" avatar + "Q2 is complete — your review is ready." + soft subline + **Review →** button + ✕. Note copy: appears once at the start of each quarter, separate from the Past-quarters list; dismissing it does not lose the review (still under Past quarters and the Revision button).

## Interactions & Behavior
- **Review Q2 → / Revision →** → open **view 2** (Quarter · revision).
- **Past quarters ▾** → open the Past-quarters list (view 3, populated). Selecting a quarter's **Review** → view 2 loaded with that quarter.
- **‹ / ›** header buttons step to prev/next quarter.
- **✕** on the notification dismisses it for the quarter (persist dismissed state; the review remains reachable via Past quarters + Revision).
- **Empty state**: shown under Past quarters when no quarter has closed yet. **Chat with Lenna** opens the Lenna companion to set targets.
- Progress bar, vector fills, and pace ticks are **data-driven** — see State Management.
- Buttons have the usual hover/active affordances; use the codebase's standard states. No custom animations specified beyond default transitions.

## State Management
Per current quarter:
- `quarterStart`, `quarterEnd` → derive **elapsed %** (progress bar fill + knob position) and **days left**.
- Per vector: `{ id, label, color, current, target, expectedToday }`.
  - fill % = `current / target` (clamped) mapped into the bar; **pace tick** % = `expectedToday / target`.
  - status = compare `current` vs `expectedToday`: ahead / on pace / behind (with the `−N behind` delta); mark brand-new vectors as "new · <month>".
- `operatingLevel` (current + close value) and its per-quarter history for the trend line.
- `notification`: `{ quarterId, dismissed }` — controls the rollover strip.
- `pastQuarters[]`: `{ id, label, year, score, delta, summary }`; empty array → empty state.
- Revision view reads the **previous** quarter's closed snapshot + Lenna's generated review (messages, trend cards). Trend messages reference an event marker (e.g. "started morning-blocking") drawn as the dashed line on the sparkline.

## Design Tokens
Colors (hex / rgba):
- Background `--bg #E7E5DD`; surface `--surface #F1F0EA`; sunk `--surface-sunk #DEDCD3`
- Ink `--ink #292723`; ink-soft `--ink-soft #6A675E`; ink-faint `--ink-faint #9A968B`
- Hairline `rgba(41,39,35,0.12)`; hairline-strong `rgba(41,39,35,0.20)`
- Attention (behind/negative) `--attention #B8863C`; positive `--positive #7E8A6B`
- Notification tint `rgba(184,134,60,0.10)`, border `rgba(184,134,60,0.28–0.30)`
- Vector colors: Craft `#B0853F`, Body `#7E8A6B`, Money `#6B7E8A`, Mind `#7E6B8A`, Social `#8A6B7E`, Rest `#6B8A8A`

Typography:
- Sans: **Instrument Sans** (400, 500) — UI text
- Mono: **Geist Mono** (400, 500) — numbers, values, captions, axis labels
- Sizes seen: 44 (hero number), 18 (view title), 17 (past-quarter score), 14 (card title), 13 (row/body), 12 (nav/body), 11 (subtitle/mono), 10/9 (captions, axis)
- Weights: 400 normal, 500 medium (no bolder). Negative letter-spacing (-0.02 to -0.03em) on large mono numbers only.

Radii: buttons/pills 5–7; cards 9–12; window 2; small chips/swatches 2–3px; avatars 50%.
Spacing: 8-ish base; row padding `9px 0`; card padding `10–12px`; section paddings `14–20px`.
Shadows: window `0 2px 8px rgba(0,0,0,.09)`; floating cards `0 8px 24px rgba(41,39,35,0.10)`.

## Assets
- No raster images. All charts are inline `<svg>` `<polyline>`. The Settings glyph is an inline SVG; other affordances (‹ › ▾ ▼ ✕ ▲ ▼) are text characters — replace with the codebase's icon set.
- Fonts loaded from Google Fonts (Instrument Sans, Geist Mono).
- "L" avatar is a text initial on an ink circle — swap for a real Lenna avatar if one exists.

## Files
- `Quarter View.dc.html` — the three Quarter views (stats, revision, past quarters) on one canvas. **This is the design reference.**
- `support.js` — prototype runtime only; **not part of the design**, do not port.

# DESIGN SYSTEM — Last Mile Delivery Platform

> Dark-first. Data-dense. Motion-led. Built for speed.

---

## Philosophy

Most logistics software looks like a spreadsheet had a breakdown.
This doesn't.

The design language is built around one idea: **movement**.
Every element — color, type, motion, layout — communicates that
something is always in transit. Parcels move. Drivers move. Time moves.

Three principles govern every decision:

```
01  SIGNAL OVER NOISE     Show only what the user needs right now.
02  SPACE IS INTENTION    Empty space is not wasted — it is pace.
03  MOTION IS MEANING     Animation tells the story data can't.
```

---

## Color System

### Palette

```
  OBSIDIAN      #0C0C0F    ████  Primary background
  VOID          #111116    ████  Card / surface
  SHELL         #1A1A22    ████  Elevated surface
  RIM           #2A2A36    ████  Border / divider
  MUTED         #6B6B80    ████  Placeholder, disabled
  FROST         #A8A8BE    ████  Secondary text
  CHALK         #EEEEF5    ████  Primary text

  VOLT          #C8FF57    ████  Primary accent — CTA, active states
  VOLT DIM      #8FB83D    ████  Hover state for volt
  SIGNAL        #FF5C28    ████  Failed / error / destructive
  AMBER         #FFB020    ████  Warning / in-transit / pending
  ICE           #57C8FF    ████  Info / live tracking active
```

### Usage Rules

| Token | Use |
|---|---|
| `OBSIDIAN` | Page background |
| `VOID` | Cards, panels, modals |
| `SHELL` | Dropdowns, popovers, hover rows |
| `RIM` | All borders, dividers, table rules |
| `CHALK` | Headings, labels, values |
| `FROST` | Helper text, timestamps, metadata |
| `MUTED` | Disabled inputs, placeholders |
| `VOLT` | Primary CTA, active nav, progress fill, live pulse |
| `SIGNAL` | Errors, failed delivery badges, destructive actions |
| `AMBER` | Warnings, out-for-delivery badge, pending states |
| `ICE` | Live tracking active indicator, WebSocket connected |

### Status Color Map

```
●  placed          FROST   ── order received
●  confirmed       CHALK   ── seller confirmed
●  packed          AMBER   ── at hub
●  out_for_deliv   AMBER   ── route started
●  in_transit      ICE     ── driver heading to stop (live)
●  delivered       VOLT    ── success
●  failed          SIGNAL  ── failed attempt
●  rescheduled     MUTED   ── waiting for retry
```

---

## Typography

```
Display    Syne             700  — Hero numbers, dashboard KPIs
Heading    Space Grotesk    600  — Section titles, card headers
Body       DM Sans          400  — All readable content
Mono       JetBrains Mono   400  — Order IDs, ETAs, GPS coords, codes
```

### Type Scale

```
  --text-2xs    10px / 14px    mono tags, badge labels
  --text-xs     12px / 16px    metadata, timestamps
  --text-sm     14px / 20px    body, table rows
  --text-base   16px / 24px    primary body
  --text-lg     18px / 28px    card titles
  --text-xl     24px / 32px    section headers
  --text-2xl    32px / 40px    page titles
  --text-3xl    48px / 56px    dashboard KPIs
  --text-hero   72px / 80px    landing numbers (Syne 700)
```

### Rules

- Numbers in dashboards: always `Syne 700`, full-width, no units on a separate line
- Order IDs: always `JetBrains Mono`, `FROST` color, `text-xs`
- Status labels: `DM Sans 500`, uppercase, `letter-spacing: 0.08em`, `text-2xs`
- ETAs: `JetBrains Mono`, `VOLT` when live, `CHALK` otherwise

---

## Spacing & Grid

```
Base unit: 4px

  --space-1     4px
  --space-2     8px
  --space-3     12px
  --space-4     16px
  --space-5     20px
  --space-6     24px
  --space-8     32px
  --space-10    40px
  --space-12    48px
  --space-16    64px
  --space-20    80px
  --space-24    96px
```

### Layout Grid

- **Desktop:** 12-column, 24px gutters, 1440px max-width, 48px outer margin
- **Tablet:** 8-column, 16px gutters
- **Mobile (Agent PWA):** Single column, 16px margin, no grid

### Border Radius

```
  --radius-sm    4px     tags, badges, inputs
  --radius-md    8px     cards, dropdowns
  --radius-lg    16px    modals, panels
  --radius-xl    24px    large cards, map overlays
  --radius-full  9999px  pills, avatars, toggle
```

---

## Elevation & Depth

No box-shadows. Depth is achieved through **background stacking** alone.

```
Layer 0  OBSIDIAN   #0C0C0F   page canvas
Layer 1  VOID       #111116   +0.4% lightness  cards
Layer 2  SHELL      #1A1A22   +0.8% lightness  modals, dropdowns
Layer 3  RIM        #2A2A36   borders only — never a fill
```

If you need to emphasize a card: add a `1px solid RIM` border.
If you need to scream emphasis: use `1px solid VOLT` border.

---

## Iconography

- Library: **Lucide** (2px stroke, never filled)
- Size: 16px in tables/nav, 20px in cards, 24px in empty states
- Color: always inherits from parent text color — never hardcoded
- No icon sits alone — always paired with a label (accessibility)

### Delivery-specific icons

| Concept | Lucide Icon |
|---|---|
| Order | `package` |
| In Transit | `truck` |
| Delivered | `package-check` |
| Failed | `package-x` |
| Agent | `user-round` |
| Route | `map-pin` |
| Live tracking | `radio` (pulsing) |
| Hub | `warehouse` |
| Fare | `indian-rupee` |
| Bulk upload | `upload` |
| Webhook | `webhook` |
| API key | `key-round` |

---

## Motion & Animation

Animation communicates **state change** — not decoration.

```css
/* Base easing — all transitions */
--ease-out:    cubic-bezier(0.0, 0.0, 0.2, 1.0)
--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1.0)   /* for entrances */
--ease-snap:   cubic-bezier(0.4, 0.0, 0.6, 1.0)       /* for exits */

/* Durations */
--dur-instant:  80ms    micro-feedback (button press)
--dur-fast:    150ms    hover, focus states
--dur-base:    250ms    panel open, card appear
--dur-slow:    400ms    page transitions, map pan
--dur-crawl:   600ms    onboarding steps, success state
```

### Key Animations

**Live pulse** — on any `ICE` status indicator when WS is connected
```css
@keyframes live-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%       { opacity: 0.4; transform: scale(0.85); }
}
animation: live-pulse 1.4s ease-in-out infinite;
```

**Driver dot movement** — on the map, driver position interpolates smoothly
```
GPS ping interval: 3s
Interpolation: linear tween over 3s between last two coordinates
Effect: dot glides, never teleports
```

**Status badge transition** — when status changes, badge does not blink:
```
old badge: slide out upward + fade (150ms ease-snap)
new badge: slide in from below + fade in (250ms ease-spring)
```

**Number counter** — dashboard KPIs animate up from 0 on first load
```
duration: 800ms, easing: ease-out, delay stagger: 100ms per card
```

**Progress bar** — route completion fills left-to-right in VOLT
```
fill on load: 600ms ease-out
live updates: 300ms ease-out (each stop completion)
```

---

## Component Library

### Badge

```
Anatomy:   [● status-dot]  [LABEL TEXT]

Variants:
  delivered    VOLT bg at 12% opacity,   VOLT dot,   VOLT text
  in_transit   ICE  bg at 12% opacity,   ICE dot,    ICE text  + pulse
  failed       SIGNAL bg at 12% opacity, SIGNAL dot, SIGNAL text
  pending      AMBER bg at 12% opacity,  AMBER dot,  AMBER text
  muted        RIM bg,                   MUTED dot,  FROST text

Size:     padding: 2px 8px, radius: --radius-full, font: DM Sans 500 text-2xs uppercase
```

### Button

```
Primary:
  bg: VOLT  |  text: OBSIDIAN  |  font: DM Sans 600
  hover: VOLT-DIM  |  active: scale(0.97)  |  radius: --radius-sm

Ghost:
  bg: transparent  |  border: 1px RIM  |  text: CHALK
  hover: SHELL bg  |  radius: --radius-sm

Danger:
  bg: SIGNAL at 12%  |  border: 1px SIGNAL  |  text: SIGNAL
  hover: SIGNAL at 20%

Icon Button:
  32×32px square  |  bg: transparent  |  hover: SHELL
  active icon color: VOLT

Sizes:   sm: h-32, px-12  |  md: h-40, px-16  |  lg: h-48, px-24
```

### Input

```
bg: VOID  |  border: 1px RIM  |  text: CHALK  |  radius: --radius-sm
placeholder: MUTED  |  height: 40px  |  font: DM Sans 400 text-sm

focus:   border: 1px VOLT, no glow/shadow — just the border flips
error:   border: 1px SIGNAL
success: border: 1px VOLT (kept after geocode verify)

Label:   DM Sans 500, text-xs, FROST, uppercase, letter-spacing 0.08em
         sits above input with 6px gap
```

### Card

```
bg: VOID  |  border: 1px RIM  |  radius: --radius-md  |  padding: --space-6

Hover (if interactive):
  border: 1px CHALK at 20%  |  bg: SHELL  |  transition: 150ms

Active / selected:
  border: 1px VOLT  |  bg: VOLT at 6%
```

### Table

```
Header:   bg: OBSIDIAN  |  text: FROST text-xs uppercase 0.08em tracking
          border-bottom: 1px RIM  |  height: 36px

Row:      bg: transparent  |  border-bottom: 1px RIM  |  height: 52px
          hover: SHELL bg, no border change

Cell:     DM Sans text-sm CHALK
          IDs: JetBrains Mono text-xs FROST
          Status: Badge component
          Numbers: Syne 600 tabular-nums

Empty state: centered, Lucide icon 32px MUTED, single line FROST text
```

### Stat Card (Dashboard KPI)

```
┌─────────────────────┐
│ TOTAL ORDERS        │  ← text-xs uppercase, FROST
│                     │
│  124                │  ← Syne 700, text-3xl, CHALK
│                     │
│  ↑ 12 from yesterday│  ← text-xs, VOLT (positive) / SIGNAL (negative)
└─────────────────────┘

bg: VOID  |  border: 1px RIM  |  radius: --radius-md  |  p: --space-6
```

### Timeline (UPS Mode — Order Status)

```
Vertical, left-aligned

  ●──  Placed           ← filled VOLT circle
  │    25 Apr, 11:02 AM ← JetBrains Mono text-xs FROST
  │
  ●──  Confirmed        ← filled VOLT circle
  │    25 Apr, 11:03 AM
  │
  ○──  Out for Delivery ← hollow AMBER circle (current/pending)
  │    Expected: 26 Apr
  │
  ·──  Delivered        ← dotted RIM (future)
       --

Connector line: 1px dashed RIM between steps
Active step label: CHALK text-sm DM Sans 500
Future step label: MUTED text-sm DM Sans 400
```

### Live Map Card (Blinkit/Uber Mode)

```
Full-bleed map (Mapbox dark style — no labels except road names)

Overlay — bottom sheet, slides up from bottom:
┌────────────────────────────────────────────┐
│  ● LIVE   Vikram is on the way             │
│           arrives in  14 min               │  ← JetBrains Mono, VOLT
│                                            │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  68%       │  ← VOLT progress bar
│  2.1 km remaining                          │
│                                            │
│  [●] Vikram D.   ★ 4.9   Bajaj Pulsar      │
└────────────────────────────────────────────┘

Map driver marker:
  VOLT filled circle, 16px, with 32px VOLT ring pulsing at 50% opacity
  Rotates to match heading from GPS data

Route line on map:
  VOLT, 3px, 70% opacity, dashed ahead of driver / solid behind
```

---

## Interface Designs

### Seller Dashboard

```
┌─────────────────────────────────────────────────────────────────────┐
│  ◈ DISPATCH        Orders  Analytics  Settings          Acme ▾     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Good morning, Rahul.                                               │
│  Here's today — 26 Apr                                              │
│                                                                     │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────┐   │
│  │ TOTAL        │ │ DELIVERED    │ │ IN TRANSIT   │ │ FAILED   │   │
│  │              │ │              │ │              │ │          │   │
│  │    124       │ │     48       │ │     67       │ │    9     │   │
│  │              │ │              │ │              │ │          │   │
│  │ ↑ 12 vs yest │ │ ● VOLT       │ │ ● ICE        │ │ ● SIGNAL │   │
│  └──────────────┘ └──────────────┘ └──────────────┘ └──────────┘   │
│                                                                     │
│  ───────────────────────────────────────────────────────────────   │
│                                                                     │
│  Recent Orders                         [ + New Order ] [ ↑ Bulk ]  │
│                                                                     │
│  ORDER ID         CUSTOMER         STATUS           FARE            │
│  ORD-9821         Rahul Sharma     ● Delivered      ₹ 67.00         │
│  ORD-9820         Priya Mehta      ● In Transit     ₹ 52.00         │
│  ORD-9819         Suresh Kumar     ● Failed         ₹ 0.00          │
│  ORD-9818         Anita Desai      ● Out for Del.   ₹ 44.00         │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### New Order Form

```
┌─────────────────────────────────────────────────────────────────────┐
│  ← Back           NEW ORDER                                         │
├───────────────────────────────────┬─────────────────────────────────┤
│                                   │                                 │
│  CUSTOMER                         │  FARE PREVIEW                   │
│                                   │                                 │
│  NAME                             │         ₹ 67                    │
│  [ Rahul Sharma              ]    │                                 │
│                                   │  Base          ₹ 20.00          │
│  PHONE                            │  Distance      ₹ 22.00  4.4km   │
│  [ +91 98765 43210           ]    │  Weight        ₹ 10.00  1.5kg   │
│                                   │  Window prem   ₹ 15.00  < 3h   │
│  EMAIL                            │  ─────────────────────          │
│  [ rahul@example.com         ]    │  Total         ₹ 67.00          │
│                                   │                                 │
│  ───────────────────────────────  │  ─────────────────────────────  │
│                                   │                                 │
│  DELIVERY ADDRESS                 │  DELIVERY WINDOW                │
│                                   │                                 │
│  [ 123 MG Road, Andheri East ]    │  DATE                           │
│  [ Mumbai              ]          │  [ 26 Apr 2026          ]       │
│  [ 400069              ]          │                                 │
│                                   │  ┌──────────┐ ┌──────────┐     │
│  ✓ 4.4 km from hub  ← VOLT        │  │ Morning  │ │Afternoon │     │
│                                   │  │  9–1pm   │ │  1–5pm   │     │
│  ───────────────────────────────  │  └──────────┘ └──────────┘     │
│                                   │  ┌──────────┐                  │
│  PARCEL                           │  │ Evening  │                  │
│                                   │  │  5–9pm   │                  │
│  WEIGHT (KG)   SIZE               │  └──────────┘                  │
│  [ 1.5   ]     ○ S  ● M  ○ L      │                                 │
│                                   │                                 │
│  [ ] Fragile                      │  [ Cancel ]  [ Submit Order → ] │
│                                   │                                 │
└───────────────────────────────────┴─────────────────────────────────┘
```

### Dispatcher Route View

```
┌─────────────────────────────────────────────────────────────────────┐
│  ◈ DISPATCH   Routes   Agents   Orders   Settings                   │
├──────────────────────┬──────────────────────────────────────────────┤
│                      │                                              │
│  TODAY'S ROUTES      │                                              │
│  26 Apr 2026         │            [ DARK MAP — FULL BLEED ]        │
│                      │                                              │
│  ┌──────────────────┐│   Agent dots in VOLT moving in real time    │
│  │ Vikram D.        ││   Route lines in dim VOLT                    │
│  │ 12 stops · 18km  ││                                              │
│  │ ████████░░  67%  ││                                              │
│  │ ● Active  2:14PM ││                                              │
│  └──────────────────┘│                                              │
│                      │                                              │
│  ┌──────────────────┐│                                              │
│  │ Priya K.         ││                                              │
│  │ 8 stops · 11km   ││                                              │
│  │ ████░░░░░░  38%  ││                                              │
│  │ ● Active  1:45PM ││                                              │
│  └──────────────────┘│                                              │
│                      │                                              │
│  [ + Optimize Routes]│                                              │
│                      │                                              │
└──────────────────────┴──────────────────────────────────────────────┘
```

### Agent PWA (Mobile)

```
┌─────────────────────┐   ┌─────────────────────┐   ┌─────────────────────┐
│  MY ROUTE           │   │  STOP 3 OF 12        │   │  DELIVERING TO      │
│  26 Apr · 12 stops  │   │                      │   │  Rahul Sharma       │
│                     │   │  Rahul Sharma         │   │                     │
│  ████████░░  8/12   │   │  123 MG Road          │   │  [ DARK MAP ]       │
│                     │   │  Andheri East         │   │                     │
│  ▸ 3  Rahul Sharma  │   │  Mumbai 400069        │   │  ● LIVE  Tracking   │
│    1.2km  ETA 2:38  │   │                       │   │    active for       │
│                     │   │  1.5kg  Medium        │   │    customer         │
│  4  Priya Mehta     │   │  Window: 2pm – 4pm    │   │                     │
│    2.8km  ETA 3:05  │   │                       │   │                     │
│                     │   │  Fare: ₹ 67.00        │   │                     │
│  5  Suresh Kumar    │   │                       │   │                     │
│    3.1km  ETA 3:38  │   │  [ Open in Maps ↗ ]  │   │                     │
│                     │   │                       │   │  ● 2.1km away       │
│  …                  │   │                       │   │  ⏱ ~14 min          │
│                     │   │                       │   │                     │
│  Today's earnings   │   │                       │   │                     │
│  ₹ 286.00           │   │                       │   │  [ I've Arrived ]   │
│                     │   │  [ Heading to Stop → ]│   │                     │
└─────────────────────┘   └─────────────────────┘   └─────────────────────┘

┌─────────────────────┐   ┌─────────────────────┐
│  AT STOP            │   │  STOP DONE ✓        │
│  Rahul Sharma       │   │                     │
│                     │   │  Delivered           │
│  [ 📷 Take Photo ]  │   │  Rahul Sharma        │
│  ✓ Photo captured   │   │  2:38 PM             │
│                     │   │                     │
│  OTP FROM CUSTOMER  │   │  You earned          │
│  ┌─┐ ┌─┐ ┌─┐ ┌─┐   │   │  ₹ 53.60            │
│  │7│ │3│ │·│ │·│   │   │  this stop           │
│  └─┘ └─┘ └─┘ └─┘   │   │                     │
│                     │   │                     │
│  [ Verify & Done → ]│   │  [ Next Stop →  ]   │
│                     │   │                     │
│  ── or ──           │   └─────────────────────┘
│  [ Mark Failed  ↓ ] │
└─────────────────────┘
```

### Customer Tracking Portal

```
── MODE 1: UPS STYLE ─────────────────────────────────────────────────

┌─────────────────────────────────────────────────────────────────────┐
│                          ◈ DISPATCH                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Your order is on its way.                                          │
│                                                                     │
│  ORD-9821  ·  Acme Corp  ·  26 Apr 2026                            │
│                                                                     │
│  ─────────────────────────────────────────────────────────────────  │
│                                                                     │
│  ●   Order Placed            25 Apr, 11:02 AM                       │
│  │                                                                  │
│  ●   Confirmed               25 Apr, 11:03 AM                       │
│  │                                                                  │
│  ●   Packed at Hub           26 Apr, 8:45 AM                        │
│  │                                                                  │
│  ○   Out for Delivery        Expected 1pm – 5pm today               │
│  │                                                                  │
│  ·   Delivered               —                                      │
│                                                                     │
│  ─────────────────────────────────────────────────────────────────  │
│                                                                     │
│  Delivering to:  123 MG Road, Andheri East, Mumbai 400069           │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

── MODE 2: LIVE TRACKING ─────────────────────────────────────────────

┌─────────────────────────────────────────────────────────────────────┐
│                        [ FULL SCREEN MAP ]                          │
│                        [ DARK MAPBOX     ]                          │
│                                                                     │
│         ◉ ← VOLT pulsing driver dot, moving in real time           │
│                                                                     │
│                                                                     │
│                                                                     │
│                                                                     │
│  ╔═════════════════════════════════════════════════════════════╗    │
│  ║  ● LIVE                                                     ║    │
│  ║                                                             ║    │
│  ║  Vikram is  14 min  away                                    ║    │
│  ║                                                             ║    │
│  ║  ══════════════════════════════════════════  2.1 km left    ║    │
│  ║                                                             ║    │
│  ║  [●] Vikram D.    ★ 4.9    Bajaj Pulsar     +91 ···· 1234  ║    │
│  ╚═════════════════════════════════════════════════════════════╝    │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Responsive Behaviour

| Breakpoint | Layout |
|---|---|
| `< 640px` (mobile) | Single column, bottom-sheet modals, full-screen map |
| `640–1024px` (tablet) | 2-column, sidebar collapses to icon-only |
| `> 1024px` (desktop) | Full layout, split-panel (list + map side by side) |

Agent PWA is **mobile-only** — no responsive overhead, built for 390px width.
Customer Tracking Portal is **mobile-first** — map goes full screen on mobile.
Seller & Admin dashboards are **desktop-first** — data-dense table views.

---

## Dark Map Style (Mapbox)

Use Mapbox `dark-v11` base with these overrides:

```json
{
  "background-color": "#0C0C0F",
  "road-color": "#1A1A22",
  "road-minor-color": "#151518",
  "building-color": "#111116",
  "water-color": "#0A0A12",
  "label-color": "#6B6B80",
  "driver-marker": "#C8FF57",
  "route-line-color": "#C8FF57",
  "route-line-opacity": 0.7,
  "destination-marker": "#FF5C28"
}
```

---

## Micro-interactions

| Trigger | Response |
|---|---|
| Button press | `scale(0.97)` for 80ms, releases with spring |
| Row hover | background slides in from left (`SHELL`), 150ms |
| Status update (realtime) | badge slides up-out, new badge slides up-in, 250ms |
| Order delivered | full-screen VOLT flash at 20% opacity, fades in 600ms |
| Order failed | SIGNAL border appears on card, shakes 2px left-right |
| WS connected | `● ICE` dot pulses; on disconnect, fades to `● MUTED` |
| CSV row error | row background: `SIGNAL at 8%`, left border: 2px SIGNAL |
| OTP digit entered | digit tile fills SHELL, border flips to VOLT |
| OTP verified | tiles flash VOLT, then success screen slides up |
| Fare preview update | number rolls to new value (counter animation, 200ms) |
| New order in list | row slides down from top, VOLT left border for 2s then fades |

---

## Naming Conventions (CSS Variables)

```css
:root {
  /* Colors */
  --color-obsidian:  #0C0C0F;
  --color-void:      #111116;
  --color-shell:     #1A1A22;
  --color-rim:       #2A2A36;
  --color-muted:     #6B6B80;
  --color-frost:     #A8A8BE;
  --color-chalk:     #EEEEF5;
  --color-volt:      #C8FF57;
  --color-volt-dim:  #8FB83D;
  --color-signal:    #FF5C28;
  --color-amber:     #FFB020;
  --color-ice:       #57C8FF;

  /* Typography */
  --font-display:    'Syne', sans-serif;
  --font-heading:    'Space Grotesk', sans-serif;
  --font-body:       'DM Sans', sans-serif;
  --font-mono:       'JetBrains Mono', monospace;

  /* Motion */
  --ease-out:        cubic-bezier(0.0, 0.0, 0.2, 1.0);
  --ease-spring:     cubic-bezier(0.34, 1.56, 0.64, 1.0);
  --ease-snap:       cubic-bezier(0.4, 0.0, 0.6, 1.0);
  --dur-instant:     80ms;
  --dur-fast:        150ms;
  --dur-base:        250ms;
  --dur-slow:        400ms;
  --dur-crawl:       600ms;
}
```

---

## Font Loading (index.html)

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@700&family=Space+Grotesk:wght@600&family=DM+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400&display=swap" rel="stylesheet" />
```

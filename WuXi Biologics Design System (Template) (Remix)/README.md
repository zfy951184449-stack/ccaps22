# WuXi Biologics Design System

A design system for **WuXi Biologics (药明生物)** — a global Contract Research, Development and Manufacturing Organization (CRDMO) for biologics. This system targets enterprise-grade frontends for biomanufacturing operations: GMP production, scheduling, quality, equipment, personnel, and compliance.

## Source Material

No codebase, Figma, or production screenshots were attached. This system is built from a **written brand brief** describing the desired visual language. Key inputs:

- Company positioning: global CRDMO offering end-to-end biologics services from discovery → cell line dev → process dev → clinical → commercial GMP manufacturing.
- Brand keywords: *clean, professional, global, biotech, GMP-ready, scientific, precise, reliable, high-trust, enterprise-grade, light technology, biological manufacturing*.
- Color direction: white + light blue-grey backgrounds; deep blue + tech blue primaries; green/yellow-green for life-science / compliant states; yellow only as a soft warning. No neon, no dark cyber, no heavy industrial.
- Layout direction: generous whitespace, card-based, light data density, ordered/traceable feel.

> ⚠️ Because no production assets were available, this system is **interpretive**. Logos and iconography are placeholders or CDN substitutions. Please share real assets (logo files, Figma, screenshots, or codebase) so we can lock the system to the actual brand.

---

## Index

| File | Purpose |
|---|---|
| `README.md` | This file — overview, content/visual foundations, iconography. |
| `colors_and_type.css` | CSS variables for color tokens, typography scale, spacing, radii, shadows, semantic styles. |
| `SKILL.md` | Agent-skill manifest so this folder works as a portable skill. |
| `fonts/` | Web fonts (currently links Inter from Google Fonts — see Type section). |
| `assets/` | Logos, brand marks, background motifs. |
| `preview/` | Small HTML cards rendered in the Design System tab. |
| `ui_kits/enterprise/` | High-fidelity recreation of an enterprise GMP/CRDMO operations console. |

---

## Content Fundamentals

WuXi Biologics writes for a **global pharma/biotech audience** — regulators, partners, scientific operators. Copy is **factual, restrained, and capability-led**, not marketing-led.

**Voice & tone**
- Third-person, institutional. The system speaks *for the company*, not as a personality. Avoid "we'll help you…" SaaS-speak.
- Precise verbs: *manufacture, develop, validate, release, qualify, transfer*. Not *unlock, supercharge, empower*.
- Numbers and scope are the message: "Capacity 430,000L by 2026", "WuXiBody™ bispecific platform", "EU/US/CN GMP-licensed facilities."
- Bilingual where appropriate. English-first for global UI; Simplified Chinese provided alongside in client-facing surfaces (e.g. `Batch Record · 批记录`).

**Casing**
- Page/section titles: **Title Case** ("Batch Execution", "Quality Events").
- Buttons / actions: **Title Case**, verb-first ("Release Batch", "Approve Deviation"). No sentence-case shouting.
- Labels (form, table headers): **Title Case**, terse ("Lot No.", "Run Stage", "Yield (g/L)").
- Body / descriptions: sentence case, full punctuation.

**Pronouns & address**
- Avoid "you" and "we" in operational copy. Prefer the object: *"Batch BX-2418 is ready for QA review"* not *"Your batch is ready"*.
- In confirmation dialogs, second-person is permitted but neutral: *"Confirm release of batch BX-2418?"*

**Emoji & decoration**
- **No emoji.** This is a GMP-adjacent system; emoji read as unserious.
- Status uses **dot indicators + label** (●  In Spec) or **outlined chips**, never 🟢🟡.
- Unicode icons (✓ ✗ →) acceptable inline only for compact tables.

**Number formatting**
- Always show units: `12,400 L`, `36.2 °C`, `pH 7.10`, `±0.05`.
- Tabular numerals for any column of numbers.
- ISO 8601 dates in dense tables (`2026-04-26 14:32 CST`); long form in headers (`Apr 26, 2026`).

**Examples — good vs. bad**

| ✓ Use | ✗ Avoid |
|---|---|
| "Bioreactor BR-204 — Idle" | "BR-204 is taking a break! 😴" |
| "Deviation DEV-2026-0418 awaiting QA review" | "Heads up — there's a deviation to look at" |
| "Capacity utilization 78%" | "We're crushing it at 78%!" |
| "Release pending: 2 of 12 tests" | "Almost there — just a couple more tests" |

---

## Visual Foundations

### Palette — the three temperatures

The palette has **three temperature zones** that map to three jobs: *structural blue* (chrome, primary actions, data emphasis), *living green* (status, compliance, life-science accent), *neutral blue-grey* (surfaces, dividers, body text).

- **Deep Blue `#0B3D7F`** — primary actions, top nav, key data, charts series 1. The "WuXi blue."
- **Tech Blue `#1F6FEB`** — interactive blue, hover/active states, links.
- **Cyan `#3AA8C1`** — chart series 2, secondary highlights, data viz.
- **Sky Blue `#E6F2FB`** — info backgrounds, selected rows, soft chips.
- **Bio Green `#2E9D6E`** — success, in-spec, released, life-science accent.
- **Lime `#A3CC4F`** — gentler positive accent, "available capacity" in charts.
- **Amber `#E8B53C`** — warnings, near-limit, attention. Never decorative.
- **Coral Red `#D6493A`** — errors, OOS, deviation, stop. Used sparingly.
- **Neutrals** — `#FFFFFF` page, `#F5F8FB` surface, `#E4EAF1` border, `#8898A8` mute, `#3A4A5C` body, `#0F1B2D` ink.

Saturation is held back deliberately. No oklch hot pinks, no neon, no cyber blacks.

### Typography

- **Sans display + body**: **Inter** (Google Fonts). Geometric, neutral, internationally legible.
  Substitution note: SF Pro, Helvetica Now or PingFang would also fit the brief; Inter is used here for free distribution. Please confirm or replace.
- **Mono / data**: **JetBrains Mono** for batch IDs, lot numbers, inline tabular data.
- **CJK**: system fallback to PingFang SC / Source Han Sans (no embedded CJK font shipped — common SaaS pattern in CN enterprise).
- Scale: 12 / 13 / 14 / 16 / 18 / 22 / 28 / 36 / 48. Body 14, dense table 13, hero metric 36–48.
- Weights: 400 body, 500 labels, 600 headings, 700 hero only.
- Line height: 1.5 body, 1.3 headings, 1.2 metrics.
- Letter spacing: -0.01em on display sizes; +0.04em uppercase eyebrows only.

### Spacing & Rhythm

8-pt grid. Tokens: `2 / 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64`. Cards use 16 or 24 internal padding; section gaps 32; page padding 32–48.

### Radii

Restrained. `4` (chips, inputs, buttons), `8` (cards, panels), `12` (modals/sheets), `999` (dot/pill status only). No 16+ "consumer rounded" radii.

### Shadows & Elevation

Two-level system, both very soft:
- **`sh-1`** `0 1px 2px rgba(15, 27, 45, 0.04), 0 0 0 1px rgba(15, 27, 45, 0.04)` — cards, table containers.
- **`sh-2`** `0 8px 24px rgba(15, 27, 45, 0.08), 0 0 0 1px rgba(15, 27, 45, 0.06)` — popovers, modals.

No inset shadows. No glow. No neumorphism.

### Borders & Dividers

Borders carry a lot of weight in this system because shadows are so soft. Always 1px, color `#E4EAF1` (default), `#1F6FEB` (focus/selected), `#2E9D6E` (in-spec accent), `#E8B53C` (warning), `#D6493A` (error).

### Backgrounds & Motifs

The page is white. Subtle decorative motifs may sit at low opacity (≤8%):
- **Hex-grid lattice** (molecular-cell echo) — top-right of dashboards, full-bleed in hero panels.
- **DNA helix line** — single thin stroke, flowing diagonally across hero/login.
- **Globe meridian lines** — global service / sites views.
- **Soft sky gradient** — `#E6F2FB → #FFFFFF` top-down on hero blocks only.

These are **never** front-and-center. Information always wins.

### Imagery

- Cool-toned. White / blue / silver photography of bioreactors, cleanrooms, scientists in PPE. Wide framing, lots of negative space, never tight macro.
- No grain, no warm filter, no "biotech stock photo with green DNA glow."
- World maps for global facility presence — flat, blue, dotted nodes.

### Animation & Interaction

- **Easing**: `cubic-bezier(0.2, 0, 0, 1)` — quick out, calm in.
- **Durations**: 120ms (button feedback), 180ms (hover/state), 240ms (panel/modal), 320ms (page nav). Nothing slower.
- **Hover**: 4% darken on solid fills; bg shift to `#F5F8FB` on rows/cards; underline reveal on links.
- **Press**: 96% scale on icon buttons only; otherwise just a 1-shade darker fill, no shrink.
- **Focus**: 2px outer ring `#1F6FEB` at 40% opacity + crisp 1px inner border. Always visible, always blue.
- **Page transitions**: 8px upward fade-in, 240ms. No bounces, no parallax, no scroll-jacking.

### Transparency & Blur

Used very sparingly. `backdrop-filter: blur(12px)` on sticky table headers over scrolling content, and on top-nav when scrolled. **Not** used for cards, drawers, or sheets — opaque surfaces only, for legibility and audit trails.

### Cards

White fill `#FFFFFF`. 1px border `#E4EAF1`. Shadow `sh-1`. Radius `8`. Padding 16 or 24. Header zone uses a 13/500 uppercase eyebrow + 18/600 title.

### Buttons

- **Primary**: solid `#0B3D7F` → text white. Hover `#0A3470`, active `#082A5C`. Height 36 default, 32 compact, 44 hero.
- **Secondary**: white fill, 1px `#0B3D7F` border, text `#0B3D7F`. Hover bg `#E6F2FB`.
- **Tertiary / Ghost**: text-only `#1F6FEB`, hover bg `#E6F2FB`.
- **Danger**: solid `#D6493A`. Used only for destructive actions (Reject, Discard, Stop Run).
- **Disabled**: bg `#F5F8FB`, text `#8898A8`, no border change.

### Status / Badges

Soft-tinted, never solid bricks of color.
- Success: bg `#E6F4ED`, text `#1F7A53`, dot `#2E9D6E`.
- Info: bg `#E6F2FB`, text `#0B3D7F`, dot `#1F6FEB`.
- Warn: bg `#FBF1D9`, text `#8A6A1F`, dot `#E8B53C`.
- Error: bg `#FBE6E3`, text `#A2342A`, dot `#D6493A`.
- Neutral: bg `#F0F3F7`, text `#5A6B7E`, dot `#8898A8`.

### Tables

The dominant component. Generous row height (44px standard, 52 comfortable), 1px row dividers in `#EEF2F7`, sticky header with light-blue tint `#F5F8FB`. Numeric columns right-aligned, tabular-nums. Status uses the chip system above.

### Layout rules

- Top nav: 56px, white, 1px bottom border. Logo left, primary nav center-left, environment + user right.
- Side nav: 240px expanded, 64px collapsed. Light-grey selected state with 3px left blue accent.
- Page padding: 32 horizontal, 24 top.
- Max content width: 1440 (1280 for forms).
- Grid: 12-col, 24-gutter.

---

## Iconography

**System used**: [Lucide](https://lucide.dev/) via CDN — line-based, 1.5px stroke, 24×24 default, geometric, internationally neutral. This matches the brief: *linear, unified, no cartoon, no 3D, no decoration*.

> ⚠️ Substitution flag: WuXi Biologics likely has a proprietary line-icon set in production. Lucide is used as the closest-match stand-in. Please share the production icon set so we can swap it in.

**Sizes**: 14, 16, 20, 24. 16 in dense tables, 20 in nav, 24 in hero metrics.
**Color**: `currentColor` always — inherits from text. Default mute `#5A6B7E`; active blue `#0B3D7F`.
**Stroke**: Lucide default 2px on small, 1.5px on 24+ via the `stroke-width` attribute.
**No emoji. No unicode glyphs as icons** (except ✓/× inline in tables). **No PNG icons.**

**Domain icon mapping** (suggested):
- Bioreactor → `flask-conical`
- Batch / lot → `package`
- Deviation → `alert-triangle`
- QA release → `shield-check`
- Schedule → `calendar`
- Facility / site → `building-2`
- User / operator → `user`
- Audit log → `file-text`

Logos and brand marks live in `assets/`. The current logo is a **placeholder wordmark + hex-mark** built in SVG. Please send the official logo files (SVG + PNG, light + dark variants) for replacement.

---

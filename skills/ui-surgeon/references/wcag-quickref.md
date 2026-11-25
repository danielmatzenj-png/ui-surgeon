# WCAG 2.2 & APCA Quick Reference

## Contrast Thresholds (WCAG 2.1 SC 1.4.3 & APCA)
- **Normal text** (`< 24px` regular or `< 18.66px` bold): **>= 4.5:1** (AA), **>= 7.0:1** (AAA).
- **Large text** (`>= 24px` regular or `>= 18.66px` bold `>= 700`): **>= 3.0:1** (AA), **>= 4.5:1** (AAA).
- **APCA Perceptual Lc (WCAG 3.0 draft)**:
  - Body text (`14–16px`): `|Lc| >= 75` preferred, `>= 60` minimum.
  - Large headings (`>= 24px` bold): `|Lc| >= 45` minimum.
  - Notice polarity: light text on dark backgrounds (negative `Lc`) requires slightly higher luminance separation than dark text on light backgrounds.

## Geometry & Reflow (WCAG 2.1/2.2)
- **SC 1.4.10 Reflow (AA):** Zero horizontal scrolling at `320px–375px` viewport width.
- **SC 2.5.8 Target Size Minimum (WCAG 2.2 AA):** At least `24x24px` CSS pixels for interactive controls (`44x44px` recommended on mobile touch screens per SC 2.5.5 / Apple HIG / Material).
- **SC 2.4.11 Focus Not Obscured (WCAG 2.2 AA):** Keyboard-focused elements must remain visible and not hidden behind sticky headers, cookie banners, or floating widgets.
- **SC 2.4.7 Focus Visible (AA):** Every keyboard-focusable control must display an unmistakable visual focus state.

## Semantics & Media
- **SC 1.1.1 Non-text Content (A):** Every `<img>` requires `alt` (`alt=""` only if decorative).
- **SC 1.3.1 Info & Relationships (A):** Include `<main>`, sequential headings (`h1 -> h2 -> h3`), unique `id`s, and explicit `<label>` associations.
- **SC 3.1.1 Language of Page (A):** `<html lang="...">` must be set.

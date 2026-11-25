# Surgical Fix Patterns by Rule ID

Use these root-cause fixes instead of brittle CSS hacks.

| Rule ID | Root Cause | Clean Surgical Fix | Avoid |
| --- | --- | --- | --- |
| `horizontal-overflow` | Fixed `width`, `white-space: nowrap`, wide media, or grid/flex items missing `min-width: 0` | Add `max-width: 100%`, `box-sizing: border-box`, `min-width: 0` on flex/grid children, `flex-wrap: wrap`, or `overflow-wrap: anywhere` | Slapping `overflow-x: hidden` on `body` (hides cut-off content) |
| `hit-test-occlusion` | Sticky/fixed header, badge, or overlay intercepts clicks on interactive control | Increase top padding/offset below sticky header, fix z-index stacking context, or set `pointer-events: none` on decorative overlays | Raising random elements to `z-index: 99999` |
| `element-overlap` | Negative margins, `position: absolute` without reserved space, or fixed height containers | Replace absolute hacks with CSS Grid/Flexbox + `gap`; use `min-height` instead of fixed `height` | Hiding one element on mobile |
| `text-clipping` | Fixed `height`/`width` combined with `overflow: hidden` | Switch `height` to `min-height`; allow line wrapping (`white-space: normal; overflow-wrap: break-word`) | Shrinking font size below `12px` |
| `touch-target-size` | Small icon buttons or tightly packed links (`< 24x24px` AA or `< 44x44px` mobile) | Add padding or `min-width: 44px; min-height: 44px;` (or expand hit area via `::after` pseudo-element) | Increasing icon artwork size visually when only padding is needed |
| `wcag-contrast` | Low luminance difference between foreground and composited/pixel background | Apply report's hue-preserving `suggestedHex`, or add a subtle translucent scrim (`rgba(0,0,0,0.55)`) behind text on hero images/gradients | Making all text pure black `#000` regardless of brand palette |
| `missing-accessible-name` | Icon-only `<button>` or `<a>` without text | Add descriptive `aria-label="..."` or visually hidden `.sr-only` span | Putting `title` alone (unreliable on touch/AT) |
| `missing-form-label` | `<input>` relies solely on `placeholder` | Bind `<label for="id">` or add `aria-label` | Leaving placeholder as only cue |
| `clickable-non-interactive` | `<div onclick>` or `<span style="cursor:pointer">` | Replace with native `<button type="button">` or `<a href>` | Leaving `<div>` without keyboard `Enter`/`Space` handling |
| `focus-visibility` | `outline: none` reset without replacement, or sticky header covering focused anchor | Define `:focus-visible { outline: 2px solid <accent>; outline-offset: 2px; }` and `html { scroll-padding-top: <header-h>; }` | Removing focus styles globally |
| `distorted-image` | Explicit mismatched `width` & `height` without `object-fit` | Add `object-fit: cover` or `height: auto` | Re-encoding image unnecessarily |
| `layout-shift` | Images/ads/banners injected without reserved dimensions | Add explicit `width`/`height` HTML attributes or CSS `aspect-ratio` | Delaying entire page paint |

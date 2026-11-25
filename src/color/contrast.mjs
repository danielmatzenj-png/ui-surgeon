/**
 * Color math, alpha compositing, WCAG 2.1 contrast, APCA (WCAG 3.0) Lc,
 * and deterministic accessible color suggestion solver.
 */

export function parseColor(input) {
  if (!input || typeof input !== 'string') return null;
  const s = input.trim().toLowerCase();
  if (s === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };

  const rgbMatch = s.match(
    /^rgba?\(\s*([0-9.]+)\s*[,\s]\s*([0-9.]+)\s*[,\s]\s*([0-9.]+)(?:\s*[,/]\s*([0-9.]+%?))?\s*\)$/
  );
  if (rgbMatch) {
    let a = 1;
    if (rgbMatch[4] !== undefined) {
      a = rgbMatch[4].endsWith('%')
        ? parseFloat(rgbMatch[4]) / 100
        : parseFloat(rgbMatch[4]);
    }
    return {
      r: clampByte(parseFloat(rgbMatch[1])),
      g: clampByte(parseFloat(rgbMatch[2])),
      b: clampByte(parseFloat(rgbMatch[3])),
      a: Math.max(0, Math.min(1, Number.isFinite(a) ? a : 1)),
    };
  }

  const hexMatch = s.match(/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/);
  if (hexMatch) {
    const h = hexMatch[1];
    if (h.length === 3 || h.length === 4) {
      const r = parseInt(h[0] + h[0], 16);
      const g = parseInt(h[1] + h[1], 16);
      const b = parseInt(h[2] + h[2], 16);
      const a = h.length === 4 ? parseInt(h[3] + h[3], 16) / 255 : 1;
      return { r, g, b, a };
    }
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
    return { r, g, b, a };
  }

  return null;
}

function clampByte(n) {
  return Math.max(0, Math.min(255, Math.round(Number.isFinite(n) ? n : 0)));
}

export function rgbToHex({ r, g, b }) {
  const toHex = (v) => clampByte(v).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Porter-Duff source-over alpha compositing of `fg` over `bg`.
 */
export function compositeOver(fg, bg) {
  const aF = fg.a ?? 1;
  const aB = bg.a ?? 1;
  const outA = aF + aB * (1 - aF);
  if (outA <= 0) return { r: 255, g: 255, b: 255, a: 1 };
  return {
    r: clampByte((fg.r * aF + bg.r * aB * (1 - aF)) / outA),
    g: clampByte((fg.g * aF + bg.g * aB * (1 - aF)) / outA),
    b: clampByte((fg.b * aF + bg.b * aB * (1 - aF)) / outA),
    a: outA,
  };
}

/**
 * Composites a stack of backgrounds ordered from bottom (root/canvas) to top (element).
 */
export function compositeStack(layers, canvas = { r: 255, g: 255, b: 255, a: 1 }) {
  let acc = { ...canvas, a: 1 };
  for (const layer of layers) {
    if (!layer || layer.a <= 0) continue;
    acc = compositeOver(layer, acc);
  }
  return acc;
}

/**
 * WCAG 2.1 relative luminance (sRGB).
 */
export function relativeLuminance({ r, g, b }) {
  const lin = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

/**
 * WCAG 2.1 contrast ratio in range [1, 21].
 */
export function wcagContrastRatio(fg, bg) {
  const effFg = fg.a !== undefined && fg.a < 1 ? compositeOver(fg, bg) : fg;
  const l1 = relativeLuminance(effFg);
  const l2 = relativeLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * APCA 0.0.98G-4g (WCAG 3.0 draft perceptual lightness contrast Lc).
 * Positive Lc = dark text on light bg; negative Lc = light text on dark bg.
 * Returns signed Lc in approximately [-108, +106].
 */
export function apcaContrastLc(fg, bg) {
  const effFg = fg.a !== undefined && fg.a < 1 ? compositeOver(fg, bg) : fg;

  const yFromRgb = ({ r, g, b }) => {
    const y =
      0.2126729 * Math.pow(r / 255, 2.4) +
      0.7151522 * Math.pow(g / 255, 2.4) +
      0.072175 * Math.pow(b / 255, 2.4);
    return y < 0.022 ? y + Math.pow(0.022 - y, 1.414) : y;
  };

  const txtY = yFromRgb(effFg);
  const bgY = yFromRgb(bg);

  if (Math.abs(bgY - txtY) < 0.0005) return 0;

  let sapc = 0;
  let output = 0;
  if (bgY > txtY) {
    // Dark text on light background (BoW)
    sapc = (Math.pow(bgY, 0.56) - Math.pow(txtY, 0.57)) * 1.14;
    output = sapc < 0.1 ? 0 : (sapc - 0.027) * 100;
  } else {
    // Light text on dark background (WoB)
    sapc = (Math.pow(bgY, 0.65) - Math.pow(txtY, 0.62)) * 1.14;
    output = sapc > -0.1 ? 0 : (sapc + 0.027) * 100;
  }
  return Math.round(output * 10) / 10;
}

export function isLargeText(fontSizePx, fontWeight) {
  const weight = parseInt(String(fontWeight), 10) || 400;
  return fontSizePx >= 24 || (fontSizePx >= 18.66 && weight >= 700);
}

function rgbToHsl({ r, g, b }) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn:
        h = (gn - bn) / d + (gn < bn ? 6 : 0);
        break;
      case gn:
        h = (bn - rn) / d + 2;
        break;
      case bn:
        h = (rn - gn) / d + 4;
        break;
    }
    h /= 6;
  }
  return { h, s, l };
}

function hslToRgb({ h, s, l }) {
  if (s === 0) {
    const v = clampByte(l * 255);
    return { r: v, g: v, b: v, a: 1 };
  }
  const hue2rgb = (p, q, t) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: clampByte(hue2rgb(p, q, h + 1 / 3) * 255),
    g: clampByte(hue2rgb(p, q, h) * 255),
    b: clampByte(hue2rgb(p, q, h - 1 / 3) * 255),
    a: 1,
  };
}

/**
 * Finds the closest accessible foreground hex color preserving hue and saturation.
 */
export function suggestAccessibleColor(fg, bg, targetRatio = 4.5) {
  const { h, s, l } = rgbToHsl(fg);
  const bgLum = relativeLuminance(bg);

  const searchDirection = (goLighter) => {
    let lo = goLighter ? l : 0;
    let hi = goLighter ? 1 : l;
    let best = null;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      const candidate = hslToRgb({ h, s, l: mid });
      const ratio = wcagContrastRatio(candidate, bg);
      if (ratio >= targetRatio) {
        best = { color: candidate, ratio, dist: Math.abs(mid - l) };
        if (goLighter) hi = mid;
        else lo = mid;
      } else {
        if (goLighter) lo = mid;
        else hi = mid;
      }
    }
    return best;
  };

  const lighter = searchDirection(true);
  const darker = searchDirection(false);

  if (lighter && darker) {
    const pick = lighter.dist <= darker.dist ? lighter : darker;
    return { hex: rgbToHex(pick.color), ratio: Math.round(pick.ratio * 100) / 100 };
  }
  const pick = lighter || darker;
  if (pick) {
    return { hex: rgbToHex(pick.color), ratio: Math.round(pick.ratio * 100) / 100 };
  }

  // Fallback to pure white or pure black
  const fallback = bgLum > 0.179 ? { r: 0, g: 0, b: 0, a: 1 } : { r: 255, g: 255, b: 255, a: 1 };
  return {
    hex: rgbToHex(fallback),
    ratio: Math.round(wcagContrastRatio(fallback, bg) * 100) / 100,
  };
}

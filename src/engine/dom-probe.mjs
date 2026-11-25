/**
 * Browser-side DOM geometry, occlusion, typography, accessibility, and color-stack probe.
 * Serialized and evaluated inside Chrome via CDP Runtime.evaluate.
 */

export const DOM_PROBE_EXPRESSION = `(() => {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const docEl = document.documentElement;
  const body = document.body;

  function cssPath(el) {
    if (!el || el.nodeType !== 1) return '';
    if (el.id) return '#' + CSS.escape(el.id);
    const parts = [];
    let cur = el;
    while (cur && cur.nodeType === 1 && parts.length < 4) {
      let seg = cur.tagName.toLowerCase();
      if (cur.id) {
        parts.unshift('#' + CSS.escape(cur.id));
        break;
      }
      const cls = typeof cur.className === 'string'
        ? cur.className.trim().split(/\\s+/).filter(Boolean).slice(0, 2)
        : [];
      if (cls.length) seg += '.' + cls.map((c) => CSS.escape(c)).join('.');
      const parent = cur.parentElement;
      if (parent) {
        const sameTag = Array.from(parent.children).filter((c) => c.tagName === cur.tagName);
        if (sameTag.length > 1) {
          seg += ':nth-of-type(' + (sameTag.indexOf(cur) + 1) + ')';
        }
      }
      parts.unshift(seg);
      cur = parent;
    }
    return parts.join(' > ');
  }

  function isVisible(el, style) {
    if (!style) style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') {
      return false;
    }
    if (parseFloat(style.opacity) === 0) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0.5 || rect.height <= 0.5) return false;
    return true;
  }

  function hasDirectText(el) {
    for (const node of el.childNodes) {
      if (node.nodeType === 3 && node.textContent.trim().length > 0) return true;
    }
    return false;
  }

  function shortText(el, max = 60) {
    return (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, max);
  }

  function getAccessibleName(el) {
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel && ariaLabel.trim()) return ariaLabel.trim();
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const txt = labelledBy
        .split(/\\s+/)
        .map((id) => document.getElementById(id)?.textContent || '')
        .join(' ')
        .trim();
      if (txt) return txt;
    }
    const tag = el.tagName.toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea') {
      if (el.id) {
        const lbl = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
        if (lbl && lbl.textContent.trim()) return lbl.textContent.trim();
      }
      const parentLabel = el.closest('label');
      if (parentLabel && parentLabel.textContent.trim()) return parentLabel.textContent.trim();
      if (el.getAttribute('title')?.trim()) return el.getAttribute('title').trim();
      if (tag === 'input' && (el.type === 'submit' || el.type === 'button' || el.type === 'reset') && el.value?.trim()) {
        return el.value.trim();
      }
      return '';
    }
    const imgAlt = el.querySelector('img[alt]')?.getAttribute('alt')?.trim();
    const svgTitle = el.querySelector('svg title')?.textContent?.trim();
    const text = (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim();
    return text || imgAlt || svgTitle || el.getAttribute('title')?.trim() || '';
  }

  function getBgStack(el) {
    const layers = [];
    let hasComplexBg = false;
    let cur = el;
    while (cur && cur.nodeType === 1) {
      const st = getComputedStyle(cur);
      const opacity = parseFloat(st.opacity);
      const effOpacity = Number.isFinite(opacity) ? opacity : 1;
      const bgImg = st.backgroundImage;
      const hasBgImg = Boolean(bgImg && bgImg !== 'none');
      const hasBackdrop = Boolean(st.backdropFilter && st.backdropFilter !== 'none');
      if (hasBgImg || hasBackdrop) hasComplexBg = true;
      if (st.backgroundColor && st.backgroundColor !== 'rgba(0, 0, 0, 0)' && st.backgroundColor !== 'transparent') {
        layers.unshift({ color: st.backgroundColor, opacity: effOpacity });
        // Stop ascending once an opaque solid layer without image/backdrop-filter fully occludes ancestors
        const isRgbSolid = st.backgroundColor.startsWith('rgb(') || /rgba\([^)]*,\s*1\s*\)/.test(st.backgroundColor);
        if (isRgbSolid && effOpacity >= 0.99 && !hasBgImg && !hasBackdrop) {
          break;
        }
      }
      cur = cur.parentElement;
    }
    return { layers, hasComplexBg };
  }

  function isInteractive(el, style) {
    const tag = el.tagName.toLowerCase();
    if (['a', 'button', 'input', 'select', 'textarea', 'summary'].includes(tag)) {
      if (tag === 'a' && !el.hasAttribute('href')) return false;
      if (el.disabled) return false;
      return true;
    }
    const role = el.getAttribute('role');
    if (['button', 'link', 'tab', 'menuitem', 'checkbox', 'radio', 'switch'].includes(role || '')) {
      return true;
    }
    if (el.hasAttribute('tabindex') && parseInt(el.getAttribute('tabindex'), 10) >= 0) return true;
    return false;
  }

  const allEls = Array.from(document.querySelectorAll('*')).filter(
    (el) => !['HTML', 'HEAD', 'SCRIPT', 'STYLE', 'META', 'LINK', 'TITLE', 'NOSCRIPT', 'BR'].includes(el.tagName)
  );

  // Track duplicate IDs across entire DOM
  const idCounts = new Map();
  for (const el of allEls) {
    if (el.id) idCounts.set(el.id, (idCounts.get(el.id) || 0) + 1);
  }
  const duplicateIds = Array.from(idCounts.entries())
    .filter(([, count]) => count > 1)
    .map(([id, count]) => ({ id, count }));

  const elements = [];
  const headings = [];
  const images = [];
  const forms = [];
  const clickableNonInteractive = [];

  for (let i = 0; i < allEls.length; i++) {
    const el = allEls[i];
    const style = getComputedStyle(el);
    const visible = isVisible(el, style);
    const tag = el.tagName.toLowerCase();
    const selector = cssPath(el);

    if (tag === 'img' && style.display !== 'none' && style.visibility !== 'hidden') {
      const r = el.getBoundingClientRect();
      images.push({
        selector,
        src: el.getAttribute('src') || '',
        alt: el.getAttribute('alt'),
        ariaHidden: el.getAttribute('aria-hidden') === 'true',
        role: el.getAttribute('role') || '',
        complete: el.complete,
        naturalWidth: el.naturalWidth,
        naturalHeight: el.naturalHeight,
        renderedWidth: Math.round(r.width),
        renderedHeight: Math.round(r.height),
        objectFit: style.objectFit,
        rect: { x: r.left, y: r.top, width: r.width, height: r.height },
      });
    }

    if (!visible) continue;

    const r = el.getBoundingClientRect();
    const rect = {
      x: Math.round(r.left * 10) / 10,
      y: Math.round(r.top * 10) / 10,
      right: Math.round(r.right * 10) / 10,
      bottom: Math.round(r.bottom * 10) / 10,
      width: Math.round(r.width * 10) / 10,
      height: Math.round(r.height * 10) / 10,
    };

    if (/^h[1-6]$/.test(tag)) {
      headings.push({
        selector,
        level: parseInt(tag[1], 10),
        text: shortText(el, 80),
        rect,
      });
    }

    if (['input', 'select', 'textarea'].includes(tag) && el.type !== 'hidden') {
      forms.push({
        selector,
        tag,
        type: el.type || tag,
        accessibleName: getAccessibleName(el),
        placeholder: el.getAttribute('placeholder') || '',
        rect,
      });
    }

    const interactive = isInteractive(el, style);
    if (
      !interactive &&
      !['label', 'html', 'body'].includes(tag) &&
      style.cursor === 'pointer' &&
      !el.closest('a, button, label, [role="button"], [role="link"]')
    ) {
      clickableNonInteractive.push({
        selector,
        tag,
        text: shortText(el, 50),
        hasOnClick: typeof el.onclick === 'function' || el.hasAttribute('onclick'),
        rect,
      });
    }

    const directText = hasDirectText(el);
    const fontSize = parseFloat(style.fontSize) || 16;
    const lineHeightRaw = parseFloat(style.lineHeight);
    const lineHeight = Number.isFinite(lineHeightRaw) ? lineHeightRaw : fontSize * 1.2;

    // Hit-test occlusion for interactive elements currently inside viewport
    let occludedBy = null;
    if (interactive && rect.width >= 4 && rect.height >= 4) {
      const cx = rect.x + rect.width / 2;
      const cy = rect.y + rect.height / 2;
      if (cx >= 0 && cx <= vw && cy >= 0 && cy <= vh) {
        const topEl = document.elementFromPoint(cx, cy);
        if (topEl && topEl !== el && !el.contains(topEl) && !topEl.contains(el)) {
          const topStyle = getComputedStyle(topEl);
          if (topStyle.pointerEvents !== 'none') {
            occludedBy = {
              selector: cssPath(topEl),
              tag: topEl.tagName.toLowerCase(),
              position: topStyle.position,
              zIndex: topStyle.zIndex,
            };
          }
        }
      }
    }

    const bgInfo = directText ? getBgStack(el) : null;

    // Check clipping inside hidden/clip overflow containers
    const overflowX = style.overflowX;
    const overflowY = style.overflowY;
    const clipsX = (overflowX === 'hidden' || overflowX === 'clip') && el.scrollWidth > el.clientWidth + 3;
    const clipsY = (overflowY === 'hidden' || overflowY === 'clip') && el.scrollHeight > el.clientHeight + 3;

    // Ancestor chain indices to avoid parent-child false overlaps + detect fixed/sticky overlay layers
    const ancestorSelectors = [];
    let inFixedLayer = style.position === 'fixed' || style.position === 'sticky';
    let p = el.parentElement;
    let depth = 0;
    while (p && depth < 10) {
      ancestorSelectors.push(cssPath(p));
      if (!inFixedLayer) {
        const ps = getComputedStyle(p).position;
        if (ps === 'fixed' || ps === 'sticky') inFixedLayer = true;
      }
      p = p.parentElement;
      depth++;
    }

    elements.push({
      index: i,
      selector,
      tag,
      role: el.getAttribute('role') || '',
      text: shortText(el, 80),
      directText,
      interactive,
      accessibleName: interactive ? getAccessibleName(el) : '',
      rect,
      pageRect: {
        x: Math.round((r.left + window.scrollX) * 10) / 10,
        y: Math.round((r.top + window.scrollY) * 10) / 10,
        right: Math.round((r.right + window.scrollX) * 10) / 10,
        bottom: Math.round((r.bottom + window.scrollY) * 10) / 10,
        width: rect.width,
        height: rect.height,
      },
      position: style.position,
      inFixedLayer,
      zIndex: style.zIndex,
      pointerEvents: style.pointerEvents,
      color: style.color,
      opacity: parseFloat(style.opacity) || 1,
      fontSize,
      fontWeight: style.fontWeight,
      fontFamily: style.fontFamily,
      lineHeight,
      textOverflow: style.textOverflow,
      whiteSpace: style.whiteSpace,
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      clipsX,
      clipsY,
      bgLayers: bgInfo?.layers || [],
      hasComplexBg: bgInfo?.hasComplexBg || false,
      occludedBy,
      parentSelector: el.parentElement ? cssPath(el.parentElement) : '',
      ancestorSelectors,
    });
  }

  // Landmarks
  const landmarks = {
    main: document.querySelectorAll('main, [role="main"]').length,
    nav: document.querySelectorAll('nav, [role="navigation"]').length,
    header: document.querySelectorAll('header, [role="banner"]').length,
    lang: docEl.getAttribute('lang') || '',
    title: (document.title || '').trim(),
  };

  // Web fonts status
  const fonts = [];
  if (document.fonts) {
    for (const f of document.fonts) {
      fonts.push({ family: f.family, status: f.status, weight: f.weight });
    }
  }

  const rootBg = getComputedStyle(body || docEl).backgroundColor || 'rgb(255, 255, 255)';
  const docScrollWidth = Math.max(docEl.scrollWidth, body ? body.scrollWidth : 0);
  const docScrollHeight = Math.max(docEl.scrollHeight, body ? body.scrollHeight : 0);

  return {
    url: location.href,
    viewport: { width: vw, height: vh, dpr: window.devicePixelRatio || 1 },
    document: {
      scrollWidth: docScrollWidth,
      clientWidth: docEl.clientWidth,
      scrollHeight: docScrollHeight,
      overflowX: Math.max(0, docScrollWidth - docEl.clientWidth),
      rootBg,
    },
    landmarks,
    duplicateIds,
    headings,
    images,
    forms,
    clickableNonInteractive,
    fonts,
    elements,
  };
})()`;

/**
 * Generates an inline script that draws non-destructive visual bounding boxes
 * and issue labels directly over the page for annotated screenshot capture.
 */
export function buildAnnotationScript(findings) {
  const boxes = findings
    .filter((f) => f.rect && f.rect.width > 0 && f.rect.height > 0)
    .slice(0, 40)
    .map((f, idx) => ({
      id: idx + 1,
      ruleId: f.ruleId,
      severity: f.severity,
      rect: f.rect,
    }));

  return `(() => {
    const existing = document.getElementById('__ui_surgeon_overlay__');
    if (existing) existing.remove();
    const root = document.createElement('div');
    root.id = '__ui_surgeon_overlay__';
    root.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;';
    const colors = {
      critical: '#ef4444',
      high: '#f97316',
      medium: '#eab308',
      low: '#3b82f6'
    };
    const items = ${JSON.stringify(boxes)};
    for (const item of items) {
      const c = colors[item.severity] || '#ef4444';
      const box = document.createElement('div');
      box.style.cssText = [
        'position:fixed',
        'left:' + item.rect.x + 'px',
        'top:' + item.rect.y + 'px',
        'width:' + Math.max(12, item.rect.width) + 'px',
        'height:' + Math.max(12, item.rect.height) + 'px',
        'border:2px solid ' + c,
        'background:' + c + '18',
        'box-sizing:border-box',
        'border-radius:3px'
      ].join(';');
      const tag = document.createElement('span');
      tag.textContent = '#' + item.id + ' ' + item.ruleId;
      tag.style.cssText = [
        'position:absolute',
        'left:0',
        'top:-18px',
        'background:' + c,
        'color:#fff',
        'font:bold 10px/14px monospace',
        'padding:1px 4px',
        'border-radius:2px',
        'white-space:nowrap'
      ].join(';');
      box.appendChild(tag);
      root.appendChild(box);
    }
    document.documentElement.appendChild(root);
    return items.length;
  })()`;
}

/**
 * The script injected into the design-prototype iframe so the cockpit can drive
 * it: build a layers tree, pick/outline elements, apply token-valued style
 * changes (Tier-1 direct manipulation), and serialize the edited document back
 * for saving. Runs inside the `allow-scripts` sandbox (no same-origin), so it
 * talks to the parent ONLY via postMessage - the parent verifies the source is
 * this iframe's contentWindow (origin is the opaque "null"), exactly like the
 * DSGN-1 picker it supersedes.
 *
 * The indigo outline below is iframe-internal editor chrome (not app CSS), so
 * the literal color is intentional and never themed.
 */

/** A node in the flattened layers tree (indent by `depth`). */
export interface DesignNode {
  id: string;
  tag: string;
  label: string;
  depth: number;
}

/** The concrete styles read off a picked element (computed values). */
export interface NodeStyles {
  color: string;
  background: string;
  fontSize: string;
  padding: string;
  borderRadius: string;
  hidden: boolean;
}

/** A picked element, posted up on click or programmatic select. */
export interface PickedNode {
  id: string;
  selector: string;
  tag: string;
  text: string;
  snippet: string;
  styles: NodeStyles;
}

/** Messages FROM the iframe bridge UP to the cockpit. */
export type BridgeInbound =
  | { source: "athena-studio"; type: "ready"; tree: DesignNode[] }
  | { source: "athena-studio"; type: "pick"; node: PickedNode }
  | { source: "athena-studio"; type: "serialized"; html: string };

/** Commands FROM the cockpit DOWN to the iframe bridge. */
export type BridgeCommand =
  | { dir: "athena-studio"; type: "arm" }
  | { dir: "athena-studio"; type: "disarm" }
  | { dir: "athena-studio"; type: "select"; id: string }
  | { dir: "athena-studio"; type: "apply"; id: string; prop: string; value: string; token: string | null }
  | { dir: "athena-studio"; type: "serialize" };

/** CSS properties the Tier-1 knobs may set (kebab-case for `setProperty`). */
export type StyleProp =
  | "color"
  | "background-color"
  | "font-size"
  | "padding"
  | "border-radius"
  | "display";

export const BRIDGE_SCRIPT = `(function(){
  if (window.__athenaStudio) return; window.__athenaStudio = true;
  var armed = false, counter = 0, picked = null, hover = null;
  function idOf(el){
    var id = el.getAttribute('data-athena-id');
    if (!id){ id = 'n' + (counter++); el.setAttribute('data-athena-id', id); }
    return id;
  }
  function path(el){
    var parts = [];
    while (el && el.nodeType === 1 && el.tagName !== 'BODY' && parts.length < 5){
      var sel = el.tagName.toLowerCase();
      if (el.id){ parts.unshift(sel + '#' + el.id); break; }
      var cls = (typeof el.className === 'string') ? el.className.trim().split(/\\s+/).filter(Boolean).slice(0,2).join('.') : '';
      if (cls) sel += '.' + cls;
      var p = el.parentNode;
      if (p && p.children){
        var same = Array.prototype.filter.call(p.children, function(c){ return c.tagName === el.tagName; });
        if (same.length > 1) sel += ':nth-of-type(' + (Array.prototype.indexOf.call(same, el) + 1) + ')';
      }
      parts.unshift(sel);
      el = el.parentNode;
    }
    return parts.join(' > ');
  }
  function styleOf(el){
    var cs = getComputedStyle(el);
    return {
      color: cs.color, background: cs.backgroundColor, fontSize: cs.fontSize,
      padding: cs.padding, borderRadius: cs.borderRadius, hidden: cs.display === 'none'
    };
  }
  function describe(el){
    var html = el.outerHTML || '';
    return {
      id: idOf(el), selector: path(el), tag: (el.tagName || '').toLowerCase(),
      text: (el.textContent || '').trim().slice(0, 80), snippet: html.slice(0, 600), styles: styleOf(el)
    };
  }
  function buildTree(){
    var out = [], root = document.body;
    if (!root) return out;
    function walk(el, depth){
      if (out.length > 500) return;
      var tag = (el.tagName || '').toLowerCase();
      var cls = (typeof el.className === 'string' && el.className.trim()) ? el.className.trim().split(/\\s+/)[0] : '';
      var txt = '';
      for (var i = 0; i < el.childNodes.length; i++){
        var c = el.childNodes[i];
        if (c.nodeType === 3 && c.textContent && c.textContent.trim()){ txt = c.textContent.trim().slice(0, 32); break; }
      }
      out.push({ id: idOf(el), tag: tag, label: txt || (cls ? '.' + cls : tag), depth: depth });
      for (var j = 0; j < el.children.length; j++) walk(el.children[j], depth + 1);
    }
    for (var k = 0; k < root.children.length; k++) walk(root.children[k], 0);
    return out;
  }
  function post(msg){ msg.source = 'athena-studio'; parent.postMessage(msg, '*'); }
  function outline(el, on){
    if (el && el.style){
      el.style.outline = on ? '2px solid #6366f1' : '';
      el.style.outlineOffset = on ? '-2px' : '';
      if (on) el.setAttribute('data-athena-outline', '1');
      else if (el.removeAttribute) el.removeAttribute('data-athena-outline');
    }
  }
  function selectEl(el){
    if (picked && picked !== el) outline(picked, false);
    picked = el; outline(picked, true); post({ type: 'pick', node: describe(el) });
  }
  function byId(id){ return document.querySelector('[data-athena-id="' + id + '"]'); }
  document.addEventListener('mouseover', function(e){
    if (!armed) return;
    if (hover && hover !== picked) outline(hover, false);
    hover = e.target; if (hover !== picked) outline(hover, true);
  }, true);
  document.addEventListener('mouseout', function(e){
    if (!armed) return; if (e.target !== picked) outline(e.target, false);
  }, true);
  document.addEventListener('click', function(e){
    if (!armed) return; e.preventDefault(); e.stopPropagation(); selectEl(e.target);
  }, true);
  window.addEventListener('message', function(e){
    var d = e.data; if (!d || d.dir !== 'athena-studio') return;
    if (d.type === 'arm'){ armed = true; }
    else if (d.type === 'disarm'){ armed = false; if (hover) outline(hover, false); }
    else if (d.type === 'select'){ var s = byId(d.id); if (s){ s.scrollIntoView({ block: 'center' }); selectEl(s); } }
    else if (d.type === 'apply'){
      var t = byId(d.id);
      if (t){
        t.style.setProperty(d.prop, d.value);
        if (d.token) t.setAttribute('data-athena-token-' + d.prop, d.token);
        if (picked === t) post({ type: 'pick', node: describe(t) });
      }
    }
    else if (d.type === 'serialize'){
      // Serialize hygiene: the saved artifact must be the USER'S document only.
      // Strip our bookkeeping ids, the injected bridge script (marked, plus any
      // unmarked copy a previously-corrupted save baked in), and the editor's
      // hover/selection outlines - but keep data-athena-token-* provenance.
      var clone = document.documentElement.cloneNode(true);
      var marked = clone.querySelectorAll('[data-athena-id]');
      for (var i = 0; i < marked.length; i++) marked[i].removeAttribute('data-athena-id');
      var scripts = clone.querySelectorAll('script');
      for (var j = 0; j < scripts.length; j++){
        var sc = scripts[j];
        if (sc.hasAttribute('data-athena-bridge') || (sc.textContent || '').indexOf('__athenaStudio') !== -1){
          if (sc.parentNode) sc.parentNode.removeChild(sc);
        }
      }
      function clearOutline(el){
        el.style.outline = ''; el.style.outlineOffset = '';
        el.removeAttribute('data-athena-outline');
        if (!el.getAttribute('style')) el.removeAttribute('style');
      }
      var outlined = clone.querySelectorAll('[data-athena-outline]');
      for (var k = 0; k < outlined.length; k++) clearOutline(outlined[k]);
      // Stale editor-chrome outlines left over from previously-corrupted saves.
      // Scrub ONLY the exact chrome signature - a 2px solid indigo outline AND
      // the -2px outline-offset TOGETHER - so a user's own indigo outline
      // (Tailwind's stock indigo-500, plausible in a focus-ring demo) is never
      // deleted by the sweep.
      var styled = clone.querySelectorAll('[style]');
      for (var m2 = 0; m2 < styled.length; m2++){
        var st = styled[m2].style;
        var o = (st.getPropertyValue('outline') || '').toLowerCase();
        var indigo = o.indexOf('rgb(99, 102, 241)') !== -1 || o.indexOf('#6366f1') !== -1;
        var isChrome = indigo && o.indexOf('2px') !== -1 && o.indexOf('solid') !== -1 &&
          (st.getPropertyValue('outline-offset') || '').trim() === '-2px';
        if (isChrome) clearOutline(styled[m2]);
      }
      post({ type: 'serialized', html: '<!doctype html>\\n' + clone.outerHTML });
    }
  });
  post({ type: 'ready', tree: buildTree() });
})();`;

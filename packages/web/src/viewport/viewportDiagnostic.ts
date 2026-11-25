// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * A readout of what the device reports about its viewports, for the cases
 * no desktop browser reproduces (the iPhone's keyboard above all): the
 * numbers `viewport/visibleViewport.ts` works from, and where the layers it
 * sizes end up. Off unless asked for, by `?vvdebug=1` in the address or by
 * five quick taps on the title of the settings; a screenshot of it, keyboard
 * out, says what a remote debugger would.
 */

const TITLE_ID = "ow-settings-title";
const TAPS = 5;
const TAPS_WITHIN_MS = 3000;

function insets(doc: Document): string {
  const probe = doc.createElement("div");
  probe.style.cssText =
    "position:fixed;visibility:hidden;padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom) 0";
  doc.body.appendChild(probe);
  const style = getComputedStyle(probe);
  const text = `${parseFloat(style.paddingTop) || 0}/${parseFloat(style.paddingBottom) || 0}`;
  probe.remove();
  return text;
}

function span(el: Element | null): string {
  if (!el) return "none";
  const r = el.getBoundingClientRect();
  return `${Math.round(r.top)}..${Math.round(r.bottom)}`;
}

export function startViewportDiagnostic(win: Window = window): void {
  const doc = win.document;
  let box: HTMLElement | null = null;
  let timer = 0;

  const render = () => {
    if (!box) return;
    const vv = win.visualViewport;
    const root = doc.documentElement;
    const css = (name: string) => root.style.getPropertyValue(name) || "unset";
    const active = doc.activeElement && doc.activeElement !== doc.body ? doc.activeElement : null;
    box.style.top = `${vv ? vv.offsetTop : 0}px`;
    box.textContent = [
      `inner ${win.innerHeight}  client ${root.clientHeight}  screen ${win.screen.height}`,
      vv
        ? `vv h ${Math.round(vv.height)}  top ${Math.round(vv.offsetTop)}  pageTop ${Math.round(vv.pageTop)}  scale ${vv.scale}`
        : "no visualViewport",
      `scrollY ${Math.round(win.scrollY)}  insets ${insets(doc)}`,
      `css top ${css("--ow-vv-top")}  height ${css("--ow-vv-height")}  below ${css("--ow-vv-below")}`,
      `layer ${span(doc.querySelector(".ow-visible-viewport"))}  dialog ${span(doc.querySelector("[role=dialog]"))}`,
      `field ${span(active)} ${active ? active.tagName.toLowerCase() : ""}`,
    ].join("\n");
  };

  const toggle = () => {
    if (box) {
      win.clearInterval(timer);
      box.remove();
      box = null;
      return;
    }
    box = doc.createElement("pre");
    box.setAttribute("aria-hidden", "true");
    box.style.cssText =
      "position:fixed;left:0;right:0;z-index:2147483647;margin:0;padding:2px 6px;pointer-events:none;" +
      "font:10px/1.25 ui-monospace,monospace;white-space:pre-wrap;background:rgba(0,0,0,.82);color:#7CFC9A";
    doc.body.appendChild(box);
    timer = win.setInterval(render, 400);
    render();
  };

  let taps: number[] = [];
  doc.addEventListener("pointerdown", (event) => {
    const target = event.target instanceof Element ? event.target.closest(`#${TITLE_ID}`) : null;
    if (!target) return;
    const now = Date.now();
    taps = [...taps.filter((t) => now - t < TAPS_WITHIN_MS), now];
    if (taps.length >= TAPS) {
      taps = [];
      toggle();
    }
  });

  if (new URLSearchParams(win.location.search).get("vvdebug") === "1") toggle();
}

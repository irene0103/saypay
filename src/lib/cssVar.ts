/**
 * Read a design token's computed value.
 *
 * ECharts paints to a <canvas>, where `var(--chart-1)` is not a colour — it resolves to
 * nothing and the series falls back to black. Anything handed to a chart has to be a real
 * value, so tokens get resolved here first. (DOM nodes can keep using var() directly;
 * only the canvas needs this.)
 */
export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

export function cssVars<T extends readonly string[]>(...names: T): string[] {
  const style = getComputedStyle(document.documentElement)
  return names.map((n) => style.getPropertyValue(n).trim())
}

/**
 * Money helpers. All internal amounts are integer cents (spec §4.1).
 * Parsing/formatting is the ONLY place cents ↔ 元 conversion may happen.
 */
import type { Cents } from './types'

/** 元 → cents. Rounds to the nearest cent; rejects non-finite input. */
export function toCents(yuan: number): Cents {
  if (!Number.isFinite(yuan)) throw new Error(`not a number: ${yuan}`)
  return Math.round(yuan * 100)
}

/** cents → 元, as a number (for chart series only — never for arithmetic on money). */
export function toYuan(cents: Cents): number {
  return cents / 100
}

/**
 * Display format. Whole 元 by default (spec §4.1: 顯示與結算時四捨五入到「元」).
 * `$12,540`
 */
export function formatMoney(cents: Cents, opts: { sign?: boolean } = {}): string {
  const yuan = Math.round(cents / 100)
  const abs = Math.abs(yuan).toLocaleString('en-US')
  if (!opts.sign) return `$${abs}`
  // Dual encoding: colour alone must never carry meaning (design-system.md §5.7, §7).
  if (yuan > 0) return `+$${abs}`
  if (yuan < 0) return `−$${abs}`
  return `$${abs}`
}

/**
 * Parse the calculator keypad (spec §3.2.1: `180+50` → 230).
 * Supports + − × ÷ over decimal 元. Returns cents, or null if unparseable.
 */
export function evalAmountExpression(input: string): Cents | null {
  const normalized = input.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').trim()
  if (!normalized) return null
  if (!/^[\d+\-*/.() ]+$/.test(normalized)) return null

  let result: unknown
  try {
    result = Function(`"use strict"; return (${normalized})`)()
  } catch {
    return null
  }
  if (typeof result !== 'number' || !Number.isFinite(result) || result <= 0) return null
  return toCents(result)
}

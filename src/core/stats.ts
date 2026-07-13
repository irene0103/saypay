/**
 * Derived statistics — spec §3.4.
 *
 * The three metrics are NOT interchangeable, and picking the wrong one is the exact
 * failure the product exists to fix:
 *
 *   本月支出   Σ amount where paidBy === me          cash out of my pocket
 *   本月實際花費 Σ my shareAmount                       ← hero card, budget, category %, trend
 *   本月墊付款  Σ max(0, my amount − my shareAmount)   what I fronted for others
 *
 * Front a $600 hotpot and bill 餐飲 for 600 instead of 200 and the category breakdown is
 * a lie — see spec §3.4.
 */
import type { Cents, Transaction } from './types'

/**
 * My share of one transaction — the "實際花費" reading (spec §1.4).
 * A non-split expense is entirely mine. A split expense is only my `shareAmount`;
 * if I'm not a participant (pure 代墊) it is 0.
 */
export function myShare(t: Transaction, me: string): Cents {
  if (t.type !== 'expense' || t.deletedAt) return 0
  if (!t.isSplit) return t.amount
  return t.splits.find((s) => s.member === me)?.shareAmount ?? 0
}

/** Cash that actually left my pocket for this transaction. */
export function myCashOut(t: Transaction, me: string): Cents {
  if (t.type !== 'expense' || t.deletedAt) return 0
  if (!t.isSplit) return t.amount
  return t.paidBy === me ? t.amount : 0
}

/** What I fronted for other people on this transaction. */
export function myFronted(t: Transaction, me: string): Cents {
  return Math.max(0, myCashOut(t, me) - myShare(t, me))
}

export interface PeriodStats {
  /** Cash out. */
  spent: Cents
  /** Real cost to me — drives hero, budget, category %, trend. */
  actual: Cents
  /** Fronted for others. */
  fronted: Cents
  income: Cents
}

export function periodStats(transactions: Transaction[], me: string): PeriodStats {
  let spent = 0
  let actual = 0
  let fronted = 0
  let income = 0

  for (const t of transactions) {
    if (t.deletedAt) continue
    if (t.type === 'income') {
      // Income never enters any expense stat or budget (spec §3.4).
      income += t.amount
      continue
    }
    spent += myCashOut(t, me)
    actual += myShare(t, me)
    fronted += myFronted(t, me)
  }

  return { spent, actual, fronted, income }
}

/**
 * Spend per category, in 實際花費 terms.
 * Keys are the transaction's leaf categoryId — roll up to parents with `rollUpToParents`.
 */
export function spendByCategory(transactions: Transaction[], me: string): Map<string, Cents> {
  const out = new Map<string, Cents>()
  for (const t of transactions) {
    const share = myShare(t, me)
    if (share === 0) continue
    out.set(t.category, (out.get(t.category) ?? 0) + share)
  }
  return out
}

/**
 * Budgets live only on parent categories (spec §3.5, decision #35), so leaf spend must be
 * rolled up before comparing against a budget.
 */
export function rollUpToParents(
  byLeaf: Map<string, Cents>,
  parentOf: (categoryId: string) => string | undefined,
): Map<string, Cents> {
  const out = new Map<string, Cents>()
  for (const [leaf, cents] of byLeaf) {
    const key = parentOf(leaf) ?? leaf
    out.set(key, (out.get(key) ?? 0) + cents)
  }
  return out
}

/**
 * Consecutive-days streak (spec §3.1.1). Derived from transaction dates, never stored.
 * `today` is injected so this stays pure and testable across timezones.
 */
export function streakDays(transactions: Transaction[], today: Date = new Date()): number {
  const days = new Set<string>()
  for (const t of transactions) {
    if (t.deletedAt) continue
    days.add(localDayKey(new Date(t.date)))
  }
  if (days.size === 0) return 0

  // A streak is unbroken if it includes today; if not, it may still be alive through
  // yesterday (the user simply hasn't logged anything yet today).
  const cursor = new Date(today)
  if (!days.has(localDayKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1)
    if (!days.has(localDayKey(cursor))) return 0
  }

  let count = 0
  while (days.has(localDayKey(cursor))) {
    count++
    cursor.setDate(cursor.getDate() - 1)
  }
  return count
}

/** Day bucket in LOCAL time — a 1am purchase belongs to that day (spec §6.4). */
export function localDayKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Month bucket in LOCAL time — `YYYY-MM`. */
export function localMonthKey(d: Date): string {
  return localDayKey(d).slice(0, 7)
}

/** `2026-07` → the first instant of that month, in LOCAL time. */
export function monthStart(monthKey: string): Date {
  const [y, m] = monthKey.split('-')
  return new Date(Number(y), Number(m) - 1, 1)
}

/** Number of days in the given `YYYY-MM`. */
export function daysInMonth(monthKey: string): number {
  const d = monthStart(monthKey)
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
}

/** Shift a `YYYY-MM` key by whole months. */
export function shiftMonthKey(monthKey: string, delta: number): string {
  const d = monthStart(monthKey)
  d.setMonth(d.getMonth() + delta)
  return localMonthKey(d)
}

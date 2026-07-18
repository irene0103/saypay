/**
 * Budget threshold crossings — spec §3.5.
 *
 * Alerts fire only on the transition ACROSS a boundary, never on every write while already
 * past it. Once you're over budget, a fresh toast on each new coffee is noise, so the state
 * (per month, per category) is what gets compared — not the raw percentage.
 *
 * The 80% warning is the one that can still change behaviour: by the time the 100% alert
 * fires, the money is already gone.
 */
import type { Cents } from './types'

export type BudgetState = 'under' | 'warning' | 'over'

/** Thresholds are fixed, deliberately not user-configurable (spec §3.5). */
export function budgetState(spent: Cents, budget: Cents): BudgetState {
  if (budget <= 0) return 'under'
  const pct = (spent / budget) * 100
  if (pct > 100) return 'over'
  if (pct >= 80) return 'warning'
  return 'under'
}

export interface BudgetAlert {
  categoryId: string
  state: 'warning' | 'over'
  spent: Cents
  budget: Cents
}

/**
 * Compare the previous per-category states against the new ones and return only the
 * categories that just crossed a boundary. Callers persist `next` as
 * `budgetAlertState[month][category]`, which resets monthly.
 */
export function crossedThresholds(
  prev: Record<string, BudgetState>,
  spentByCategory: Map<string, Cents>,
  budgetByCategory: Record<string, Cents>,
): { alerts: BudgetAlert[]; next: Record<string, BudgetState> } {
  const alerts: BudgetAlert[] = []
  const next: Record<string, BudgetState> = {}

  for (const [categoryId, budget] of Object.entries(budgetByCategory)) {
    const spent = spentByCategory.get(categoryId) ?? 0
    const state = budgetState(spent, budget)
    next[categoryId] = state

    const before = prev[categoryId] ?? 'under'
    if (state === before) continue
    // Only escalations are worth a toast; falling back under a threshold (an edit, a
    // delete) is not news.
    if (state === 'warning' && before === 'under') {
      alerts.push({ categoryId, state, spent, budget })
    } else if (state === 'over' && before !== 'over') {
      alerts.push({ categoryId, state, spent, budget })
    }
  }

  return { alerts, next }
}

/** Days left in the month — the context that makes an overspend message actionable. */
export function daysLeftInMonth(today: Date = new Date()): number {
  const last = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
  return last - today.getDate()
}

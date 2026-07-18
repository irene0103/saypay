/**
 * Pairwise directed debt matrix — spec §5.3.
 * Ported from doc/rules/debt.js. Algorithm unchanged.
 *
 * This is the fix for the v0.1 bug. The naive global formula
 *   netBalance(m) = Σ (paidAmount − shareAmount)
 * is wrong: when Amy pays a bill split among {me, Amy, Ben}, it credits Amy globally,
 * but part of that credit is Ben owing Amy — which has nothing to do with me.
 *
 * Correct model: for each split expense, every non-payer participant owes the payer
 * their shareAmount. Settlements pay debt back. Net any two people pairwise.
 */
import type { Cents, Settlement, Transaction } from './types'

/** debt[A][B] = cents A owes B, gross (pre-net). */
export type DebtMap = Map<string, Map<string, Cents>>

export function buildDebtMap(
  transactions: Transaction[],
  settlements: Settlement[] = [],
): DebtMap {
  const debt: DebtMap = new Map()

  const add = (from: string, to: string, cents: Cents) => {
    if (from === to || cents === 0) return
    let row = debt.get(from)
    if (!row) {
      row = new Map()
      debt.set(from, row)
    }
    row.set(to, (row.get(to) || 0) + cents)
  }

  // Step 1: accrue debt from split expenses.
  for (const t of transactions) {
    if (t.deletedAt) continue
    if (!t.isSplit || t.type !== 'expense') continue
    for (const s of t.splits) {
      if (s.member === t.paidBy) continue
      add(s.member, t.paidBy, s.shareAmount)
    }
  }

  // Step 2: settlements reduce debt.
  for (const st of settlements) {
    if (st.deletedAt) continue
    add(st.from, st.to, -st.amount)
  }

  return debt
}

/** > 0 → a owes b; < 0 → b owes a; 0 → even. */
export function net(debt: DebtMap, a: string, b: string): Cents {
  const ab = debt.get(a)?.get(b) || 0
  const ba = debt.get(b)?.get(a) || 0
  return ab - ba
}

export interface Balances {
  receivable: Cents
  payable: Cents
  netTotal: Cents
  /** net > 0 → that person owes me; < 0 → I owe them. Sorted receivable-first. */
  perPerson: { member: string; net: Cents }[]
}

/**
 * All balances involving `me` — the Dashboard and 分帳總覽 view (spec §5.3).
 * Debts not involving me (Amy ↔ Ben) stay in the matrix but are not surfaced in MVP.
 */
export function balancesFor(debt: DebtMap, me: string): Balances {
  const counterparties = new Set<string>()
  for (const [from, row] of debt) {
    if (from !== me) counterparties.add(from)
    for (const to of row.keys()) if (to !== me) counterparties.add(to)
  }

  const perPerson: { member: string; net: Cents }[] = []
  let receivable = 0
  let payable = 0

  for (const other of counterparties) {
    const owedToMe = net(debt, other, me)
    if (owedToMe === 0) continue
    perPerson.push({ member: other, net: owedToMe })
    if (owedToMe > 0) receivable += owedToMe
    else payable += -owedToMe
  }

  perPerson.sort((a, b) => b.net - a.net)
  return { receivable, payable, netTotal: receivable - payable, perPerson }
}

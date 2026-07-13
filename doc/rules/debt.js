// @ts-check
/**
 * Pairwise directed debt matrix (spec §5.3).
 *
 * THIS FIXES THE v0.1 BUG. The naive global formula
 *   netBalance(m) = Σ (paidAmount - shareAmount)
 * is WRONG: when Amy pays for a bill split among {me, Amy, Ben}, it credits Amy
 * globally, but part of that credit is Ben owing Amy — nothing to do with me.
 *
 * Correct model: for each split expense, every non-payer participant owes the
 * payer their shareAmount. Settlements pay debt back. Net any two people pairwise.
 */

/**
 * Build the directed debt map from transactions and settlements.
 * Soft-deleted rows (deletedAt) are ignored.
 *
 * @param {import('./types.js').Transaction[]} transactions
 * @param {import('./types.js').Settlement[]}  settlements
 * @returns {Map<string, Map<string, number>>}  debt[A][B] = cents A owes B (gross, pre-net)
 */
export function buildDebtMap(transactions, settlements = []) {
  /** @type {Map<string, Map<string, number>>} */
  const debt = new Map();

  const add = (from, to, cents) => {
    if (from === to || cents === 0) return;
    if (!debt.has(from)) debt.set(from, new Map());
    const row = debt.get(from);
    row.set(to, (row.get(to) || 0) + cents);
  };

  // Step 1: accrue debt from split expenses.
  for (const t of transactions) {
    if (t.deletedAt) continue;
    if (!t.isSplit || t.type !== 'expense') continue;
    for (const s of t.splits) {
      if (s.member === t.paidBy) continue; // payer doesn't owe themselves
      add(s.member, t.paidBy, s.shareAmount);
    }
  }

  // Step 2: settlements reduce debt (from paid to → so `from` owes `to` less).
  for (const st of settlements) {
    if (st.deletedAt) continue;
    add(st.from, st.to, -st.amount);
  }

  return debt;
}

/**
 * Net pairwise balance between A and B.
 * @returns {number} > 0 → A owes B; < 0 → B owes A; 0 → even. (cents)
 */
export function net(debt, a, b) {
  const ab = debt.get(a)?.get(b) || 0;
  const ba = debt.get(b)?.get(a) || 0;
  return ab - ba;
}

/**
 * All net balances relevant to a single person `me` (spec §5.3 dashboard view).
 * Returns one entry per counterparty with a non-zero net balance.
 *
 * @returns {{ receivable: number, payable: number, netTotal: number,
 *            perPerson: {member: string, net: number}[] }}
 *   perPerson.net > 0 → that person owes me; < 0 → I owe that person.
 */
export function balancesFor(debt, me) {
  const counterparties = new Set();
  for (const [from, row] of debt) {
    if (from !== me) counterparties.add(from);
    for (const to of row.keys()) if (to !== me) counterparties.add(to);
  }

  const perPerson = [];
  let receivable = 0;
  let payable = 0;

  for (const other of counterparties) {
    // net(other, me) > 0 → other owes me.
    const owedToMe = net(debt, other, me);
    if (owedToMe === 0) continue;
    perPerson.push({ member: other, net: owedToMe });
    if (owedToMe > 0) receivable += owedToMe;
    else payable += -owedToMe;
  }

  perPerson.sort((a, b) => b.net - a.net);
  return { receivable, payable, netTotal: receivable - payable, perPerson };
}

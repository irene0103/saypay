// @ts-check
import { describe, it, expect } from 'vitest';
import { computeSplits } from './split.js';
import { buildDebtMap, net } from './debt.js';

// tiny deterministic PRNG so failures are reproducible
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PEOPLE = ['me', 'A', 'B', 'C', 'D', 'E'];

function randomExpense(rng, i) {
  const n = 1 + Math.floor(rng() * (PEOPLE.length - 1)); // 1..(len-1) participants... allow up to all
  const pool = [...PEOPLE].sort(() => rng() - 0.5);
  const members = pool.slice(0, Math.max(1, n));
  const paidBy = PEOPLE[Math.floor(rng() * PEOPLE.length)]; // payer may be outside members (代墊)
  const amount = 1 + Math.floor(rng() * 500000); // up to 5000.00
  return {
    id: `t${i}`,
    title: `t${i}`,
    amount,
    type: 'expense',
    category: 'x',
    date: '2026-07-10',
    isSplit: true,
    paidBy,
    members,
    splitType: 'equal',
    splits: computeSplits({ amount, paidBy, members, splitType: 'equal' }),
  };
}

describe('system invariants (property-based, 500 random ledgers)', () => {
  it('total credit === total debit (no money created or destroyed)', () => {
    for (let seed = 0; seed < 500; seed++) {
      const rng = mulberry32(seed);
      const count = 1 + Math.floor(rng() * 30);
      const txs = Array.from({ length: count }, (_, i) => randomExpense(rng, i));

      const debt = buildDebtMap(txs);
      let totalCredit = 0;
      let totalDebit = 0;
      for (const [, row] of debt) {
        for (const cents of row.values()) {
          if (cents > 0) totalDebit += cents;
        }
      }
      // Every debit A→B is someone's credit; sum of all directed edges must
      // equal the sum of everyone's share paid by someone else.
      let expected = 0;
      for (const t of txs) {
        for (const s of t.splits) {
          if (s.member !== t.paidBy) expected += s.shareAmount;
        }
      }
      expect(totalDebit).toBe(expected);
      // credit side symmetric
      for (const [, row] of debt) for (const c of row.values()) if (c > 0) totalCredit += c;
      expect(totalCredit).toBe(expected);
    }
  });

  it('antisymmetry: net(A,B) === -net(B,A) for all pairs', () => {
    for (let seed = 1000; seed < 1200; seed++) {
      const rng = mulberry32(seed);
      const txs = Array.from({ length: 1 + Math.floor(rng() * 20) }, (_, i) => randomExpense(rng, i));
      const debt = buildDebtMap(txs);
      for (const a of PEOPLE) {
        for (const b of PEOPLE) {
          if (a === b) continue;
          // + 0 normalizes -0 → 0 (the value is mathematically equal; toBe is -0-strict)
          expect(net(debt, a, b)).toBe(-net(debt, b, a) + 0);
        }
      }
    }
  });

  it('zero-sum: sum of every persons total net position === 0', () => {
    for (let seed = 2000; seed < 2200; seed++) {
      const rng = mulberry32(seed);
      const txs = Array.from({ length: 1 + Math.floor(rng() * 20) }, (_, i) => randomExpense(rng, i));
      const debt = buildDebtMap(txs);
      let grandTotal = 0;
      for (const p of PEOPLE) {
        let position = 0; // >0 = net owed to p
        for (const other of PEOPLE) {
          if (other === p) continue;
          position += net(debt, other, p);
        }
        grandTotal += position;
      }
      expect(grandTotal).toBe(0);
    }
  });
});

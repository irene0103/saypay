// @ts-check
import { describe, it, expect } from 'vitest';
import { computeSplits } from './split.js';
import { buildDebtMap, net, balancesFor } from './debt.js';

/** helper: build a split expense transaction */
function expense({ id, amount, paidBy, members, splitType = 'equal', values, groupId, deletedAt }) {
  return {
    id,
    title: id,
    amount,
    type: 'expense',
    category: 'food',
    date: '2026-07-10T12:00:00',
    isSplit: true,
    paidBy,
    members,
    splitType,
    splits: computeSplits({ amount, paidBy, members, splitType, values }),
    groupId,
    deletedAt,
  };
}

describe('debt matrix — core spec §5.3 examples', () => {
  it('example 1: me/A/B eat 900, I pay, equal → A and B each owe me 300', () => {
    const txs = [expense({ id: 't1', amount: 900, paidBy: 'me', members: ['me', 'A', 'B'] })];
    const debt = buildDebtMap(txs);
    expect(net(debt, 'A', 'me')).toBe(300); // A owes me
    expect(net(debt, 'B', 'me')).toBe(300);
    const b = balancesFor(debt, 'me');
    expect(b.receivable).toBe(600);
    expect(b.payable).toBe(0);
    expect(b.netTotal).toBe(600);
  });

  it('example 2: me/C coffee 400, C pays, equal → I owe C 200', () => {
    const txs = [expense({ id: 't2', amount: 400, paidBy: 'C', members: ['me', 'C'] })];
    const debt = buildDebtMap(txs);
    expect(net(debt, 'me', 'C')).toBe(200); // I owe C
    const b = balancesFor(debt, 'me');
    expect(b.payable).toBe(200);
    expect(b.receivable).toBe(0);
    expect(b.netTotal).toBe(-200);
  });

  it('combined: dashboard shows +600 receivable, -200 payable, net +400', () => {
    const txs = [
      expense({ id: 't1', amount: 900, paidBy: 'me', members: ['me', 'A', 'B'] }),
      expense({ id: 't2', amount: 400, paidBy: 'C', members: ['me', 'C'] }),
    ];
    const b = balancesFor(buildDebtMap(txs), 'me');
    expect(b.receivable).toBe(600);
    expect(b.payable).toBe(200);
    expect(b.netTotal).toBe(400);
  });
});

describe('debt matrix — THE v0.1 BUG (spec §5.3 warning)', () => {
  it('Amy pays, {me,Amy,Ben} split → the me↔Amy debt is only my share, NOT the whole credit', () => {
    // 1800 / 3 = 600 each. Amy paid. me owes Amy 600. Ben owes Amy 600.
    const txs = [expense({ id: 't', amount: 1800, paidBy: 'Amy', members: ['me', 'Amy', 'Ben'] })];
    const debt = buildDebtMap(txs);

    // Correct: I owe Amy exactly 600 (my share), not 1200.
    expect(net(debt, 'me', 'Amy')).toBe(600);
    // Ben owes Amy 600 — a debt that does NOT involve me.
    expect(net(debt, 'Ben', 'Amy')).toBe(600);

    const b = balancesFor(debt, 'me');
    // The naive global formula would have shown me owing 1200. Assert it does NOT.
    expect(b.payable).toBe(600);
    expect(b.netTotal).toBe(-600);
    // Amy↔Ben debt is invisible to me but exists in the matrix.
    expect(b.perPerson.find((p) => p.member === 'Ben')).toBeUndefined();
  });

  it('keeps third-party debts (Amy↔Ben) in the matrix for future group sharing', () => {
    const txs = [expense({ id: 't', amount: 1800, paidBy: 'Amy', members: ['me', 'Amy', 'Ben'] })];
    const debt = buildDebtMap(txs);
    expect(net(debt, 'Ben', 'Amy')).toBe(600);
  });
});

describe('debt matrix — settlements', () => {
  it('full settlement zeroes the balance', () => {
    const txs = [expense({ id: 't1', amount: 900, paidBy: 'me', members: ['me', 'A', 'B'] })];
    const settlements = [{ id: 's1', from: 'A', to: 'me', amount: 300, at: '2026-07-11' }];
    const debt = buildDebtMap(txs, settlements);
    expect(net(debt, 'A', 'me')).toBe(0);
    expect(net(debt, 'B', 'me')).toBe(300); // B unaffected
    const b = balancesFor(debt, 'me');
    expect(b.receivable).toBe(300);
  });

  it('partial settlement leaves remaining balance (spec §3.3.3)', () => {
    const txs = [expense({ id: 't1', amount: 900, paidBy: 'me', members: ['me', 'A'] })];
    // A owes me 450; pays back 200.
    const settlements = [{ id: 's1', from: 'A', to: 'me', amount: 200, at: '2026-07-11' }];
    const debt = buildDebtMap(txs, settlements);
    expect(net(debt, 'A', 'me')).toBe(250);
  });

  it('over-settlement flips the balance (spec §3.3.3 reverse debt)', () => {
    const txs = [expense({ id: 't1', amount: 600, paidBy: 'me', members: ['me', 'A'] })];
    // A owes me 300; pays back 500 → now I owe A 200.
    const settlements = [{ id: 's1', from: 'A', to: 'me', amount: 500, at: '2026-07-11' }];
    const debt = buildDebtMap(txs, settlements);
    expect(net(debt, 'A', 'me')).toBe(-200); // A owes me -200 → I owe A 200
    expect(net(debt, 'me', 'A')).toBe(200);
    const b = balancesFor(debt, 'me');
    expect(b.payable).toBe(200);
  });

  it('deleting a settlement restores the debt (soft-delete ignored)', () => {
    const txs = [expense({ id: 't1', amount: 900, paidBy: 'me', members: ['me', 'A', 'B'] })];
    const settlements = [
      { id: 's1', from: 'A', to: 'me', amount: 300, at: '2026-07-11', deletedAt: '2026-07-12' },
    ];
    const debt = buildDebtMap(txs, settlements);
    expect(net(debt, 'A', 'me')).toBe(300); // restored
  });
});

describe('debt matrix — soft-deleted & non-split are ignored', () => {
  it('ignores soft-deleted transactions', () => {
    const txs = [
      expense({ id: 't1', amount: 900, paidBy: 'me', members: ['me', 'A', 'B'], deletedAt: 'x' }),
    ];
    const b = balancesFor(buildDebtMap(txs), 'me');
    expect(b.receivable).toBe(0);
  });

  it('ignores non-split expenses', () => {
    const solo = {
      id: 't1', title: 'coffee', amount: 120, type: 'expense', category: 'food',
      date: '2026-07-10', isSplit: false, paidBy: 'me', members: ['me'],
      splitType: 'equal', splits: [{ member: 'me', shareAmount: 120 }],
    };
    const b = balancesFor(buildDebtMap([solo]), 'me');
    expect(b.receivable).toBe(0);
    expect(b.payable).toBe(0);
  });
});

describe('debt matrix — netting across multiple transactions', () => {
  it('nets opposing debts between the same pair', () => {
    const txs = [
      // I pay, A owes me 300
      expense({ id: 't1', amount: 600, paidBy: 'me', members: ['me', 'A'] }),
      // A pays, I owe A 250
      expense({ id: 't2', amount: 500, paidBy: 'A', members: ['me', 'A'] }),
    ];
    const debt = buildDebtMap(txs);
    // A owes me 300, I owe A 250 → net: A owes me 50
    expect(net(debt, 'A', 'me')).toBe(50);
    const b = balancesFor(debt, 'me');
    expect(b.receivable).toBe(50);
    expect(b.payable).toBe(0);
  });
});

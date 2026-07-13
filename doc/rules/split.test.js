// @ts-check
import { describe, it, expect } from 'vitest';
import { computeSplits } from './split.js';

const sum = (splits) => splits.reduce((a, s) => a + s.shareAmount, 0);

describe('equal split', () => {
  it('splits evenly when divisible (火鍋 $600 / 3, spec §1.4)', () => {
    const s = computeSplits({
      amount: 60000,
      paidBy: 'me',
      members: ['me', 'A', 'B'],
      splitType: 'equal',
    });
    expect(s).toEqual([
      { member: 'me', shareAmount: 20000 },
      { member: 'A', shareAmount: 20000 },
      { member: 'B', shareAmount: 20000 },
    ]);
  });

  it('gives remainder to the payer when payer participates (spec §5.2)', () => {
    // 1000 / 3 = 333 each, remainder 1 → payer
    const s = computeSplits({
      amount: 1000,
      paidBy: 'me',
      members: ['me', 'A', 'B'],
      splitType: 'equal',
    });
    const me = s.find((x) => x.member === 'me');
    expect(me.shareAmount).toBe(334);
    expect(s.filter((x) => x.member !== 'me').map((x) => x.shareAmount)).toEqual([333, 333]);
    expect(sum(s)).toBe(1000);
  });

  it('gives remainder to members[0] when payer is NOT a participant (pure代墊)', () => {
    // I pay but do not partake. 1000 / 3 among A,B,C. remainder → A (members[0])
    const s = computeSplits({
      amount: 1000,
      paidBy: 'me',
      members: ['A', 'B', 'C'],
      splitType: 'equal',
    });
    expect(s.find((x) => x.member === 'A').shareAmount).toBe(334);
    expect(s.find((x) => x.member === 'B').shareAmount).toBe(333);
    expect(s.find((x) => x.member === 'C').shareAmount).toBe(333);
    expect(sum(s)).toBe(1000);
  });

  it('handles 20-way split with remainder (spec: max 20 people)', () => {
    const members = Array.from({ length: 20 }, (_, i) => `m${i}`);
    // 10019 / 20 = 500 each (10000), remainder 19 → payer m0
    const s = computeSplits({ amount: 10019, paidBy: 'm0', members, splitType: 'equal' });
    expect(s[0].shareAmount).toBe(519);
    expect(s.slice(1).every((x) => x.shareAmount === 500)).toBe(true);
    expect(sum(s)).toBe(10019);
  });

  it('single participant takes the whole amount', () => {
    const s = computeSplits({ amount: 500, paidBy: 'me', members: ['me'], splitType: 'equal' });
    expect(s).toEqual([{ member: 'me', shareAmount: 500 }]);
  });
});

describe('custom split', () => {
  it('accepts exact shares that sum to amount', () => {
    const s = computeSplits({
      amount: 900,
      paidBy: 'me',
      members: ['me', 'A', 'B'],
      splitType: 'custom',
      values: [400, 300, 200],
    });
    expect(s.map((x) => x.shareAmount)).toEqual([400, 300, 200]);
  });

  it('rejects shares that do not sum to amount', () => {
    expect(() =>
      computeSplits({
        amount: 900,
        paidBy: 'me',
        members: ['me', 'A'],
        splitType: 'custom',
        values: [400, 300],
      })
    ).toThrow(/sum to 700, expected 900/);
  });
});

describe('percentage split', () => {
  it('splits by percent and routes rounding leftover to payer', () => {
    // 1000 @ 33.33/33.33/33.34? use clean-ish: 50/30/20 of 1000 = 500/300/200
    const s = computeSplits({
      amount: 1000,
      paidBy: 'me',
      members: ['me', 'A', 'B'],
      splitType: 'percentage',
      values: [50, 30, 20],
    });
    expect(s.map((x) => x.shareAmount)).toEqual([500, 300, 200]);
  });

  it('distributes leftover cents from non-integer division to payer', () => {
    // 100 @ 33.33 / 33.33 / 33.34 → floors 33/33/33 = 99, leftover 1 → payer(me)
    const s = computeSplits({
      amount: 100,
      paidBy: 'me',
      members: ['me', 'A', 'B'],
      splitType: 'percentage',
      values: [33.33, 33.33, 33.34],
    });
    expect(s.find((x) => x.member === 'me').shareAmount).toBe(34);
    expect(sum(s)).toBe(100);
  });

  it('rejects percentages that do not sum to 100', () => {
    expect(() =>
      computeSplits({
        amount: 1000,
        paidBy: 'me',
        members: ['me', 'A'],
        splitType: 'percentage',
        values: [50, 30],
      })
    ).toThrow(/sum to 80, expected 100/);
  });
});

describe('input validation', () => {
  it('rejects non-integer amount', () => {
    expect(() =>
      computeSplits({ amount: 99.5, paidBy: 'me', members: ['me'], splitType: 'equal' })
    ).toThrow(/positive integer/);
  });
  it('rejects >20 members', () => {
    const members = Array.from({ length: 21 }, (_, i) => `m${i}`);
    expect(() =>
      computeSplits({ amount: 2100, paidBy: 'm0', members, splitType: 'equal' })
    ).toThrow(/MAX_MEMBERS/);
  });
  it('rejects duplicate members', () => {
    expect(() =>
      computeSplits({ amount: 300, paidBy: 'me', members: ['A', 'A'], splitType: 'equal' })
    ).toThrow(/duplicates/);
  });
});

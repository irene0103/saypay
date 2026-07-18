import { describe, expect, it } from 'vitest'

import { computeSplits } from '@/core/split'
import { balancesFor, buildDebtMap, net } from '@/core/debt'
import { myShare, periodStats, streakDays } from '@/core/stats'
import { evalAmountExpression, formatMoney, toCents } from '@/core/money'
import type { Settlement, Transaction } from '@/core/types'

const ME = 'me'
const AMY = 'amy'
const BEN = 'ben'

function tx(over: Partial<Transaction> = {}): Transaction {
  const base: Transaction = {
    id: 't1',
    ownerId: 'o',
    title: '火鍋',
    amount: 60000,
    type: 'expense',
    category: 'c',
    date: '2026-07-10T12:00:00.000Z',
    isSplit: true,
    paidBy: ME,
    members: [ME, AMY, BEN],
    splitType: 'equal',
    splits: [],
    createdAt: '2026-07-10T12:00:00.000Z',
    updatedAt: '2026-07-10T12:00:00.000Z',
  }
  const merged = { ...base, ...over }
  if (merged.isSplit && merged.splits.length === 0) {
    merged.splits = computeSplits({
      amount: merged.amount,
      paidBy: merged.paidBy,
      members: merged.members,
      splitType: merged.splitType,
    })
  }
  return merged
}

describe('computeSplits — spec §5.1, §5.2', () => {
  it('splits the spec §1.4 hotpot three ways', () => {
    const splits = computeSplits({
      amount: 60000,
      paidBy: ME,
      members: [ME, AMY, BEN],
      splitType: 'equal',
    })
    expect(splits).toEqual([
      { member: ME, shareAmount: 20000 },
      { member: AMY, shareAmount: 20000 },
      { member: BEN, shareAmount: 20000 },
    ])
  })

  it('gives an indivisible remainder to the payer when they participate', () => {
    const splits = computeSplits({
      amount: 100,
      paidBy: ME,
      members: [ME, AMY, BEN],
      splitType: 'equal',
    })
    // 100 / 3 = 33 each, 1 cent left over → the payer eats it.
    expect(splits.find((s) => s.member === ME)!.shareAmount).toBe(34)
    expect(splits.find((s) => s.member === AMY)!.shareAmount).toBe(33)
    expect(sum(splits)).toBe(100)
  })

  it('gives the remainder to members[0] when the payer is not a participant (純代墊)', () => {
    const splits = computeSplits({
      amount: 100,
      paidBy: ME,
      members: [AMY, BEN],
      splitType: 'equal',
    })
    expect(splits.find((s) => s.member === AMY)!.shareAmount).toBe(50)
    expect(sum(splits)).toBe(100)
  })

  it('never loses a cent, at any size, up to the 20-person cap', () => {
    for (let n = 1; n <= 20; n++) {
      for (const amount of [1, 99, 100, 12345, 999999]) {
        const members = Array.from({ length: n }, (_, i) => `m${i}`)
        const splits = computeSplits({ amount, paidBy: 'm0', members, splitType: 'equal' })
        expect(sum(splits)).toBe(amount)
      }
    }
  })

  it('rejects a custom split that does not sum to the amount', () => {
    expect(() =>
      computeSplits({
        amount: 60000,
        paidBy: ME,
        members: [ME, AMY],
        splitType: 'custom',
        values: [20000, 20000],
      }),
    ).toThrow(/sum to 40000/)
  })

  it('rounds percentage shares without drift', () => {
    const splits = computeSplits({
      amount: 10000,
      paidBy: ME,
      members: [ME, AMY, BEN],
      splitType: 'percentage',
      values: [33.33, 33.33, 33.34],
    })
    expect(sum(splits)).toBe(10000)
  })

  it('refuses more than 20 participants', () => {
    const members = Array.from({ length: 21 }, (_, i) => `m${i}`)
    expect(() =>
      computeSplits({ amount: 2100, paidBy: 'm0', members, splitType: 'equal' }),
    ).toThrow(/MAX_MEMBERS/)
  })
})

describe('buildDebtMap — spec §5.3 (the v0.1 bug)', () => {
  it('does NOT credit me for debt between two other people', () => {
    // Amy pays $600 for me + Amy + Ben. Ben owes Amy $200 — that has nothing to do with me.
    // The old global formula netBalance = Σ(paid − share) credited Amy +$400 and made the
    // Dashboard tell me I owed her all of it.
    const debt = buildDebtMap([tx({ paidBy: AMY })], [])

    expect(net(debt, ME, AMY)).toBe(20000) // I owe Amy only my own share
    expect(net(debt, BEN, AMY)).toBe(20000) // Ben owes Amy his
    expect(net(debt, ME, BEN)).toBe(0) // Ben and I are unrelated here

    const balances = balancesFor(debt, ME)
    expect(balances.payable).toBe(20000)
    expect(balances.receivable).toBe(0)
  })

  it('nets my receivables when I front the bill', () => {
    const balances = balancesFor(buildDebtMap([tx()], []), ME)
    expect(balances.receivable).toBe(40000)
    expect(balances.payable).toBe(0)
    expect(balances.netTotal).toBe(40000)
  })

  it('settles debt without touching the original transaction', () => {
    const t = tx()
    const settlement: Settlement = {
      id: 's1',
      ownerId: 'o',
      from: AMY,
      to: ME,
      amount: 20000,
      at: '2026-07-11T00:00:00.000Z',
    }
    const balances = balancesFor(buildDebtMap([t], [settlement]), ME)

    expect(balances.receivable).toBe(20000) // only Ben still owes
    expect(t.splits.find((s) => s.member === AMY)!.shareAmount).toBe(20000) // fact unchanged
  })

  it('reverses the balance when settled for more than is owed', () => {
    const over: Settlement = {
      id: 's1',
      ownerId: 'o',
      from: AMY,
      to: ME,
      amount: 30000, // Amy only owed 20000
      at: '2026-07-11T00:00:00.000Z',
    }
    const debt = buildDebtMap([tx()], [over])
    expect(net(debt, ME, AMY)).toBe(10000) // now I owe Amy the excess
  })

  it('ignores soft-deleted rows entirely', () => {
    const debt = buildDebtMap([tx({ deletedAt: '2026-07-11T00:00:00.000Z' })], [])
    expect(balancesFor(debt, ME).receivable).toBe(0)
  })

  it('ignores non-split and income rows', () => {
    const debt = buildDebtMap(
      [
        tx({ id: 'a', isSplit: false, splits: [{ member: ME, shareAmount: 60000 }] }),
        tx({ id: 'b', type: 'income' }),
      ],
      [],
    )
    expect(balancesFor(debt, ME).netTotal).toBe(0)
  })

  it('stays antisymmetric and zero-sum across random ledgers', () => {
    const people = [ME, AMY, BEN, 'cindy', 'dan']
    for (let seed = 0; seed < 200; seed++) {
      const txs: Transaction[] = []
      const count = 1 + (seed % 7)
      for (let i = 0; i < count; i++) {
        const n = 2 + ((seed + i) % 4)
        const members = people.slice(0, n)
        txs.push(
          tx({
            id: `t${i}`,
            amount: 1 + ((seed * 37 + i * 101) % 99999),
            paidBy: people[(seed + i) % people.length]!,
            members,
            splits: [],
          }),
        )
      }
      const debt = buildDebtMap(txs, [])

      // Every credit is someone else's debit, so the whole matrix must cancel out.
      let total = 0
      for (const a of people) for (const b of people) total += net(debt, a, b)
      expect(total).toBe(0)

      // Stated as a sum rather than net(a,b) === -net(b,a): negating 0 yields -0, which
      // Object.is (and therefore toBe) treats as a different value.
      for (const a of people) {
        for (const b of people) {
          expect(net(debt, a, b) + net(debt, b, a)).toBe(0)
        }
      }
    }
  })
})

describe('stats — spec §3.4', () => {
  it('separates cash out, real cost, and what I fronted', () => {
    const stats = periodStats([tx()], ME) // I paid $600, my share is $200
    expect(stats.spent).toBe(60000)
    expect(stats.actual).toBe(20000)
    expect(stats.fronted).toBe(40000)
  })

  it('counts a pure 代墊 as zero real cost to me', () => {
    const t = tx({ paidBy: ME, members: [AMY, BEN] })
    expect(myShare(t, ME)).toBe(0)
    expect(periodStats([t], ME).fronted).toBe(60000)
  })

  it('keeps income out of every expense figure', () => {
    const stats = periodStats([tx({ type: 'income', amount: 500000, isSplit: false })], ME)
    expect(stats.actual).toBe(0)
    expect(stats.spent).toBe(0)
    expect(stats.income).toBe(500000)
  })

  it('counts a streak back from today, and tolerates not having logged today yet', () => {
    const day = (offset: number) => {
      const d = new Date(2026, 6, 12)
      d.setDate(d.getDate() - offset)
      return d.toISOString()
    }
    const today = new Date(2026, 6, 12)

    expect(streakDays([tx({ date: day(0) }), tx({ date: day(1) })], today)).toBe(2)
    // Nothing logged today, but yesterday and the day before → the streak is still alive.
    expect(streakDays([tx({ date: day(1) }), tx({ date: day(2) })], today)).toBe(2)
    // A gap breaks it.
    expect(streakDays([tx({ date: day(0) }), tx({ date: day(3) })], today)).toBe(1)
    expect(streakDays([], today)).toBe(0)
  })
})

describe('money', () => {
  it('evaluates the calculator keypad', () => {
    expect(evalAmountExpression('180+50')).toBe(toCents(230))
    expect(evalAmountExpression('600÷3')).toBe(toCents(200))
    expect(evalAmountExpression('12×3')).toBe(toCents(36))
    expect(evalAmountExpression('')).toBeNull()
    expect(evalAmountExpression('abc')).toBeNull()
    expect(evalAmountExpression('0')).toBeNull()
    expect(evalAmountExpression('-5')).toBeNull()
  })

  it('dual-encodes direction with a sign, not colour alone', () => {
    expect(formatMoney(120000)).toBe('$1,200')
    expect(formatMoney(120000, { sign: true })).toBe('+$1,200')
    expect(formatMoney(-30000, { sign: true })).toBe('−$300')
  })
})

function sum(splits: { shareAmount: number }[]): number {
  return splits.reduce((a, s) => a + s.shareAmount, 0)
}

import { describe, expect, it } from 'vitest'

import { isEmptyPlan, parseBackup, planRestore, type LedgerRows } from '@/lib/restore'
import type { Category, Member, Transaction } from '@/core/types'

const T0 = '2026-10-01T00:00:00.000Z'
const T1 = '2026-10-02T00:00:00.000Z'

const me: Member = { id: 'm-self', name: '我', avatarColor: '#000', isSelf: true }
const food: Category = { id: 'c-food', name: '餐飲', icon: 'x', sortOrder: 1 }
const out: Category = { id: 'c-food-out', name: '外食', icon: 'x', parentId: 'c-food', sortOrder: 1 }

function tx(over: Partial<Transaction> = {}): Transaction {
  return {
    id: 't1',
    ownerId: 'o',
    title: '火鍋',
    amount: 60000,
    type: 'expense',
    category: 'c-food-out',
    date: T0,
    isSplit: false,
    paidBy: 'm-self',
    members: ['m-self'],
    splitType: 'equal',
    splits: [{ member: 'm-self', shareAmount: 60000 }],
    createdAt: T0,
    updatedAt: T0,
    ...over,
  }
}

function rows(over: Partial<LedgerRows> = {}): LedgerRows {
  return {
    transactions: [],
    settlements: [],
    members: [me],
    groups: [],
    categories: [food, out],
    budgets: [],
    ...over,
  }
}

const file = (r: LedgerRows, extra: object = {}) =>
  JSON.stringify({ schemaVersion: 1, exportedAt: T1, ...r, ...extra })

describe('parseBackup', () => {
  it('rejects files that are not our backup', () => {
    expect(parseBackup('not json')).toMatchObject({ ok: false, reason: '這不是有效的 JSON 檔' })
    expect(parseBackup('{"a":1}')).toMatchObject({ ok: false, reason: '這不是分分帳的備份檔' })
    expect(parseBackup('{"schemaVersion":99}')).toMatchObject({ ok: false })
  })

  it('drops and counts invalid rows instead of failing the file', () => {
    const broken = tx({ id: 't2', amount: 60000, splits: [{ member: 'm-self', shareAmount: 1 }], isSplit: true })
    const res = parseBackup(file(rows({ transactions: [tx(), broken] })))
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.rows.transactions.map((t) => t.id)).toEqual(['t1'])
    expect(res.invalid).toBe(1)
    expect(res.exportedAt).toBe(T1)
  })
})

describe('planRestore', () => {
  it('adds what is missing and leaves an identical device untouched', () => {
    const backup = rows({ transactions: [tx()] })
    expect(planRestore(backup, rows()).added.transactions).toBe(1)
    // Restoring the same file twice must not duplicate anything.
    expect(isEmptyPlan(planRestore(backup, backup))).toBe(true)
  })

  it('takes the newer copy of a transaction, keeps the local one otherwise', () => {
    const local = rows({ transactions: [tx({ title: '本機', updatedAt: T0 })] })
    const newer = planRestore(rows({ transactions: [tx({ title: '備份', updatedAt: T1 })] }), local)
    expect(newer.updated.transactions).toBe(1)
    expect(newer.rows.transactions[0]!.title).toBe('備份')

    const older = planRestore(rows({ transactions: [tx({ updatedAt: T0 })] }), rows({ transactions: [tx({ updatedAt: T1 })] }))
    expect(isEmptyPlan(older)).toBe(true)
  })

  it('never adds a second 「我」 and maps the backup self onto this device', () => {
    const otherSelf: Member = { ...me, id: 'm-self-web' }
    const plan = planRestore(
      rows({ members: [otherSelf], transactions: [tx({ paidBy: 'm-self-web', members: ['m-self-web'], splits: [{ member: 'm-self-web', shareAmount: 60000 }] })] }),
      rows(),
    )
    expect(plan.rows.members).toEqual([])
    expect(plan.rows.transactions[0]!.paidBy).toBe('m-self')
    expect(plan.rows.transactions[0]!.splits[0]!.member).toBe('m-self')
  })

  it('folds a same-name member into the local one and rewrites every reference', () => {
    const amyHere: Member = { id: 'amy-app', name: 'Amy', avatarColor: '#111', isSelf: false }
    const amyThere: Member = { id: 'amy-web', name: ' Amy ', avatarColor: '#222', isSelf: false }
    const split = tx({
      isSplit: true,
      members: ['m-self', 'amy-web'],
      splits: [
        { member: 'm-self', shareAmount: 30000 },
        { member: 'amy-web', shareAmount: 30000 },
      ],
    })
    const plan = planRestore(
      rows({
        members: [me, amyThere],
        transactions: [split],
        settlements: [{ id: 's1', ownerId: 'o', from: 'amy-web', to: 'm-self', amount: 100, at: T0 }],
        groups: [{ id: 'g1', name: '旅遊', memberIds: ['m-self', 'amy-web'], createdAt: T0 }],
      }),
      rows({ members: [me, amyHere] }),
    )
    expect(plan.rows.members).toEqual([])
    expect(plan.matchedByName).toBe(1)
    expect(plan.rows.transactions[0]!.members).toEqual(['m-self', 'amy-app'])
    expect(plan.rows.transactions[0]!.splits.map((s) => s.member)).toEqual(['m-self', 'amy-app'])
    expect(plan.rows.settlements[0]!.from).toBe('amy-app')
    expect(plan.rows.groups[0]!.memberIds).toEqual(['m-self', 'amy-app'])
  })

  it('folds a same-name category (under the same parent) and remaps transactions and budgets', () => {
    const mine: Category = { id: 'c-bf-app', name: '早餐', icon: 'x', parentId: 'c-food', sortOrder: 2 }
    const theirs: Category = { id: 'c-bf-web', name: '早餐', icon: 'x', parentId: 'c-food', sortOrder: 3 }
    const plan = planRestore(
      rows({
        categories: [food, out, theirs],
        transactions: [tx({ category: 'c-bf-web' })],
        budgets: [{ month: '2026-10', total: 100, byCategory: { 'c-bf-web': 100 } }],
      }),
      rows({ categories: [food, out, mine] }),
    )
    expect(plan.rows.categories).toEqual([])
    expect(plan.rows.transactions[0]!.category).toBe('c-bf-app')
    expect(plan.rows.budgets[0]!.byCategory).toEqual({ 'c-bf-app': 100 })
  })

  it('keeps local settlements, groups and budgets over the backup copy', () => {
    const local = rows({ budgets: [{ month: '2026-10', total: 500, byCategory: {} }] })
    const plan = planRestore(rows({ budgets: [{ month: '2026-10', total: 999, byCategory: {} }] }), local)
    expect(plan.rows.budgets).toEqual([])
  })
})

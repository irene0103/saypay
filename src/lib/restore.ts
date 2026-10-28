/**
 * Restore from a JSON backup — spec §3.12 L4, app-spec.md §3.3.
 *
 * MERGE, never replace: restoring the wrong file must not wipe the ledger. Rows are
 * matched by id. Transactions carry `updatedAt`, so the newer copy wins; every other table
 * has no timestamp, so a row already on this device is kept and the backup only fills in
 * what's missing.
 *
 * The one trap is identity across devices. The same person may have been added on two
 * devices ("Amy" on the web, "Amy" again in the app) under different ids. Restoring by id
 * alone would give two Amys and split her debt in half, so members — and likewise
 * categories — that don't match by id are matched by name, and every reference in the
 * backup is rewritten to the local id. The backup's 「我」 always maps onto this device's.
 *
 * Both functions are pure; the store does the writing.
 */
import type { z } from 'zod'

import {
  budgetSchema,
  categorySchema,
  groupSchema,
  memberSchema,
  normalizeMemberName,
  settlementSchema,
  transactionSchema,
} from '@/schemas'
import type { Budget, Category, Group, Member, Settlement, Transaction } from '@/core/types'

const SCHEMA_VERSION = 1

export interface LedgerRows {
  transactions: Transaction[]
  settlements: Settlement[]
  members: Member[]
  groups: Group[]
  categories: Category[]
  budgets: Budget[]
}

export type TableName = keyof LedgerRows

export type ParseResult =
  | { ok: true; rows: LedgerRows; exportedAt?: string; invalid: number }
  | { ok: false; reason: string }

const SCHEMAS: { [K in TableName]: z.ZodType } = {
  transactions: transactionSchema,
  settlements: settlementSchema,
  members: memberSchema,
  groups: groupSchema,
  categories: categorySchema,
  budgets: budgetSchema,
}

/**
 * Read and validate a backup file. Rows that fail their schema are dropped and counted
 * rather than failing the whole file — one bad row shouldn't cost the user everything else.
 */
export function parseBackup(text: string): ParseResult {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { ok: false, reason: '這不是有效的 JSON 檔' }
  }
  if (typeof data !== 'object' || data === null || !('schemaVersion' in data)) {
    return { ok: false, reason: '這不是分分帳的備份檔' }
  }
  const obj = data as Record<string, unknown>
  if (obj.schemaVersion !== SCHEMA_VERSION) {
    return { ok: false, reason: '備份檔版本不支援，請更新 App 後再試' }
  }

  let invalid = 0
  const rows = {} as LedgerRows
  for (const table of Object.keys(SCHEMAS) as TableName[]) {
    const raw = Array.isArray(obj[table]) ? (obj[table] as unknown[]) : []
    const valid: unknown[] = []
    for (const r of raw) {
      if (SCHEMAS[table].safeParse(r).success) valid.push(r)
      else invalid++
    }
    ;(rows[table] as unknown[]) = valid
  }

  const exportedAt = typeof obj.exportedAt === 'string' ? obj.exportedAt : undefined
  return { ok: true, rows, exportedAt, invalid }
}

export interface RestorePlan {
  /** Rows to write: new ones, plus transactions whose backup copy is newer. */
  rows: LedgerRows
  added: Record<TableName, number>
  updated: Record<TableName, number>
  /** Backup members/categories folded into an existing local one by name. */
  matchedByName: number
}

export function isEmptyPlan(plan: RestorePlan): boolean {
  return Object.values(plan.rows).every((r) => r.length === 0)
}

export function planRestore(backup: LedgerRows, local: LedgerRows): RestorePlan {
  let matchedByName = 0

  // ---- Members: backup id → local id ----
  const localMembers = new Map(local.members.map((m) => [m.id, m]))
  const localSelf = local.members.find((m) => m.isSelf && !m.deletedAt)
  const liveLocalByName = new Map(
    local.members.filter((m) => !m.deletedAt).map((m) => [normalizeMemberName(m.name), m.id]),
  )
  const memberId = new Map<string, string>()
  const newMembers: Member[] = []
  for (const m of backup.members) {
    if (m.isSelf) {
      // Every device has exactly one 「我」 (spec §6.5); the backup's is this device's.
      if (localSelf) memberId.set(m.id, localSelf.id)
      continue
    }
    if (localMembers.has(m.id)) {
      memberId.set(m.id, m.id)
      continue
    }
    const sameName = !m.deletedAt && liveLocalByName.get(normalizeMemberName(m.name))
    if (sameName) {
      memberId.set(m.id, sameName)
      matchedByName++
      continue
    }
    memberId.set(m.id, m.id)
    newMembers.push(m)
  }
  const mapMember = (id: string) => memberId.get(id) ?? id

  // ---- Categories: parents first, so a child's parent is already mapped ----
  const localCats = new Map(local.categories.map((c) => [c.id, c]))
  const categoryId = new Map<string, string>()
  const newCategories: Category[] = []
  const ordered = [...backup.categories].sort((a, b) => Number(!!a.parentId) - Number(!!b.parentId))
  for (const c of ordered) {
    const parentId = c.parentId ? (categoryId.get(c.parentId) ?? c.parentId) : undefined
    if (localCats.has(c.id)) {
      categoryId.set(c.id, c.id)
      continue
    }
    const sameName = c.deletedAt
      ? undefined
      : local.categories.find((x) => !x.deletedAt && x.name === c.name && x.parentId === parentId)
    if (sameName) {
      categoryId.set(c.id, sameName.id)
      matchedByName++
      continue
    }
    categoryId.set(c.id, c.id)
    newCategories.push(parentId ? { ...c, parentId } : c)
  }
  const mapCategory = (id: string) => categoryId.get(id) ?? id

  // ---- Rewrite references, then merge ----
  const txs = backup.transactions.map((t) => ({
    ...t,
    category: mapCategory(t.category),
    paidBy: mapMember(t.paidBy),
    members: t.members.map(mapMember),
    splits: t.splits.map((s) => ({ ...s, member: mapMember(s.member) })),
  }))
  const localTx = new Map(local.transactions.map((t) => [t.id, t]))
  const newTxs: Transaction[] = []
  let txUpdated = 0
  for (const t of txs) {
    const mine = localTx.get(t.id)
    if (!mine) newTxs.push(t)
    else if (t.updatedAt > mine.updatedAt) {
      newTxs.push(t)
      txUpdated++
    }
  }

  const localSt = new Set(local.settlements.map((s) => s.id))
  const newSettlements = backup.settlements
    .filter((s) => !localSt.has(s.id))
    .map((s) => ({ ...s, from: mapMember(s.from), to: mapMember(s.to) }))

  const localGroups = new Set(local.groups.map((g) => g.id))
  const newGroups = backup.groups
    .filter((g) => !localGroups.has(g.id))
    .map((g) => ({ ...g, memberIds: [...new Set(g.memberIds.map(mapMember))] }))

  const localMonths = new Set(local.budgets.map((b) => b.month))
  const newBudgets = backup.budgets
    .filter((b) => !localMonths.has(b.month))
    .map((b) => ({
      ...b,
      byCategory: Object.fromEntries(
        Object.entries(b.byCategory).map(([k, v]) => [mapCategory(k), v]),
      ),
    }))

  const rows: LedgerRows = {
    transactions: newTxs,
    settlements: newSettlements,
    members: newMembers,
    groups: newGroups,
    categories: newCategories,
    budgets: newBudgets,
  }
  const added = Object.fromEntries(
    (Object.keys(rows) as TableName[]).map((k) => [k, rows[k].length]),
  ) as Record<TableName, number>
  added.transactions -= txUpdated
  const updated = {
    transactions: txUpdated,
    settlements: 0,
    members: 0,
    groups: 0,
    categories: 0,
    budgets: 0,
  }
  return { rows, added, updated, matchedByName }
}

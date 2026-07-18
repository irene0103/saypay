/**
 * The single ledger store — spec §6.2, §6.3.1.
 *
 * Two invariants this store exists to protect:
 *
 * 1. BALANCES ARE NEVER STORED. Transaction and Settlement are the only facts; every
 *    balance, total and matrix below is a computed getter. Persisting a balance is how
 *    you get a ledger that disagrees with its own transactions (spec §6.2).
 *
 * 2. Transactions stay RESIDENT IN MEMORY. Recomputing the debt matrix over 5k rows is
 *    ~5ms; re-reading and deserializing them from IndexedDB is ~100ms. So the matrix is
 *    rebuilt from memory on every write and IndexedDB is only re-read when sync pulls
 *    new rows (spec §6.3.1).
 */
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { db, type OutboxEntry } from '@/db'
import { balancesFor, buildDebtMap, net } from '@/core/debt'
import { localMonthKey, periodStats, spendByCategory, rollUpToParents, streakDays } from '@/core/stats'
import {
  budgetSchema,
  categorySchema,
  memberSchema,
  normalizeMemberName,
  settlementSchema,
  transactionSchema,
} from '@/schemas'
import type {
  Budget,
  Category,
  Cents,
  Group,
  Member,
  Settlement,
  Transaction,
} from '@/core/types'

export const useLedgerStore = defineStore('ledger', () => {
  // ---- Facts (the only persisted state) ----
  const transactions = ref<Transaction[]>([])
  const settlements = ref<Settlement[]>([])
  const members = ref<Member[]>([])
  const groups = ref<Group[]>([])
  const categories = ref<Category[]>([])
  const budgets = ref<Budget[]>([])
  const loaded = ref(false)

  // ---- Identity ----
  /** "Me" is identified by the isSelf flag, never by a 'me' string literal (spec §4.2). */
  const self = computed(() => members.value.find((m) => m.isSelf && !m.deletedAt))
  const selfId = computed(() => self.value?.id ?? '')

  // ---- Live rows (soft-deleted rows are invisible to every stat, spec §3.12 L3) ----
  const liveTransactions = computed(() => transactions.value.filter((t) => !t.deletedAt))
  const liveSettlements = computed(() => settlements.value.filter((s) => !s.deletedAt))
  const liveMembers = computed(() => members.value.filter((m) => !m.deletedAt))
  const liveCategories = computed(() => categories.value.filter((c) => !c.deletedAt))

  // ---- Derived: debt ----
  const debtMap = computed(() => buildDebtMap(liveTransactions.value, liveSettlements.value))
  const balances = computed(() => balancesFor(debtMap.value, selfId.value))

  /** Pairwise net between me and one person. > 0 → they owe me. */
  function netWith(memberId: string): Cents {
    return net(debtMap.value, memberId, selfId.value)
  }

  // ---- Derived: period stats ----
  const currentMonth = ref(localMonthKey(new Date()))

  const monthTransactions = computed(() =>
    liveTransactions.value.filter((t) => localMonthKey(new Date(t.date)) === currentMonth.value),
  )

  const monthStats = computed(() => periodStats(monthTransactions.value, selfId.value))

  const streak = computed(() => streakDays(liveTransactions.value))

  const categoryById = computed(() => new Map(liveCategories.value.map((c) => [c.id, c])))
  const parentCategories = computed(() => liveCategories.value.filter((c) => !c.parentId))

  /** Spend per LEAF category, in 實際花費 terms (spec §3.4). */
  const monthSpendByCategory = computed(() =>
    spendByCategory(monthTransactions.value, selfId.value),
  )

  /** Spend rolled up to PARENT categories — budgets only exist at parent level (spec §3.5). */
  const monthSpendByParent = computed(() =>
    rollUpToParents(
      monthSpendByCategory.value,
      (id) => categoryById.value.get(id)?.parentId,
    ),
  )

  const currentBudget = computed(() => budgets.value.find((b) => b.month === currentMonth.value))

  // ---- Load ----
  async function load() {
    const [tx, st, mem, grp, cat, bud] = await Promise.all([
      db.transactions.toArray(),
      db.settlements.toArray(),
      db.members.toArray(),
      db.groups.toArray(),
      db.categories.toArray(),
      db.budgets.toArray(),
    ])
    transactions.value = tx
    settlements.value = st
    members.value = mem
    groups.value = grp
    categories.value = cat
    budgets.value = bud
    loaded.value = true
  }

  // ---- Writes (spec §6.1) ----
  // The order is fixed: IndexedDB first (durable), then the in-memory array (so the UI and
  // the debt matrix update this tick), then the outbox (the pending push to Supabase). The
  // outbox row is written even though sync isn't built yet — it keeps the local ledger and
  // the eventual cloud in agreement the moment sync lands, at the cost of one extra row.
  async function enqueue(table: OutboxEntry['table'], rowId: string, op: OutboxEntry['op']) {
    await db.outbox.put({
      id: crypto.randomUUID(),
      table,
      rowId,
      op,
      queuedAt: new Date().toISOString(),
    })
  }

  /** Replace the row with this id in a ref array, or append it if new. */
  function upsertLocal<T extends { id: string }>(arr: { value: T[] }, row: T) {
    const i = arr.value.findIndex((r) => r.id === row.id)
    if (i >= 0) arr.value.splice(i, 1, row)
    else arr.value.push(row)
  }

  /**
   * A plain deep copy. Rows read back out of the store are Vue reactive proxies, and Dexie
   * structured-clones on write — which throws (DataCloneError) on a Proxy. Every value here
   * is JSON-safe (ISO strings, numbers, arrays), so a round trip is the simplest way to
   * hand Dexie a clean object. Callers that build fresh objects don't need it.
   */
  function plain<T>(row: T): T {
    return JSON.parse(JSON.stringify(row))
  }

  async function saveTransaction(tx: Transaction) {
    // Client-side validation is a UX guard, not a trust boundary — Supabase re-validates
    // (spec §6.5). Throwing here surfaces a programming error, not user input we let slip.
    transactionSchema.parse(tx)
    await db.transactions.put(tx)
    upsertLocal(transactions, tx)
    await enqueue('transactions', tx.id, 'upsert')
  }

  async function saveSettlement(st: Settlement) {
    settlementSchema.parse(st)
    await db.settlements.put(st)
    upsertLocal(settlements, st)
    await enqueue('settlements', st.id, 'upsert')
  }

  /**
   * Soft delete only — a hard DELETE would resurrect on the next sync pull (spec §6.1).
   * Returns the tombstoned row so the Undo toast can hand it straight to `restore` (L2).
   */
  async function softDeleteTransaction(id: string): Promise<Transaction | undefined> {
    const row = transactions.value.find((t) => t.id === id)
    if (!row) return
    const tombstoned = plain({
      ...row,
      deletedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    await db.transactions.put(tombstoned)
    upsertLocal(transactions, tombstoned)
    await enqueue('transactions', id, 'upsert')
    return tombstoned
  }

  async function softDeleteSettlement(id: string): Promise<Settlement | undefined> {
    const row = settlements.value.find((s) => s.id === id)
    if (!row) return
    const tombstoned = plain({ ...row, deletedAt: new Date().toISOString() })
    await db.settlements.put(tombstoned)
    upsertLocal(settlements, tombstoned)
    await enqueue('settlements', id, 'upsert')
    return tombstoned
  }

  /** Undo a soft delete (spec §3.12 L2) by clearing the tombstone. */
  async function restoreTransaction(id: string) {
    const row = transactions.value.find((t) => t.id === id)
    if (!row) return
    const restored = plain({ ...row, updatedAt: new Date().toISOString() })
    delete restored.deletedAt
    await db.transactions.put(restored)
    upsertLocal(transactions, restored)
    await enqueue('transactions', id, 'upsert')
  }

  // ---- Categories (spec §4.6) ----
  async function saveCategory(cat: Category) {
    categorySchema.parse(cat)
    const row = plain(cat)
    await db.categories.put(row)
    upsertLocal(categories, row)
    await enqueue('categories', row.id, 'upsert')
  }

  /**
   * Deleting a category is soft when anything still references it (spec §3.6): existing
   * transactions keep showing it, but it can't be picked for new ones. A parent can't be
   * removed while it still has live children — the children would be orphaned.
   */
  async function deleteCategory(id: string): Promise<{ ok: boolean; reason?: string }> {
    const hasChildren = liveCategories.value.some((c) => c.parentId === id)
    if (hasChildren) return { ok: false, reason: '請先刪除底下的子分類' }

    const row = categories.value.find((c) => c.id === id)
    if (!row) return { ok: false, reason: '找不到分類' }

    const tombstoned = plain({ ...row, deletedAt: new Date().toISOString() })
    await db.categories.put(tombstoned)
    upsertLocal(categories, tombstoned)
    await enqueue('categories', id, 'upsert')
    return { ok: true }
  }

  // ---- Members (spec §4.2, §3.6) ----
  /**
   * Names must be unique among non-deleted members (spec §4.2): the CSV export uses the
   * name as a column header, and two identical avatars are indistinguishable in the split
   * UI. Comparison is on the normalized form (trim → collapse whitespace → NFC) but stays
   * case-sensitive — 中文-first, over-merging would be wrong.
   */
  async function saveMember(m: Member): Promise<{ ok: boolean; reason?: string }> {
    const name = normalizeMemberName(m.name)
    const clash = liveMembers.value.some(
      (x) => x.id !== m.id && normalizeMemberName(x.name) === name,
    )
    if (clash) return { ok: false, reason: `已有成員叫 ${name}` }

    const row = plain({ ...m, name })
    memberSchema.parse(row)
    await db.members.put(row)
    upsertLocal(members, row)
    await enqueue('members', row.id, 'upsert')
    return { ok: true }
  }

  /**
   * Delete protection (spec §3.6): a member with a non-zero balance can't be removed —
   * settle first. Self is never deletable (exactly one isSelf must remain). Otherwise soft
   * delete, which also releases the name for reuse.
   */
  async function deleteMember(id: string): Promise<{ ok: boolean; reason?: string }> {
    const m = members.value.find((x) => x.id === id)
    if (!m) return { ok: false, reason: '找不到成員' }
    if (m.isSelf) return { ok: false, reason: '無法刪除自己' }
    if (netWith(id) !== 0) return { ok: false, reason: '請先結清這位成員的款項' }

    const tombstoned = plain({ ...m, deletedAt: new Date().toISOString() })
    await db.members.put(tombstoned)
    upsertLocal(members, tombstoned)
    await enqueue('members', id, 'upsert')
    return { ok: true }
  }

  // ---- Groups (spec §3.3.2) — a group is a view/filter over transactions, not a ledger ----
  async function saveGroup(g: Group) {
    const row = plain(g)
    await db.groups.put(row)
    upsertLocal(groups, row)
    await enqueue('groups', row.id, 'upsert')
  }

  /**
   * Deleting a group keeps its transactions (their groupId is cleared) and revokes any of
   * its share links (spec §3.6). Share links aren't built yet, so only the first two apply.
   */
  async function deleteGroup(id: string) {
    const row = groups.value.find((g) => g.id === id)
    if (!row) return
    const tombstoned = plain({ ...row, deletedAt: new Date().toISOString() })
    await db.groups.put(tombstoned)
    upsertLocal(groups, tombstoned)
    await enqueue('groups', id, 'upsert')

    // Detach the group's transactions so they survive as ungrouped rows.
    for (const t of transactions.value.filter((x) => x.groupId === id && !x.deletedAt)) {
      const detached = plain({ ...t, groupId: undefined, updatedAt: new Date().toISOString() })
      delete detached.groupId
      await db.transactions.put(detached)
      upsertLocal(transactions, detached)
      await enqueue('transactions', t.id, 'upsert')
    }
  }

  // ---- Budget (spec §3.5) ----
  /** One budget row per month, keyed by `YYYY-MM`. byCategory keys are PARENT categories. */
  async function saveBudget(b: Budget) {
    budgetSchema.parse(b)
    const row = plain(b)
    await db.budgets.put(row)
    const i = budgets.value.findIndex((x) => x.month === row.month)
    if (i >= 0) budgets.value.splice(i, 1, row)
    else budgets.value.push(row)
    await enqueue('budgets', row.month, 'upsert')
  }

  /** Drop every in-memory row. Used on logout, where residue would be a data leak (spec §3.12). */
  function $reset() {
    transactions.value = []
    settlements.value = []
    members.value = []
    groups.value = []
    categories.value = []
    budgets.value = []
    loaded.value = false
  }

  return {
    transactions,
    settlements,
    members,
    groups,
    categories,
    budgets,
    loaded,
    currentMonth,

    self,
    selfId,
    liveTransactions,
    liveSettlements,
    liveMembers,
    liveCategories,
    parentCategories,
    categoryById,

    debtMap,
    balances,
    netWith,

    monthTransactions,
    monthStats,
    monthSpendByCategory,
    monthSpendByParent,
    currentBudget,
    streak,

    load,
    saveTransaction,
    saveSettlement,
    softDeleteTransaction,
    softDeleteSettlement,
    restoreTransaction,
    saveCategory,
    deleteCategory,
    saveMember,
    deleteMember,
    saveBudget,
    saveGroup,
    deleteGroup,
    $reset,
  }
})

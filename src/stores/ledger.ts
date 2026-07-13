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

import { db } from '@/db'
import { balancesFor, buildDebtMap, net } from '@/core/debt'
import { localMonthKey, periodStats, spendByCategory, rollUpToParents, streakDays } from '@/core/stats'
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
    $reset,
  }
})

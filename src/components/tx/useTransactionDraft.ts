/**
 * TransactionDraft — the shared state model behind BOTH the 1d form and the 1e parse
 * confirmation card (spec §3.2 架構要求).
 *
 * They are two renderings of one draft, not two features: the user must be able to bounce
 * between them without losing what they typed. This is also what makes the offline
 * fallback work, and what will let the natural-language layer be swapped for an LLM later
 * without touching the form.
 */
import { computed, ref } from 'vue'

import { computeSplits } from '@/core/split'
import { MAX_MEMBERS, type Cents, type SplitItem, type SplitType, type Transaction, type TxType } from '@/core/types'

export interface TransactionDraft {
  title: string
  amount: Cents
  type: TxType
  category: string
  date: string
  note: string

  isSplit: boolean
  paidBy: string
  members: string[]
  splitType: SplitType
  /** custom → cents per member; percentage → percent per member. Indexed like `members`. */
  values: number[]

  groupId?: string
  /** Fields the NL parser guessed rather than read — rendered with a dashed underline (§3.2.2). */
  inferred: Set<keyof TransactionDraft>
}

export function emptyDraft(selfId: string): TransactionDraft {
  return {
    title: '',
    amount: 0,
    type: 'expense',
    category: '',
    date: new Date().toISOString(),
    note: '',
    isSplit: false,
    paidBy: selfId,
    members: [selfId],
    splitType: 'equal',
    values: [],
    inferred: new Set(),
  }
}

export function useTransactionDraft(selfId: () => string) {
  const draft = ref<TransactionDraft>(emptyDraft(selfId()))

  /** Live preview of the split — recomputed on every keystroke (spec §3.2.1). */
  const splits = computed<SplitItem[]>(() => {
    const d = draft.value
    if (!d.isSplit || d.amount <= 0 || d.members.length === 0) return []
    try {
      return computeSplits({
        amount: d.amount,
        paidBy: d.paidBy,
        members: d.members,
        splitType: d.splitType,
        values: d.splitType === 'equal' ? undefined : d.values,
      })
    } catch {
      // Mid-edit the values legitimately don't sum yet; `error` below is what the user sees.
      return []
    }
  })

  /** The blocking validation messages from spec §3.2.1. */
  const error = computed<string | null>(() => {
    const d = draft.value
    if (d.amount <= 0) return null
    if (!d.isSplit) return null

    if (d.members.length === 0) return '選一位參與者才能分帳'
    if (d.members.length > MAX_MEMBERS) return `單筆最多 ${MAX_MEMBERS} 人`

    if (d.splitType === 'custom') {
      const sum = d.values.reduce((a, b) => a + (b || 0), 0)
      if (sum < d.amount) return `還差 $${Math.round((d.amount - sum) / 100)}`
      if (sum > d.amount) return `超出 $${Math.round((sum - d.amount) / 100)}`
    }

    if (d.splitType === 'percentage') {
      const sum = d.values.reduce((a, b) => a + (b || 0), 0)
      if (Math.abs(sum - 100) > 1e-9) return `目前 ${Math.round(sum)}%`
    }

    return null
  })

  const canSave = computed(() => {
    const d = draft.value
    return d.amount > 0 && d.title.trim().length > 0 && d.category !== '' && error.value === null
  })

  /** Assemble the persistable row. Ids and timestamps are client-generated (spec §6.4). */
  function toTransaction(ownerId: string, existing?: Transaction): Transaction {
    const d = draft.value
    const now = new Date().toISOString()
    const isSplit = d.isSplit && d.type === 'expense' // income can never be split (§5.6)

    return {
      id: existing?.id ?? crypto.randomUUID(),
      ownerId,
      title: d.title.trim(),
      amount: d.amount,
      type: d.type,
      category: d.category,
      date: d.date,
      note: d.note.trim() || undefined,
      isSplit,
      paidBy: isSplit ? d.paidBy : selfId(),
      members: isSplit ? [...d.members] : [selfId()],
      splitType: d.splitType,
      splits: isSplit ? splits.value : [{ member: selfId(), shareAmount: d.amount }],
      groupId: d.groupId,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
  }

  /**
   * "儲存並再記一筆" (spec §3.2.1): keep category / members / paidBy, clear amount and note.
   * The split toggle is deliberately NOT remembered — carrying it over is how a personal
   * coffee silently becomes a split bill.
   */
  function resetForNext() {
    const d = draft.value
    draft.value = {
      ...emptyDraft(selfId()),
      category: d.category,
      members: [...d.members],
      paidBy: d.paidBy,
      isSplit: false,
    }
  }

  function reset() {
    draft.value = emptyDraft(selfId())
  }

  function loadFrom(tx: Transaction) {
    draft.value = {
      title: tx.title,
      amount: tx.amount,
      type: tx.type,
      category: tx.category,
      date: tx.date,
      note: tx.note ?? '',
      isSplit: tx.isSplit,
      paidBy: tx.paidBy,
      members: [...tx.members],
      splitType: tx.splitType,
      values:
        tx.splitType === 'custom' ? tx.members.map((m) => shareOf(tx.splits, m)) : [],
      groupId: tx.groupId,
      inferred: new Set(),
    }
  }

  return { draft, splits, error, canSave, toTransaction, resetForNext, reset, loadFrom }
}

function shareOf(splits: SplitItem[], member: string): Cents {
  return splits.find((s) => s.member === member)?.shareAmount ?? 0
}

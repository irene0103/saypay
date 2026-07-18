/**
 * SayPay domain types — spec §4.
 *
 * All money is integer CENTS. 1 元 = 100. Never use floats for money.
 */

/** Integer cents. */
export type Cents = number

export const MAX_MEMBERS = 20

export type SplitType = 'equal' | 'custom' | 'percentage'
export type TxType = 'income' | 'expense'

/** spec §4.2 — a member is a pure label; split counterparties never log in. */
export interface Member {
  id: string
  name: string
  avatarColor: string
  /** Exactly one member has isSelf === true. */
  isSelf: boolean
  deletedAt?: string
}

/** spec §4.4 — Σ splits[].shareAmount === transaction.amount */
export interface SplitItem {
  member: string
  shareAmount: Cents
}

/** spec §4.3 */
export interface Transaction {
  id: string
  ownerId: string
  title: string
  amount: Cents
  type: TxType
  /** categoryId — always a leaf node (spec §4.6). */
  category: string
  /** ISO datetime, local timezone. */
  date: string
  note?: string

  // Split fields — only meaningful when type === 'expense' (spec §5.6).
  isSplit: boolean
  /** memberId. Single payer; may be absent from `members` (pure 代墊). */
  paidBy: string
  /** memberIds, 1..20. */
  members: string[]
  splitType: SplitType
  splits: SplitItem[]

  /** Single-valued. A transaction belongs to at most one group (spec §4.3). */
  groupId?: string

  createdAt: string
  updatedAt: string
  /** Soft-delete tombstone — required for sync (spec §6.1). */
  deletedAt?: string
}

/** spec §4.5 — settlement is an independent ledger entry, never edits a transaction. */
export interface Settlement {
  id: string
  ownerId: string
  /** memberId of who pays. */
  from: string
  /** memberId of who receives. */
  to: string
  /** > 0 */
  amount: Cents
  at: string
  note?: string
  deletedAt?: string
}

/** spec §4.6 — no budget field; groups are a view, not a ledger (spec §3.3). */
export interface Group {
  id: string
  name: string
  memberIds: string[]
  createdAt: string
  deletedAt?: string
}

/** spec §4.6 — two levels only; parentId may not itself have a parentId. */
export interface Category {
  id: string
  name: string
  icon: string
  parentId?: string
  sortOrder: number
  deletedAt?: string
}

/** spec §3.5 — personal monthly budget only. byCategory keys are PARENT category ids. */
export interface Budget {
  /** YYYY-MM */
  month: string
  total: Cents
  byCategory: Record<string, Cents>
}

/** spec §3.11 */
export type ShareScope = 'group' | 'member'
/** `amounts` is reserved (backlog, decision #42) — the enum ships with three values
 * so enabling it later needs no migration. */
export type ShareDetailLevel = 'total' | 'amounts' | 'full'
export type ShareRevokedReason = 'manual' | 'settled' | 'group_deleted'

export interface ShareLink {
  id: string
  /** nanoid(16) — unguessable. */
  token: string
  scope: ShareScope
  /** groupId or memberId. */
  targetId: string
  detailLevel: ShareDetailLevel
  createdAt: string
  /** Sliding: reset to now + 30d on each view. Written by backend RPC only (spec §3.11). */
  expiresAt: string
  revokedAt?: string
  revokedReason?: ShareRevokedReason
  viewCount: number
  lastViewedAt?: string
}

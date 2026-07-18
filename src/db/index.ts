/**
 * Local-first storage — spec §6.1. IndexedDB via Dexie.
 *
 * LocalStorage is NOT an option here: sync API blocks the main thread, 5MB cap,
 * no indexes, no transactions (spec §6.1).
 *
 * Deletes are ALWAYS soft (`deletedAt` tombstone). A hard DELETE would resurrect the
 * row on the next sync pull.
 */
import Dexie, { type EntityTable } from 'dexie'
import type { Budget, Category, Group, Member, Settlement, Transaction } from '@/core/types'

/** An outbox row is a pending push to Supabase (spec §6.1 sync strategy). */
export interface OutboxEntry {
  id: string
  table: 'transactions' | 'settlements' | 'groups' | 'categories' | 'members' | 'budgets'
  rowId: string
  op: 'upsert' | 'delete'
  /** ISO. Ordering for FIFO flush. */
  queuedAt: string
}

export class SayPayDB extends Dexie {
  transactions!: EntityTable<Transaction, 'id'>
  settlements!: EntityTable<Settlement, 'id'>
  members!: EntityTable<Member, 'id'>
  groups!: EntityTable<Group, 'id'>
  categories!: EntityTable<Category, 'id'>
  budgets!: EntityTable<Budget, 'month'>
  outbox!: EntityTable<OutboxEntry, 'id'>

  constructor() {
    super('saypay')
    this.version(1).stores({
      // `date` and `updatedAt` are indexed: date drives the ledger/calendar queries,
      // updatedAt drives incremental sync pulls.
      transactions: 'id, date, updatedAt, category, groupId, deletedAt',
      settlements: 'id, at, from, to, updatedAt, deletedAt',
      members: 'id, name, isSelf, deletedAt',
      groups: 'id, name, deletedAt',
      categories: 'id, parentId, sortOrder, deletedAt',
      budgets: 'month',
      outbox: 'id, queuedAt, table',
    })
  }
}

export const db = new SayPayDB()

/**
 * Ask the browser to keep our data (spec §3.12 L1).
 * Returns false when denied — the caller should then nudge "add to home screen",
 * which both raises the grant odds and exempts us from Safari's 7-day ITP eviction.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false
  try {
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

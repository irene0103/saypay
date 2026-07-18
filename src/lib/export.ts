/**
 * Export — spec §3.12 L4. This ships in Phase 0 because it is the ONLY data-rescue path
 * that survives every other failure (browser eviction, a bad sync, a cloud outage).
 *
 * JSON is the restorable backup. CSV is the human-readable one, in a WIDE format: one row
 * per transaction, one column per member holding that person's shareAmount.
 */
import { db } from '@/db'
import type { Member, Settlement, Transaction } from '@/core/types'

const SCHEMA_VERSION = 1

/**
 * Download adapter (spec §8.2). Web uses a Blob URL; a Capacitor build swaps in the
 * Filesystem plugin here and nothing else changes.
 */
export function download(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export async function exportJson(): Promise<string> {
  const [transactions, settlements, members, groups, categories, budgets] = await Promise.all([
    db.transactions.toArray(),
    db.settlements.toArray(),
    db.members.toArray(),
    db.groups.toArray(),
    db.categories.toArray(),
    db.budgets.toArray(),
  ])
  return JSON.stringify(
    {
      schemaVersion: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      transactions,
      settlements,
      members,
      groups,
      categories,
      budgets,
    },
    null,
    2,
  )
}

/** Two members may share a display name only across a soft-delete boundary; disambiguate. */
function columnNames(members: Member[]): Map<string, string> {
  const seen = new Map<string, number>()
  for (const m of members) seen.set(m.name, (seen.get(m.name) ?? 0) + 1)

  const out = new Map<string, string>()
  for (const m of members) {
    out.set(m.id, (seen.get(m.name) ?? 0) > 1 ? `${m.name} (${m.id.slice(0, 4)})` : m.name)
  }
  return out
}

function csvCell(v: string | number | undefined): string {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function buildTransactionsCsv(
  transactions: Transaction[],
  members: Member[],
  categoryName: (id: string) => string,
): string {
  const live = transactions.filter((t) => !t.deletedAt)

  // Only members who actually appear — a fixed 20 columns would be mostly empty (spec §3.12 L4).
  const present = new Set<string>()
  for (const t of live) for (const s of t.splits) present.add(s.member)
  const cols = members.filter((m) => present.has(m.id))
  const names = columnNames(cols)

  const header = [
    'date',
    'title',
    'amount',
    'type',
    'category',
    'note',
    'is_split',
    'paid_by',
    ...cols.map((m) => names.get(m.id)!),
  ]

  const rows = live.map((t) => {
    const shareOf = (id: string) => t.splits.find((s) => s.member === id)?.shareAmount
    return [
      t.date.slice(0, 10),
      t.title,
      Math.round(t.amount / 100),
      t.type,
      categoryName(t.category),
      t.note ?? '',
      t.isSplit ? 'TRUE' : 'FALSE',
      names.get(t.paidBy) ?? '',
      // Blank means "did not participate" — distinct from a $0 share.
      ...cols.map((m) => {
        const share = shareOf(m.id)
        return share === undefined ? '' : Math.round(share / 100)
      }),
    ]
  })

  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n')
}

export function buildSettlementsCsv(
  settlements: Settlement[],
  memberName: (id: string) => string,
): string {
  const header = ['date', 'from', 'to', 'amount', 'note']
  const rows = settlements
    .filter((s) => !s.deletedAt)
    .map((s) => [
      s.at.slice(0, 10),
      memberName(s.from),
      memberName(s.to),
      Math.round(s.amount / 100),
      s.note ?? '',
    ])
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n')
}

/** Excel reads a BOM-less UTF-8 CSV as mojibake for Chinese text (spec §3.12 L4). */
export function withBom(csv: string): string {
  return `﻿${csv}`
}

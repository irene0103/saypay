/**
 * Zod schemas — spec §6.5. Every write goes through these.
 *
 * Supabase must re-validate independently (DB constraint / trigger): client-side
 * validation is a UX affordance, not a security boundary.
 */
import { z } from 'zod'
import { MAX_MEMBERS } from '@/core/types'

const cents = z.number().int()
const positiveCents = cents.positive()
const isoDate = z.string().min(1)

export const splitItemSchema = z.object({
  member: z.string().min(1),
  shareAmount: cents.nonnegative(),
})

export const memberSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1),
  avatarColor: z.string().min(1),
  isSelf: z.boolean(),
  deletedAt: isoDate.optional(),
})

export const transactionSchema = z
  .object({
    id: z.string().min(1),
    ownerId: z.string().min(1),
    title: z.string().trim().min(1),
    amount: positiveCents,
    type: z.enum(['income', 'expense']),
    category: z.string().min(1),
    date: isoDate,
    note: z.string().optional(),

    isSplit: z.boolean(),
    paidBy: z.string().min(1),
    members: z.array(z.string().min(1)).max(MAX_MEMBERS),
    splitType: z.enum(['equal', 'custom', 'percentage']),
    splits: z.array(splitItemSchema).max(MAX_MEMBERS),

    groupId: z.string().optional(),
    createdAt: isoDate,
    updatedAt: isoDate,
    deletedAt: isoDate.optional(),
  })
  .superRefine((t, ctx) => {
    if (!t.isSplit) return

    // Income cannot be split (spec §5.6).
    if (t.type === 'income') {
      ctx.addIssue({ code: 'custom', path: ['isSplit'], message: '收入不可分帳' })
      return
    }
    if (t.splits.length < 1) {
      ctx.addIssue({ code: 'custom', path: ['splits'], message: '分帳需至少一位參與者' })
      return
    }
    // The invariant everything else depends on (spec §4.4).
    const sum = t.splits.reduce((a, s) => a + s.shareAmount, 0)
    if (sum !== t.amount) {
      ctx.addIssue({
        code: 'custom',
        path: ['splits'],
        message: `分帳金額加總 ${sum} ≠ 總額 ${t.amount}`,
      })
    }
    const dupes = new Set(t.splits.map((s) => s.member)).size !== t.splits.length
    if (dupes) {
      ctx.addIssue({ code: 'custom', path: ['splits'], message: '參與者重複' })
    }
  })

export const settlementSchema = z.object({
  id: z.string().min(1),
  ownerId: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  amount: positiveCents,
  at: isoDate,
  note: z.string().optional(),
  deletedAt: isoDate.optional(),
})

export const groupSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1),
  memberIds: z.array(z.string().min(1)),
  createdAt: isoDate,
  deletedAt: isoDate.optional(),
})

export const categorySchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1),
  icon: z.string().min(1),
  parentId: z.string().optional(),
  sortOrder: z.number().int(),
  deletedAt: isoDate.optional(),
})

export const budgetSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, 'month must be YYYY-MM'),
  total: cents.nonnegative(),
  byCategory: z.record(z.string(), cents.nonnegative()),
})

/**
 * Exactly one member is `me` (spec §6.5). Enforced over the whole collection, so it
 * cannot live on memberSchema.
 */
export function assertExactlyOneSelf(members: { isSelf: boolean; deletedAt?: string }[]): void {
  const selves = members.filter((m) => m.isSelf && !m.deletedAt)
  if (selves.length !== 1) {
    throw new Error(`expected exactly one isSelf member, got ${selves.length}`)
  }
}

/**
 * Member names must be unique among non-deleted members (spec §4.2).
 * Normalize: trim → collapse whitespace → NFC. Case IS significant.
 * CSV export uses the member name as a column header, so a duplicate would collide.
 */
export function normalizeMemberName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').normalize('NFC')
}

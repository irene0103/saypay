/**
 * Split calculation — spec §5.1, §5.2.
 * Ported from doc/rules/split.js (28 tests, incl. fuzz). Algorithm unchanged.
 */
import { MAX_MEMBERS, type Cents, type SplitItem, type SplitType } from './types'

export interface ComputeSplitsInput {
  amount: Cents
  paidBy: string
  members: string[]
  splitType: SplitType
  /** 'custom' → cents per member; 'percentage' → percent per member. Order matches `members`. */
  values?: number[]
}

export function computeSplits({
  amount,
  paidBy,
  members,
  splitType,
  values,
}: ComputeSplitsInput): SplitItem[] {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error(`amount must be a positive integer (cents), got ${amount}`)
  }
  if (!Array.isArray(members) || members.length < 1) {
    throw new Error('members must have at least 1 participant')
  }
  if (members.length > MAX_MEMBERS) {
    throw new Error(`members exceeds MAX_MEMBERS (${MAX_MEMBERS})`)
  }
  if (new Set(members).size !== members.length) {
    throw new Error('members contains duplicates')
  }

  switch (splitType) {
    case 'equal':
      return splitEqual(amount, paidBy, members)
    case 'custom':
      return splitCustom(amount, members, values)
    case 'percentage':
      return splitPercentage(amount, paidBy, members, values)
    default:
      throw new Error(`unknown splitType: ${splitType}`)
  }
}

/**
 * The remainder carrier: the payer if they participate, else members[0].
 * spec §5.2 — the payer already fronted the cash, so 1..19 extra cents is imperceptible,
 * and routing it to one person guarantees Σ shares === amount.
 */
function remainderCarrier(paidBy: string, members: string[]): string {
  // computeSplits already rejected an empty members[], so members[0] is present.
  return members.includes(paidBy) ? paidBy : members[0]!
}

function splitEqual(amount: Cents, paidBy: string, members: string[]): SplitItem[] {
  const n = members.length
  const base = Math.floor(amount / n)
  const remainder = amount - base * n
  const carrier = remainderCarrier(paidBy, members)

  const splits = members.map((member) => ({
    member,
    shareAmount: base + (member === carrier ? remainder : 0),
  }))
  assertSum(splits, amount)
  return splits
}

function splitCustom(amount: Cents, members: string[], values?: number[]): SplitItem[] {
  if (!Array.isArray(values) || values.length !== members.length) {
    throw new Error('custom split requires values[] matching members length')
  }
  for (const v of values) {
    if (!Number.isInteger(v) || v < 0) {
      throw new Error(`custom share must be a non-negative integer (cents), got ${v}`)
    }
  }
  const sum = values.reduce((a, b) => a + b, 0)
  if (sum !== amount) {
    throw new Error(`custom shares sum to ${sum}, expected ${amount}`)
  }
  const splits = members.map((member, i) => ({ member, shareAmount: values[i]! }))
  assertSum(splits, amount)
  return splits
}

function splitPercentage(
  amount: Cents,
  paidBy: string,
  members: string[],
  values?: number[],
): SplitItem[] {
  if (!Array.isArray(values) || values.length !== members.length) {
    throw new Error('percentage split requires values[] matching members length')
  }
  const pctSum = values.reduce((a, b) => a + b, 0)
  if (Math.abs(pctSum - 100) > 1e-9) {
    throw new Error(`percentages sum to ${pctSum}, expected 100`)
  }

  const floors = members.map((member, i) => ({
    member,
    floor: Math.floor((amount * values[i]!) / 100),
  }))
  const allocated = floors.reduce((a, r) => a + r.floor, 0)
  const leftover = amount - allocated
  const carrier = remainderCarrier(paidBy, members)

  const splits = floors.map((r) => ({
    member: r.member,
    shareAmount: r.floor + (r.member === carrier ? leftover : 0),
  }))
  assertSum(splits, amount)
  return splits
}

/** Invariant from spec §4.4. A violation here means the ledger would silently drift. */
function assertSum(splits: SplitItem[], amount: Cents): void {
  const sum = splits.reduce((a, s) => a + s.shareAmount, 0)
  if (sum !== amount) {
    throw new Error(`split invariant violated: Σ=${sum} ≠ amount=${amount}`)
  }
}

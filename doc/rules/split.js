// @ts-check
import { MAX_MEMBERS } from './types.js';

/**
 * Compute split shares for a bill (spec §5.1, §5.2).
 * All amounts in integer cents.
 *
 * @param {Object} input
 * @param {number}   input.amount     total bill, integer cents, > 0
 * @param {string}   input.paidBy     memberId of the single payer
 * @param {string[]} input.members    participant memberIds (1..20), may or may not include paidBy
 * @param {'equal'|'custom'|'percentage'} input.splitType
 * @param {number[]=} input.values    for 'custom': cents per member; for 'percentage': percent per member.
 *                                    Length & order must match `members`. Unused for 'equal'.
 * @returns {{member: string, shareAmount: number}[]}
 */
export function computeSplits({ amount, paidBy, members, splitType, values }) {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error(`amount must be a positive integer (cents), got ${amount}`);
  }
  if (!Array.isArray(members) || members.length < 1) {
    throw new Error('members must have at least 1 participant');
  }
  if (members.length > MAX_MEMBERS) {
    throw new Error(`members exceeds MAX_MEMBERS (${MAX_MEMBERS})`);
  }
  if (new Set(members).size !== members.length) {
    throw new Error('members contains duplicates');
  }

  switch (splitType) {
    case 'equal':
      return splitEqual(amount, paidBy, members);
    case 'custom':
      return splitCustom(amount, members, values);
    case 'percentage':
      return splitPercentage(amount, paidBy, members, values);
    default:
      throw new Error(`unknown splitType: ${splitType}`);
  }
}

/**
 * Equal split. Remainder (amount not evenly divisible) goes to the payer
 * if the payer participates, otherwise to members[0]. (spec §5.2)
 */
function splitEqual(amount, paidBy, members) {
  const n = members.length;
  const base = Math.floor(amount / n);
  const remainder = amount - base * n; // 0 .. n-1

  const carrier = members.includes(paidBy) ? paidBy : members[0];

  const splits = members.map((member) => ({
    member,
    shareAmount: base + (member === carrier ? remainder : 0),
  }));
  assertSum(splits, amount);
  return splits;
}

/**
 * Custom split: caller specifies exact cents per member.
 * Must sum exactly to amount. (spec §5.1)
 */
function splitCustom(amount, members, values) {
  if (!Array.isArray(values) || values.length !== members.length) {
    throw new Error('custom split requires values[] matching members length');
  }
  values.forEach((v) => {
    if (!Number.isInteger(v) || v < 0) {
      throw new Error(`custom share must be a non-negative integer (cents), got ${v}`);
    }
  });
  const sum = values.reduce((a, b) => a + b, 0);
  if (sum !== amount) {
    throw new Error(`custom shares sum to ${sum}, expected ${amount}`);
  }
  const splits = members.map((member, i) => ({ member, shareAmount: values[i] }));
  assertSum(splits, amount);
  return splits;
}

/**
 * Percentage split: caller specifies percent per member (must sum to 100).
 * Converted to cents; leftover cents from rounding follow the same remainder
 * rule as equal split. (spec §5.1, §5.2)
 */
function splitPercentage(amount, paidBy, members, values) {
  if (!Array.isArray(values) || values.length !== members.length) {
    throw new Error('percentage split requires values[] matching members length');
  }
  const pctSum = values.reduce((a, b) => a + b, 0);
  if (Math.abs(pctSum - 100) > 1e-9) {
    throw new Error(`percentages sum to ${pctSum}, expected 100`);
  }
  // floor each, then distribute leftover cents to the carrier.
  const raw = members.map((member, i) => ({
    member,
    floor: Math.floor((amount * values[i]) / 100),
  }));
  const allocated = raw.reduce((a, r) => a + r.floor, 0);
  const leftover = amount - allocated; // >= 0

  const carrier = members.includes(paidBy) ? paidBy : members[0];
  const splits = raw.map((r) => ({
    member: r.member,
    shareAmount: r.floor + (r.member === carrier ? leftover : 0),
  }));
  assertSum(splits, amount);
  return splits;
}

/** Invariant from spec §4.4: Σ shareAmount === amount. */
function assertSum(splits, amount) {
  const sum = splits.reduce((a, s) => a + s.shareAmount, 0);
  if (sum !== amount) {
    throw new Error(`split invariant violated: Σ=${sum} ≠ amount=${amount}`);
  }
}

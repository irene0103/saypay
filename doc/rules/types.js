// @ts-check
/**
 * SayPay core domain types (spec §4).
 * All money is stored as integer CENTS. 1 元 = 100.
 *
 * @typedef {number} Cents  integer
 *
 * @typedef {Object} SplitItem
 * @property {string} member       memberId
 * @property {Cents}  shareAmount   this person's share of the bill
 *
 * @typedef {'equal'|'custom'|'percentage'} SplitType
 *
 * @typedef {Object} Transaction
 * @property {string}      id
 * @property {string}      title
 * @property {Cents}       amount
 * @property {'income'|'expense'} type
 * @property {string}      category
 * @property {string}      date          ISO datetime (local tz)
 * @property {boolean}     isSplit
 * @property {string}      paidBy        memberId (single payer)
 * @property {string[]}    members       memberIds, 1..20, may exclude paidBy
 * @property {SplitType}   splitType
 * @property {SplitItem[]} splits
 * @property {string=}     groupId
 * @property {string=}     deletedAt     soft-delete tombstone
 *
 * @typedef {Object} Settlement
 * @property {string} id
 * @property {string} from     memberId (payer)
 * @property {string} to       memberId (receiver)
 * @property {Cents}  amount   > 0
 * @property {string} at
 * @property {string=} deletedAt
 */

export const MAX_MEMBERS = 20;

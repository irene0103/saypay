/**
 * Seeding has two layers:
 *
 *  - seedDefaults() — the "我" member and a starter category tree. Runs on EVERY first
 *    launch, production included: without categories the entry form has nothing to pick
 *    and without a self member every stat is empty. This is real starter content, not
 *    demo data.
 *
 *  - seedDev() — demo people, groups and a month of transactions that reproduce the
 *    wireframe's headline figures (應收 $1,200 · 應付 $300 · 淨額 +$900). DEV ONLY.
 */
import { db } from '@/db'
import { toCents } from '@/core/money'
import { computeSplits } from '@/core/split'
import type { Category, Group, Member, Settlement, Transaction } from '@/core/types'

const now = new Date()
const iso = (day: number, hour = 12) =>
  new Date(now.getFullYear(), now.getMonth(), day, hour).toISOString()

const ME = 'm-self'
const AMY = 'm-amy'
const BEN = 'm-ben'
const CINDY = 'm-cindy'

const selfMember: Member = { id: ME, name: '我', avatarColor: '#8A9C74', isSelf: true }

const demoMembers: Member[] = [
  { id: AMY, name: 'Amy', avatarColor: '#A9B58C', isSelf: false },
  { id: BEN, name: 'Ben', avatarColor: '#C7B98E', isSelf: false },
  { id: CINDY, name: 'Cindy', avatarColor: '#B08E6A', isSelf: false },
]

// Two levels only; transactions always hang off a LEAF (spec §4.6).
const defaultCategories: Category[] = [
  { id: 'c-food', name: '餐飲', icon: 'utensils', sortOrder: 1 },
  { id: 'c-food-out', name: '外食', icon: 'utensils', parentId: 'c-food', sortOrder: 1 },
  { id: 'c-food-grocery', name: '食材', icon: 'shopping-basket', parentId: 'c-food', sortOrder: 2 },
  { id: 'c-transit', name: '交通', icon: 'bus', sortOrder: 2 },
  { id: 'c-transit-mrt', name: '大眾運輸', icon: 'train-front', parentId: 'c-transit', sortOrder: 1 },
  { id: 'c-transit-taxi', name: '計程車', icon: 'car-taxi-front', parentId: 'c-transit', sortOrder: 2 },
  { id: 'c-fun', name: '娛樂', icon: 'gamepad-2', sortOrder: 3 },
  { id: 'c-fun-movie', name: '電影', icon: 'clapperboard', parentId: 'c-fun', sortOrder: 1 },
  { id: 'c-shop', name: '購物', icon: 'shopping-bag', sortOrder: 4 },
  { id: 'c-home', name: '居家', icon: 'house', sortOrder: 5 },
  { id: 'c-other', name: '其他', icon: 'circle-ellipsis', sortOrder: 6 },
  { id: 'c-income', name: '收入', icon: 'wallet', sortOrder: 7 },
]

const groups: Group[] = [
  { id: 'g-okinawa', name: '沖繩旅遊', memberIds: [ME, AMY, BEN], createdAt: iso(1) },
  { id: 'g-friday', name: '週五火鍋團', memberIds: [ME, CINDY], createdAt: iso(3) },
]

let seq = 0
function tx(input: {
  title: string
  yuan: number
  category: string
  day: number
  type?: 'income' | 'expense'
  note?: string
  split?: { paidBy: string; members: string[] }
  groupId?: string
}): Transaction {
  const amount = toCents(input.yuan)
  const at = iso(input.day, 9 + (seq % 12))
  const id = `t-${String(++seq).padStart(3, '0')}`

  const isSplit = Boolean(input.split)
  const paidBy = input.split?.paidBy ?? ME
  const memberIds = input.split?.members ?? [ME]

  return {
    id,
    ownerId: 'dev',
    title: input.title,
    amount,
    type: input.type ?? 'expense',
    category: input.category,
    date: at,
    note: input.note,
    isSplit,
    paidBy,
    members: memberIds,
    splitType: 'equal',
    splits: isSplit
      ? computeSplits({ amount, paidBy, members: memberIds, splitType: 'equal' })
      : [{ member: ME, shareAmount: amount }],
    groupId: input.groupId,
    createdAt: at,
    updatedAt: at,
  }
}

const transactions: Transaction[] = [
  // --- Split: the spec §1.4 hotpot, scaled so Amy and Ben each owe $600 ---
  tx({
    title: '火鍋聚餐',
    yuan: 1800,
    category: 'c-food-out',
    day: 27,
    note: '三人平分',
    split: { paidBy: ME, members: [ME, AMY, BEN] },
    groupId: 'g-okinawa',
  }),
  // --- Split where someone ELSE paid: this is the case the v0.1 global formula got wrong ---
  tx({
    title: '咖啡廳',
    yuan: 600,
    category: 'c-food-out',
    day: 24,
    split: { paidBy: CINDY, members: [ME, CINDY] },
    groupId: 'g-friday',
  }),

  // --- Personal expenses (no split → my share is the full amount) ---
  tx({ title: '咖啡', yuan: 120, category: 'c-food-out', day: 27 }),
  tx({ title: '捷運', yuan: 30, category: 'c-transit-mrt', day: 27 }),
  tx({ title: '早餐', yuan: 50, category: 'c-food-out', day: 26 }),
  tx({ title: '午餐便當', yuan: 120, category: 'c-food-out', day: 26 }),
  tx({ title: '超市採買', yuan: 860, category: 'c-food-grocery', day: 25 }),
  tx({ title: '晚餐', yuan: 280, category: 'c-food-out', day: 25 }),
  tx({ title: '計程車', yuan: 250, category: 'c-transit-taxi', day: 24 }),
  tx({ title: '拉麵', yuan: 260, category: 'c-food-out', day: 23 }),
  tx({ title: '捷運', yuan: 60, category: 'c-transit-mrt', day: 23 }),
  tx({ title: '電影票', yuan: 640, category: 'c-fun-movie', day: 22 }),
  tx({ title: '爆米花', yuan: 150, category: 'c-fun-movie', day: 22 }),
  tx({ title: '午餐', yuan: 130, category: 'c-food-out', day: 21 }),
  tx({ title: '公車', yuan: 30, category: 'c-transit-mrt', day: 21 }),
  tx({ title: '衣服', yuan: 1290, category: 'c-shop', day: 20 }),
  tx({ title: '手搖飲', yuan: 65, category: 'c-food-out', day: 20 }),
  tx({ title: '水電費', yuan: 935, category: 'c-home', day: 18 }),
  tx({ title: '晚餐聚會', yuan: 480, category: 'c-food-out', day: 17 }),
  tx({ title: '高鐵', yuan: 1490, category: 'c-transit', day: 15 }),
  tx({ title: '書', yuan: 420, category: 'c-shop', day: 14 }),
  tx({ title: '早午餐', yuan: 320, category: 'c-food-out', day: 12 }),
  tx({ title: '演唱會', yuan: 1091, category: 'c-fun', day: 10 }),
  tx({ title: '日用品', yuan: 290, category: 'c-home', day: 8 }),
  tx({ title: '咖啡', yuan: 120, category: 'c-food-out', day: 6 }),
  tx({ title: '捷運月票', yuan: 648, category: 'c-transit-mrt', day: 3 }),
  tx({ title: '午餐', yuan: 110, category: 'c-food-out', day: 2 }),

  // Income is excluded from every expense stat and from the budget (spec §3.4).
  tx({ title: '薪資', yuan: 52000, category: 'c-income', day: 5, type: 'income' }),
]

const settlements: Settlement[] = []

/**
 * Starter content for a brand-new ledger — runs in production too. Idempotent: only fills
 * in what's missing, so it never clobbers a user who already has data, and it restores the
 * category tree if it somehow ends up empty.
 */
export async function seedDefaults(): Promise<void> {
  const [memberCount, categoryCount] = await Promise.all([
    db.members.count(),
    db.categories.count(),
  ])
  if (memberCount === 0) await db.members.add(selfMember)
  if (categoryCount === 0) await db.categories.bulkAdd(defaultCategories)
}

/** Demo data on top of the defaults — DEV ONLY. Guarded on the transaction table. */
export async function seedDev(): Promise<void> {
  if ((await db.transactions.count()) > 0) return

  await db.transaction(
    'rw',
    [db.members, db.groups, db.transactions, db.settlements, db.budgets],
    async () => {
      await db.members.bulkAdd(demoMembers)
      await db.groups.bulkAdd(groups)
      await db.transactions.bulkAdd(transactions)
      await db.settlements.bulkAdd(settlements)
      // Budgets are set on PARENT categories only (spec §3.5, decision #35).
      await db.budgets.add({
        month: new Date().toISOString().slice(0, 7),
        total: toCents(20000),
        byCategory: {
          'c-food': toCents(8000),
          'c-transit': toCents(3000),
          'c-fun': toCents(2000),
        },
      })
    },
  )
}

/** Wipe and re-seed the full demo. Handy while iterating on the screens. */
export async function reseedDev(): Promise<void> {
  await db.delete()
  await db.open()
  await seedDefaults()
  await seedDev()
}

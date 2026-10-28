import { describe, expect, it } from 'vitest'

import { guessCategory, parseEntries, zhToNumber } from '@/core/nlParse'
import { localDayKey } from '@/core/stats'
import type { Category, Transaction } from '@/core/types'

// Wednesday 2026-10-28, 12:00 local.
const TODAY = new Date(2026, 9, 28, 12, 0)
const opts = {
  today: TODAY,
  selfId: 'me',
  members: [
    { id: 'amy', name: 'Amy' },
    { id: 'ben', name: 'Ben' },
  ],
}
const parse = (s: string) => parseEntries(s, opts)
const day = (d: Date) => localDayKey(d)

describe('zhToNumber', () => {
  it.each([
    ['三十', 30],
    ['十五', 15],
    ['二十五', 25],
    ['一百', 100],
    ['一百五', 150],
    ['一百零五', 105],
    ['兩千三', 2300],
    ['三千五百', 3500],
    ['一萬二', 12000],
  ])('%s → %d', (s, n) => expect(zhToNumber(s)).toBe(n))

  it('rejects non-numerals', () => expect(zhToNumber('火鍋')).toBeNull())
})

describe('parseEntries — spec §3.2.2', () => {
  it('reads the three example sentences', () => {
    const [a] = parse('我今天吃早餐 茶葉蛋30元')
    expect(a).toMatchObject({ title: '早餐 茶葉蛋', amount: 3000, type: 'expense', dateInferred: false })
    expect(day(a!.date)).toBe('2026-10-28')

    const [b] = parse('我昨天吃火鍋300元')
    expect(b).toMatchObject({ title: '火鍋', amount: 30000 })
    expect(day(b!.date)).toBe('2026-10-27')

    const [c] = parse('上禮拜三吃蛋餅50元')
    expect(c).toMatchObject({ title: '蛋餅', amount: 5000 })
    expect(day(c!.date)).toBe('2026-10-21')
  })

  it('splits one sentence into one entry per amount, carrying the date forward', () => {
    const entries = parse('昨天早餐蛋餅50、午餐便當120，今天咖啡85塊')
    expect(entries.map((e) => [e.title, e.amount, day(e.date)])).toEqual([
      ['早餐蛋餅', 5000, '2026-10-27'],
      ['午餐便當', 12000, '2026-10-27'],
      ['咖啡', 8500, '2026-10-28'],
    ])
  })

  it('defaults to today and says so when no date is given', () => {
    const [e] = parse('拿鐵 120')
    expect(e!.dateInferred).toBe(true)
    expect(day(e!.date)).toBe('2026-10-28')
  })

  it.each([
    ['前天 午餐 100', '2026-10-26'],
    ['大前天 晚餐 100', '2026-10-25'],
    ['3天前 加油 1000', '2026-10-25'],
    ['三天前 加油 1000', '2026-10-25'],
    ['禮拜一 午餐 100', '2026-10-26'],
    // A bare weekday later than today means last week's.
    ['星期五 電影 300', '2026-10-23'],
    ['上上週五 電影 300', '2026-10-16'],
    ['10月5號 衣服 990', '2026-10-05'],
    ['12月30號 衣服 990', '2025-12-30'],
    ['5號 房租 15000', '2026-10-05'],
  ])('%s → %s', (s, expected) => {
    expect(day(parse(s)[0]!.date)).toBe(expected)
  })

  it('reads Chinese amounts only with a money unit', () => {
    expect(parse('早餐五十元')[0]!.amount).toBe(5000)
    expect(parse('晚餐一百五十塊')[0]!.amount).toBe(15000)
    expect(parse('三個人吃飯')).toEqual([])
  })

  it('treats a number with a measure word as a quantity, not money', () => {
    const entries = parse('咖啡3杯 共240元')
    expect(entries).toHaveLength(1)
    expect(entries[0]!.amount).toBe(24000)
  })

  it('handles $, thousands separators and decimals', () => {
    expect(parse('機票 $12,500')[0]!.amount).toBe(1250000)
    expect(parse('停車 37.5元')[0]!.amount).toBe(3750)
  })

  it('reads members and the payer as a split', () => {
    const [e] = parse('跟 Amy、Ben 吃火鍋 600 Amy付 平分')
    expect(e).toMatchObject({ title: '火鍋', amount: 60000, memberIds: ['amy', 'ben'], paidBy: 'amy' })

    const [f] = parse('跟Amy吃燒肉1200 我先付')
    expect(f).toMatchObject({ memberIds: ['amy'], paidBy: 'me' })
  })

  it('detects income', () => {
    expect(parse('今天領到獎金 5000')[0]!.type).toBe('income')
  })

  it('returns nothing without an amount', () => {
    expect(parse('今天吃火鍋')).toEqual([])
  })
})

describe('guessCategory', () => {
  const cats: Category[] = [
    { id: 'food', name: '餐飲', icon: 'x', sortOrder: 1 },
    { id: 'out', name: '外食', icon: 'x', parentId: 'food', sortOrder: 1 },
    { id: 'breakfast', name: '早餐', icon: 'x', parentId: 'food', sortOrder: 2 },
    { id: 'mrt', name: '大眾運輸', icon: 'x', sortOrder: 2 },
    { id: 'other', name: '其他', icon: 'x', sortOrder: 3 },
    { id: 'income', name: '收入', icon: 'x', sortOrder: 4 },
  ]
  const past = (title: string, category: string): Transaction =>
    ({ title, category, type: 'expense', date: '2026-10-01T00:00:00.000Z' }) as Transaction
  const guess = (source: string, title: string, history: Transaction[] = [], type = 'expense' as const) =>
    guessCategory({ source, title, type }, cats, history)

  it('prefers an exact title from history, as known', () => {
    expect(guess('蛋餅50', '蛋餅', [past('蛋餅', 'breakfast')])).toEqual({ id: 'breakfast', inferred: false })
  })

  it('falls back to keywords, resolving a parent to its first child', () => {
    expect(guess('吃火鍋300', '火鍋')).toEqual({ id: 'out', inferred: true })
    expect(guess('捷運 30', '捷運')).toEqual({ id: 'mrt', inferred: true })
  })

  it('falls back to 其他 when nothing matches', () => {
    expect(guess('雜項 30', '雜項')).toEqual({ id: 'other', inferred: true })
  })

  it('files income under 收入', () => {
    expect(guessCategory({ source: '獎金', title: '獎金', type: 'income' }, cats, [])).toEqual({
      id: 'income',
      inferred: true,
    })
  })
})

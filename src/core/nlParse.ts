/**
 * Natural-language entry — spec §3.2.2 (1e).
 *
 * Turns a spoken or typed sentence such as 「昨天吃火鍋300元、今天早餐茶葉蛋30元」 into one
 * entry per amount. Rule-based and fully local: it must keep working offline (§3.7 降級),
 * and it only ever feeds the shared TransactionDraft, so an LLM parser can replace it later
 * without touching the UI.
 *
 * Everything here is pure. `today` is injected so the date words are testable.
 */
import { toCents } from './money'
import type { Category, Cents, Transaction, TxType } from './types'

export interface ParsedEntry {
  /** The slice of the sentence this entry was read from. */
  source: string
  title: string
  amount: Cents
  type: TxType
  /** Local date; the time of day is `today`'s. */
  date: Date
  /** No date word in this entry or any before it — defaulted to today. */
  dateInferred: boolean
  /** Members named in this entry (never self). Non-empty → a split. */
  memberIds: string[]
  /** Who paid, when said (「Amy付」「我先付」). Undefined → the caller defaults to me. */
  paidBy?: string
}

export interface ParseOptions {
  today: Date
  selfId: string
  /** The other members, matched by name for 「跟 Amy、Ben」. */
  members: { id: string; name: string }[]
}

// ---- Numbers ----

const ZH = '[零〇一二兩三四五六七八九十百千萬]+'
const NUM = `(?:\\d+|${ZH})`
const ZH_DIGIT: Record<string, number> = {
  零: 0, 〇: 0, 一: 1, 二: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
}
const ZH_UNIT: Record<string, number> = { 十: 10, 百: 100, 千: 1000 }

/**
 * 「三十」→30, 「一百五」→150 (spoken shorthand), 「一百零五」→105, 「兩千三」→2300,
 * 「一萬二」→12000. Returns null for anything that isn't a Chinese numeral.
 */
export function zhToNumber(s: string): number | null {
  if (!new RegExp(`^${ZH}$`).test(s)) return null
  let total = 0
  let section = 0
  let digit = 0
  let lastUnit = 1
  for (const ch of s) {
    if (ch in ZH_DIGIT) {
      digit = ZH_DIGIT[ch]!
    } else if (ch === '萬') {
      total += (section + digit) * 10000
      section = 0
      digit = 0
      lastUnit = 10000
    } else {
      const unit = ZH_UNIT[ch]!
      // A bare 十 means 一十 (十五 = 15).
      section += (digit || (unit === 10 ? 1 : 0)) * unit
      digit = 0
      lastUnit = unit
    }
  }
  // A digit right after a unit is the shorthand for the next unit down: 一百五 = 150.
  const shorthand = lastUnit >= 100 && /[百千萬][一二兩三四五六七八九]$/.test(s)
  const tail = shorthand ? (digit * lastUnit) / 10 : digit
  return total + section + tail
}

function toNumber(s: string): number | null {
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s)
  return zhToNumber(s)
}

// ---- Dates ----

interface Span {
  start: number
  end: number
}
interface DateHit extends Span {
  date: Date
}

const WEEKDAY: Record<string, number> = { 一: 0, 二: 1, 三: 2, 四: 3, 五: 4, 六: 5, 日: 6, 天: 6 }
const WEEK = '(?:禮拜|星期|週|周)'

/** `today` with its calendar day moved, keeping the time of day. */
function onDay(today: Date, y: number, m: number, d: number): Date {
  const out = new Date(today)
  out.setFullYear(y, m, d)
  return out
}
function addDays(today: Date, n: number): Date {
  return onDay(today, today.getFullYear(), today.getMonth(), today.getDate() + n)
}

/** Date words, most specific first; earlier patterns claim their span before later ones. */
const DATE_RULES: [RegExp, (m: RegExpExecArray, today: Date) => Date | null][] = [
  [
    new RegExp(`(${NUM})月(${NUM})[日號号]?`, 'g'),
    (m, today) => {
      const mo = toNumber(m[1]!)
      const d = toNumber(m[2]!)
      if (!mo || !d || mo > 12 || d > 31) return null
      const date = onDay(today, today.getFullYear(), mo - 1, d)
      // Expenses are logged after the fact: 「12月30號」 said in January means last year.
      return date > today ? onDay(today, today.getFullYear() - 1, mo - 1, d) : date
    },
  ],
  [
    new RegExp(`(上上|上|這|这|本)?個?${WEEK}([一二三四五六日天])`, 'g'),
    (m, today) => {
      const back = m[1] === '上上' ? 2 : m[1] === '上' ? 1 : 0
      const mondayOffset = -((today.getDay() + 6) % 7)
      const date = addDays(today, mondayOffset + WEEKDAY[m[2]!]! - back * 7)
      // A bare 「禮拜五」 said on a Wednesday means the one that already happened.
      return !m[1] && date > today ? addDays(date, -7) : date
    },
  ],
  [new RegExp(`(上上|上)個?${WEEK}`, 'g'), (m, today) => addDays(today, m[1] === '上上' ? -14 : -7)],
  [/大前天/g, (_, today) => addDays(today, -3)],
  [/前天/g, (_, today) => addDays(today, -2)],
  [/昨[天日晚早]/g, (_, today) => addDays(today, -1)],
  [/今[天日晚早]/g, (_, today) => today],
  [
    new RegExp(`(${NUM})天前`, 'g'),
    (m, today) => {
      const n = toNumber(m[1]!)
      return n ? addDays(today, -n) : null
    },
  ],
  [
    new RegExp(`(${NUM})[日號号]`, 'g'),
    (m, today) => {
      const d = toNumber(m[1]!)
      if (!d || d > 31) return null
      const date = onDay(today, today.getFullYear(), today.getMonth(), d)
      return date > today ? onDay(today, today.getFullYear(), today.getMonth() - 1, d) : date
    },
  ],
]

/** Blank a span out with spaces, so later passes skip it but every index stays put. */
function mask(text: string, s: Span): string {
  return text.slice(0, s.start) + ' '.repeat(s.end - s.start) + text.slice(s.end)
}

function findDates(text: string, today: Date): { hits: DateHit[]; masked: string } {
  const hits: DateHit[] = []
  let masked = text
  for (const [re, resolve] of DATE_RULES) {
    re.lastIndex = 0
    for (const m of masked.matchAll(re)) {
      const date = resolve(m as RegExpExecArray, today)
      if (!date) continue
      const span = { start: m.index, end: m.index + m[0].length }
      hits.push({ ...span, date })
    }
    for (const h of hits) masked = mask(masked, h)
  }
  return { hits, masked }
}

// ---- Amounts ----

// Arabic numbers followed by a measure word are quantities (「3杯」), not money. The (?![\d.])
// stops the engine backing off to a shorter number to dodge that check.
const MEASURE = '[杯個份碗張次人位點樓顆包瓶罐支件本盒條雙]'
const AMOUNT_RE = new RegExp(
  `(?:NT\\$?|\\$)?\\s*(\\d+(?:\\.\\d+)?)(?![\\d.]|\\s*${MEASURE})\\s*(?:元|塊錢|塊|圓)?` +
    // Chinese numerals only count with a money unit — 「三」 alone is far too common.
    `|(${ZH})\\s*(?:元|塊錢|塊|圓)`,
  'g',
)

function normalize(text: string): string {
  return text
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/＄/g, '$')
    .replace(/(\d),(?=\d{3}\b)/g, '$1')
}

// ---- Title ----

const INCOME_RE = /薪水|薪資|收入|獎金|領到|收到|賺|退款|退費/

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** What's left of the segment once dates, amounts, people and filler words are gone. */
function cleanTitle(seg: string, names: string[]): string {
  let t = seg
  for (const n of names) t = t.split(n).join(' ')
  return t
    .replace(/先?(付|出|墊)(的|了)?錢?/g, ' ')
    .replace(/平分|均分|分帳|一起/g, ' ')
    .replace(/還有|还有|然後|另外|總共|大概|左右|[跟和與共]/g, ' ')
    .replace(/(^|[\s，,、。；;！!？?])(我們|我)/g, '$1 ')
    .replace(/(^|[\s，,、。；;！!？?])有?(吃|喝|買|花|搭|坐|繳|加|叫)了?/g, '$1 ')
    .replace(/[，,、。；;！!？?：:\s]+/g, ' ')
    .trim()
    .replace(/^(的|了)\s*|\s*(的|了)$/g, '')
}

// ---- Parse ----

/**
 * One entry per amount in the sentence. A date word applies to its own entry and carries
 * forward to the entries after it (「昨天早餐50 午餐120」 → both yesterday). Returns [] when
 * no amount is found — the caller falls back to the 1d form (spec §3.2.2).
 */
export function parseEntries(input: string, opts: ParseOptions): ParsedEntry[] {
  const text = normalize(input)
  const { hits, masked } = findDates(text, opts.today)

  const amounts: { span: Span; cents: Cents }[] = []
  for (const m of masked.matchAll(AMOUNT_RE)) {
    const n = toNumber((m[1] ?? m[2])!)
    if (!n || n <= 0) continue
    amounts.push({ span: { start: m.index, end: m.index + m[0].length }, cents: toCents(n) })
  }
  if (amounts.length === 0) return []

  const names = [...opts.members].sort((a, b) => b.name.length - a.name.length)
  const entries: ParsedEntry[] = []
  let carried: Date | null = null
  let from = 0

  amounts.forEach((a, i) => {
    // Each entry runs up to the end of its amount; the last one also takes the tail
    // (「…600 Amy付 平分」).
    const to = i === amounts.length - 1 ? text.length : a.span.end
    const source = text.slice(from, to).trim()
    const inSegment = hits.filter((h) => h.start >= from && h.start < to)
    const date = inSegment[inSegment.length - 1]?.date ?? null
    if (date) carried = date

    let seg = masked.slice(from, to)
    seg = mask(seg, { start: a.span.start - from, end: a.span.end - from })

    const memberIds: string[] = []
    let rest = seg
    for (const m of names) {
      if (!m.name || !rest.includes(m.name)) continue
      memberIds.push(m.id)
      rest = rest.split(m.name).join(' ')
    }
    let paidBy: string | undefined
    for (const m of names) {
      if (new RegExp(`${escapeRe(m.name)}\\s*先?(付|出|墊)`).test(seg)) paidBy = m.id
    }
    if (/我\s*先?(付|出|墊)/.test(seg)) paidBy = opts.selfId

    entries.push({
      source,
      title: cleanTitle(seg, names.map((m) => m.name)),
      amount: a.cents,
      type: INCOME_RE.test(source) ? 'income' : 'expense',
      date: carried ?? opts.today,
      dateInferred: carried === null,
      memberIds,
      paidBy,
    })
    from = to
  })

  return entries
}

// ---- Category ----

/** Keyword → category names to try, most specific first. Matched against the whole entry. */
const CATEGORY_KEYWORDS: [RegExp, string[]][] = [
  [/超市|全聯|家樂福|好市多|菜市場|買菜|食材|水果|蔬菜/, ['食材', '餐飲']],
  [
    /早餐|午餐|晚餐|宵夜|早午餐|便當|飯|麵|火鍋|燒肉|咖啡|飲料|手搖|奶茶|珍奶|茶葉蛋|蛋餅|吐司|漢堡|披薩|壽司|小吃|點心|甜點|蛋糕|餐廳|聚餐|麥當勞|星巴克|吃|喝/,
    ['外食', '餐飲'],
  ],
  [/捷運|公車|火車|台鐵|高鐵|客運|悠遊卡|月票/, ['大眾運輸', '交通']],
  [/計程車|小黃|uber/i, ['計程車', '交通']],
  [/加油|停車|油錢|過路費|etag/i, ['交通']],
  [/電影/, ['電影', '娛樂']],
  [/唱歌|ktv|遊戲|演唱會|門票|展覽|桌遊/i, ['娛樂']],
  [/衣服|褲子|鞋|包包|網購|蝦皮|日用品|衛生紙/, ['購物']],
  [/房租|水費|電費|水電|瓦斯|網路費|電話費|管理費/, ['居家']],
]

/**
 * Best-guess leaf category for an entry. Past entries win over keywords — if 「蛋餅」 was
 * filed under 早餐 before, file it there again. Only an exact title match from history
 * counts as known; every other answer is a guess the card marks as inferred.
 */
export function guessCategory(
  entry: Pick<ParsedEntry, 'source' | 'title' | 'type'>,
  categories: Category[],
  history: Transaction[],
): { id: string; inferred: boolean } | null {
  const live = categories.filter((c) => !c.deletedAt)
  const parents = new Set(live.map((c) => c.parentId).filter(Boolean))
  const leaves = live.filter((c) => !parents.has(c.id))
  const isLeaf = (id: string) => leaves.some((c) => c.id === id)
  if (leaves.length === 0) return null

  const byName = (name: string): string | undefined => {
    const c = live.find((x) => x.name === name)
    if (!c) return undefined
    if (isLeaf(c.id)) return c.id
    return live
      .filter((x) => x.parentId === c.id)
      .sort((a, b) => a.sortOrder - b.sortOrder)[0]?.id
  }

  const past = history
    .filter((t) => !t.deletedAt && t.type === entry.type && isLeaf(t.category))
    .sort((a, b) => b.date.localeCompare(a.date))

  const exact = past.find((t) => t.title.trim() && t.title.trim() === entry.title)
  if (exact) return { id: exact.category, inferred: false }

  // Longest past title found inside what was said.
  const partial = past
    .filter((t) => t.title.trim().length >= 2 && entry.source.includes(t.title.trim()))
    .sort((a, b) => b.title.length - a.title.length)[0]
  if (partial) return { id: partial.category, inferred: true }

  if (entry.type === 'income') {
    const id = byName('收入') ?? leaves[0]!.id
    return { id, inferred: true }
  }

  for (const [re, names] of CATEGORY_KEYWORDS) {
    if (!re.test(entry.source)) continue
    for (const n of names) {
      const id = byName(n)
      if (id) return { id, inferred: true }
    }
  }

  const counts = new Map<string, number>()
  for (const t of past) counts.set(t.category, (counts.get(t.category) ?? 0) + 1)
  const mostUsed = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0]
  return { id: mostUsed ?? byName('其他') ?? leaves[0]!.id, inferred: true }
}

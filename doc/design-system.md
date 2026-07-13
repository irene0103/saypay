# 分分帳 SayPay — Design System (design-system.md)

> 版本：v1.0
> 來源：《SayPay Wireframes》全頁面探索稿
> 視覺方向（wireframe 標題定調）：**白底・線條 icon・文青風**
>
> 所有色值皆自 wireframe 實際取樣（非臆測）。此文件與 `spec.md` 並列：spec 定義「做什麼」，本文件定義「長什麼樣」。

---

## 0. 設計基調

一句話：**一本安靜的手帳，不是一個金融儀表板。**

記帳與分帳的心理負擔已經夠重，介面不該再增加壓力。SayPay 的視覺策略是**低對比、低飽和、留白多**——用一片米白與霧感鼠尾草綠承載數字，讓金額本身成為畫面的重量，而不是靠色塊與陰影去搶注意力。

| 原則 | 具體表現 |
| --- | --- |
| 安靜 | 無重陰影、無高飽和色、無漸層。分隔用細線與留白，不用色塊 |
| 溫暖 | 中性色帶橄欖／米黃底調，連「黑」都是暖黑 `#383830`，非純黑 |
| 克制 | 一個畫面最多一個重點（hero 金額或主 CTA），其餘皆退為背景 |
| 線條 | icon 一律線性描邊，不填色。呼應手繪手帳感 |
| 誠實 | 語意色（欠款紅）也降飽和為陶土色，不用告警式的亮紅 |

> **唯一的視覺聲量**留給 hero 卡片的大金額數字。其他所有元素都要為它讓路。

---

## 1. 色彩 Color

### 1.1 品牌綠（Sage）— 主色

取自 wireframe 的 hero 卡片、進度條、主 CTA。

| Token | Hex | 用途 |
| --- | --- | --- |
| `--sage-50` | `#F1F4EA` | 極淺，hover 底色 |
| `--sage-100` | `#E9EEDD` | **hero 卡片背景**、進度條軌道、選中態底 |
| `--sage-200` | `#D8E0C7` | 分隔、次要邊框 |
| `--sage-300` | `#B5C1A7` | CTA 邊框、disabled 綠 |
| `--sage-500` | `#8A9C74` | **主 CTA 填色**、連結、focus ring |
| `--sage-700` | `#5A6B47` | CTA hover、強調文字 |
| `--sage-900` | `#44503A` | **進度條填色**、hero 卡片上的深色數字 |

### 1.2 中性色（Warm Neutral）

暖橄欖底調，非冷灰。

| Token | Hex | 用途 |
| --- | --- | --- |
| `--bg` | `#FFFFFF` | 頁面背景 |
| `--surface` | `#FBFBF8` | 卡片背景（與頁面幾乎同色，靠細邊界分隔） |
| `--surface-alt` | `#F7F6F0` | 列表交替列、輸入框底、次要區塊 |
| `--border` | `#EAE8DF` | 卡片邊框、分隔線（1px） |
| `--border-strong` | `#D8D5C8` | 輸入框邊框、需要更明確的分隔 |
| `--text` | `#383830` | 主文字（暖黑） |
| `--text-secondary`| `#6B6A5E` | 副標、說明文字 |
| `--text-tertiary` | `#9A9889` | 佔位符、時間戳、弱化資訊 |

### 1.3 語意色（Semantic）— 全數降飽和

**關鍵：欠款的紅不是告警紅，是陶土色。** 這是 文青風 的核心決定——連「別人欠你 / 你欠別人」都保持克制。

| Token | Hex | 用途 |
| --- | --- | --- |
| `--receivable` | `#5A6B47` | **應收**（別人欠我）＝深鼠尾草綠，正向 |
| `--payable` | `#B06850` | **應付**（我欠別人）＝陶土紅，非告警 |
| `--payable-soft` | `#C08870` | 應付的淺色（背景標示） |
| `--over-budget` | `#B06850` | 預算超支（同陶土，複用） |
| `--warn` | `#C99A5B` | 預算 80% 預警＝赭黃 |
| `--warn-soft` | `#F0E6D2` | 預警進度條底 |

> **語意對照（呼應 spec §2）**
> - 應收＝綠（`--receivable`）：這是好事
> - 應付／超支＝陶土（`--payable`）：需注意但不驚慌
> - 預警＝赭黃（`--warn`）：接近上限的提示

### 1.4 資料視覺化色盤（ECharts 圓餅／趨勢）

分類占比需要多色，但仍維持低飽和、同一明度區間，避免花俏。

```txt
--chart-1  #8A9C74   鼠尾草（餐飲）
--chart-2  #A9B58C   淺橄欖（交通）
--chart-3  #C7B98E   麥稈黃（娛樂）
--chart-4  #B08E6A   淺陶土（購物）
--chart-5  #8FA0A0   霧藍灰（居家）
--chart-6  #C0A9A0   灰粉（其他）
```

> 六色皆落在 L\*≈65–72 的相近明度，彼此靠色相區分而非明暗，圓餅圖不會出現「一塊特別跳」的失衡。

### 1.5 深色模式

MVP **不做深色模式**。文青風的識別高度依賴米白暖底，倉促的深色版會破壞質感。列為 backlog，屆時需重新設計整組中性色（非單純反轉）。

---

## 2. 字體 Typography

### 2.1 字體家族

| 角色 | 字體 | 說明 |
| --- | --- | --- |
| **數字（Display）** | `"Roboto Flex", "DIN Alternate", system-ui` | 金額專用。等寬數字（`tabular-nums`），讓金額對齊、跳動時不位移 |
| **中文（Body）** | `"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif` | 內文與標籤。字重齊全，螢幕清晰 |
| **西文（Body）** | `"Inter", system-ui, sans-serif` | 與 Noto Sans TC 的中文字面協調 |

> **為何數字用獨立字體：** 記帳 App 的主角是數字。`tabular-nums`（等寬數字）確保 `$12,540` 與 `$1,200` 在垂直排列時小數點與位數對齊，這是財務介面的基本要求，一般 UI 字體的比例數字做不到。

> **不使用 serif 顯示體。** 目前 AI 生成的「文青風」高度集中於「米白＋高對比襯線」的套路。SayPay 的 文青 來自**留白、線條 icon、低飽和**，而非襯線——刻意避開這個預設，改用一支中性、幾何感的 sans 承載大數字，讓安靜感來自版面而非字體個性。

### 2.2 字級與字重（Type Scale）

以 4px 為基準的模組化級距。

| Token | size / line-height | weight | 用途 |
| --- | --- | --- | --- |
| `--font-hero` | 40 / 44 | 600 | Dashboard hero 金額（`$12,540`） |
| `--font-display`| 28 / 34 | 600 | 記帳頁輸入金額、預算環中央 % |
| `--font-h1` | 20 / 28 | 600 | 頁面標題（`分分帳 SayPay`） |
| `--font-h2` | 17 / 24 | 600 | 卡片標題、區塊標題 |
| `--font-body` | 15 / 22 | 400 | 內文、列表主文字 |
| `--font-body-strong` | 15 / 22 | 600 | 列表金額、強調 |
| `--font-label` | 13 / 18 | 500 | 標籤、按鈕、tab |
| `--font-caption`| 12 / 16 | 400 | 時間戳、輔助說明、`分帳 · 我的 $200` |
| `--font-micro` | 11 / 14 | 500 | 徽章數字、eyebrow |

**規則**
- 金額一律 `font-variant-numeric: tabular-nums`
- 中文不使用 100/200 過細字重（螢幕發虛），最細到 400
- 標題與內文的字重差（600 vs 400）是主要階層手段，避免靠字級無限放大

---

## 3. 間距與版面 Spacing & Layout

### 3.1 間距級距（8px 基準，4px 半階）

```txt
--space-1   4px      icon 與文字間、徽章內距
--space-2   8px      緊湊元素間距
--space-3   12px     列表列內距、chip 間距
--space-4   16px     卡片內距、標準區塊間距 ★ 最常用
--space-5   24px     卡片之間、區塊之間
--space-6   32px     大區塊分隔
--space-8   48px     頁面頂部留白、空狀態
```

### 3.2 版面骨架

**手機（預設，360–430px）**

```txt
┌─────────────────────────┐
│  ← 16px 邊距 →           │  頁面左右內距固定 16px
│  ┌───────────────────┐  │
│  │  卡片 (內距 16px)   │  │  卡片圓角 16px，邊框 1px
│  └───────────────────┘  │  卡片間距 24px（--space-5）
│         ↕ 24px          │
│  ┌───────────────────┐  │
│  └───────────────────┘  │
│                         │
│ ┌─┬─┬───┬─┬─┐          │  Bottom Tab 固定，高 56px
│ │記│分│ + │分│設│       │  中央 + 為浮起 FAB
│ └─┴─┴───┴─┴─┘          │
└─────────────────────────┘
```

**平板（≥768px，對應 wireframe 1m）**

```txt
┌────────┬────────────────────────┐
│        │  ┌────────┐ ┌────────┐ │  左側導航固定 220px
│ 帳本   │  │ 左欄    │ │ 右欄    │ │  右側兩欄，gap 24px
│ 分帳   │  │ Hero   │ │ 欠款卡  │ │  內容最大寬 1080px 置中
│ 分析   │  │ 最近   │ │ 占比環  │ │
│ 預算   │  └────────┘ └────────┘ │
│ 設定   │                        │
│        │                        │
│ [+記一筆]                        │  左下常駐主動作
└────────┴────────────────────────┘
```

### 3.3 圓角 Radius

| Token | 值 | 用途 |
| --- | --- | --- |
| `--radius-sm` | 8px | 徽章、chip、小按鈕 |
| `--radius-md` | 12px | 輸入框、次要卡片 |
| `--radius-lg` | 16px | 主卡片、hero、對話框 |
| `--radius-pill`| 999px | tab 指示、toggle、頭像 |

### 3.4 陰影 Elevation

**幾乎不用陰影。** 文青風靠邊框與留白分層，不靠投影。

| Token | 值 | 用途 |
| --- | --- | --- |
| `--shadow-none`| `none` | 預設。所有卡片以 1px `--border` 分隔 |
| `--shadow-fab` | `0 4px 12px rgba(56,56,48,0.12)` | **僅** FAB 與底部浮出 sheet |
| `--shadow-pop` | `0 8px 24px rgba(56,56,48,0.10)` | **僅** 對話框、下拉選單 |

> 除了會「浮起於內容之上」的元素（FAB、sheet、dialog、dropdown），一律無陰影。

---

## 4. Icon

| 項目 | 規範 |
| --- | --- |
| 風格 | **線性描邊**，不填色（呼應 wireframe） |
| 建議來源 | Lucide（`lucide-vue-next`）——線條粗細一致、風格中性 |
| 描邊粗細 | `stroke-width: 1.75`（比預設 2 略細，更秀氣） |
| 尺寸 | 20px（列表 / tab）、24px（主動作）、16px（inline 輔助） |
| 顏色 | 繼承文字色（`currentColor`）。不給 icon 上品牌色，除非它是狀態指示 |
| 分類 icon | 每個類別配一個線性 icon（餐飲＝utensils、交通＝bus、娛樂＝gamepad…），色彩統一用 `--text-secondary` |

> **不用 emoji 當功能 icon。** streak 的火焰 🔥 是刻意的例外（情感獎勵，非功能）。

---

## 5. 元件規格 Components

### 5.1 卡片 Card

```txt
背景 --surface / 邊框 1px --border / 圓角 --radius-lg / 內距 --space-4
無陰影。卡片標題用 --font-h2，右上角次要動作用 --font-label + --sage-700
```

### 5.2 Hero 金額卡（Dashboard 核心）

```txt
背景 --sage-100 (#E9EEDD)  ← 唯一帶底色的卡片
金額 --font-hero / --sage-900 (#44503A) / tabular-nums
標籤 --font-caption / --text-secondary（"本月支出 MAY"）
進度條 見 5.6
```

> 這是全 App 唯一允許用實色背景的卡片。它的存在就是為了成為視覺錨點。

### 5.3 按鈕 Button

| 變體 | 背景 | 文字 | 邊框 | 用途 |
| --- | --- | --- | --- | --- |
| Primary | `--sage-500` | `#FFFFFF` | 無 | 主要動作（儲存、新增一筆記帳） |
| Secondary| `--surface` | `--sage-700` | 1px `--sage-300` | 次要動作（統一筆、分一筆） |
| Ghost | 透明 | `--text-secondary` | 無 | 取消、返回、弱化動作 |
| Danger | 透明 | `--payable` | 1px `--payable` | 刪除（陶土色，不用亮紅） |

```txt
高度 44px（觸控友善）/ 圓角 --radius-md / 字體 --font-label
Primary hover: 背景 --sage-700
Disabled: 背景 --sage-300 / 文字白 60%
```

### 5.4 輸入框 Input

```txt
背景 --surface-alt / 邊框 1px --border-strong / 圓角 --radius-md
高度 44px / 內距 --space-3 / 文字 --font-body
focus: 邊框 --sage-500 + 外圈 2px --sage-100（focus ring）
placeholder: --text-tertiary
```

**金額輸入**（記帳頁）為特例：大字 `--font-display`、置中、無邊框、下方細線，前置 `$` 為 `--text-tertiary`。

### 5.5 Bottom Tab

```txt
高度 56px + 安全區 / 背景 --surface / 頂部 1px --border
icon 20px 線性 / 標籤 --font-micro
未選: --text-tertiary  選中: --sage-700 + icon 加粗描邊
中央 FAB: 直徑 52px / --sage-500 / 白色 + icon / --shadow-fab / 上浮 8px
```

### 5.6 進度條 Progress（預算）

```txt
軌道 --sage-100 / 高度 8px / 圓角 pill
填色（正常）: --sage-900
填色（80%+）: --warn
填色（超支）: --payable，且超出部分以斜紋或加深標示
標籤在條上方: "餐飲 6,200 / 8,000" --font-caption
```

### 5.7 欠款金額顯示（分帳頁核心模式）

```txt
應收（別人欠我）: 金額 --receivable + 前綴 "+"    例 +$300
應付（我欠別人）: 金額 --payable   + 前綴 "−"    例 −$300
淨額 header: 大字 --font-display，正為 --receivable / 負為 --payable
```

> 顏色 + 正負號**雙重編碼**，不單靠顏色（色盲友善，見 §7）。

### 5.8 頭像 Avatar（成員）

```txt
圓形 / 直徑 28px（列表）、20px（參與者群）
無照片: 純色底 + 姓名首字，底色取自成員的 avatarColor（低飽和色盤）
群組溢位: "+15" chip，底 --surface-alt / 文字 --text-secondary（呼應 spec §3.2.1）
```

### 5.9 Chip / 標籤

```txt
高度 28px / 圓角 --radius-sm / 內距 --space-2
篩選未選: --surface-alt / --text-secondary
篩選選中: --sage-100 / --sage-700
智慧建議（1e）: 虛線邊框 1px --sage-300，暗示「可點填入」
```

### 5.10 底部浮出 Sheet（語音輸入 1l）

```txt
從底部滑入 / 背景 --surface / 頂部圓角 --radius-lg
--shadow-pop / 頂部一條 4px 灰色把手（--border-strong）
麥克風鈕: 直徑 72px / --sage-100 底 / --sage-700 icon / 錄音時脈動動畫
```

### 5.11 解析確認卡（1e）

```txt
背景 --surface / 邊框 1px --sage-300（比一般卡片更明確，暗示「待確認」）
可修正欄位: 每列右側細箭頭，點擊可改
推測值（如未指明付款人）: 該欄位底線改虛線 + --text-tertiary（呼應 spec §3.2.2）
```

---

## 6. 動效 Motion

**克制。** 動效服務「狀態變化的可理解性」，不做裝飾性效果。

| 情境 | 動效 | 時長 / 曲線 |
| --- | --- | --- |
| 頁面切換 | 淡入 + 輕微上移 8px | 200ms / ease-out |
| 卡片出現 | 淡入 | 160ms / ease-out |
| 金額變化（統計重算） | 數字滾動（count-up） | 400ms / ease-out |
| 進度條填充 | 寬度過渡 | 300ms / ease-out |
| Toast / Undo 出現 | 底部滑入 | 200ms / ease-out |
| Sheet 浮出 | 底部滑入 + 背景變暗 | 240ms / ease-out |
| 麥克風錄音 | 脈動 scale 1.0↔1.06 | 1200ms 循環 |
| 按鈕按下 | scale 0.97 | 100ms |

**鐵則**
- 一律尊重 `prefers-reduced-motion`：關閉位移與滾動，只保留即時淡入
- 不使用彈跳（bounce）、不使用超過 400ms 的過渡
- 同一畫面不同時觸發多個動效（避免「AI 生成感」的浮誇）

---

## 7. 無障礙 Accessibility（品質底線）

| 項目 | 標準 |
| --- | --- |
| 文字對比 | 主文字 `#383830` on `#FFFFFF` = 10.8:1（遠超 AA）。副標 `--text-secondary` ≥ 4.5:1 |
| 語意不單靠顏色 | 欠款用「顏色 + 正負號」、超支用「顏色 + 斜紋 + 文字」雙重編碼 |
| 觸控目標 | 最小 44×44px |
| Focus 可見 | 所有可互動元素有 2px `--sage-500` focus ring，鍵盤操作可見 |
| 減少動效 | 全面尊重 `prefers-reduced-motion` |
| 字級 | 內文最小 15px，輔助資訊最小 11px；尊重系統字級放大 |

> 低飽和配色的風險是對比不足。**每一組前景／背景都須實測對比度**，尤其 `--text-tertiary` 與 `--warn` 這類淺色，不可用於承載關鍵資訊。

---

## 8. Design Tokens（CSS 變數彙整）

可直接作為 UnoCSS / CSS 變數的初始值。

```css
:root {
  /* --- Sage --- */
  --sage-50:  #F1F4EA;
  --sage-100: #E9EEDD;
  --sage-200: #D8E0C7;
  --sage-300: #B5C1A7;
  --sage-500: #8A9C74;
  --sage-700: #5A6B47;
  --sage-900: #44503A;

  /* --- Neutral (warm) --- */
  --bg:             #FFFFFF;
  --surface:        #FBFBF8;
  --surface-alt:    #F7F6F0;
  --border:         #EAE8DF;
  --border-strong:  #D8D5C8;
  --text:           #383830;
  --text-secondary: #6B6A5E;
  --text-tertiary:  #9A9889;

  /* --- Semantic --- */
  --receivable:   #5A6B47;
  --payable:      #B06850;
  --payable-soft: #C08870;
  --over-budget:  #B06850;
  --warn:         #C99A5B;
  --warn-soft:    #F0E6D2;

  /* --- Chart --- */
  --chart-1: #8A9C74;
  --chart-2: #A9B58C;
  --chart-3: #C7B98E;
  --chart-4: #B08E6A;
  --chart-5: #8FA0A0;
  --chart-6: #C0A9A0;

  /* --- Radius --- */
  --radius-sm:   8px;
  --radius-md:   12px;
  --radius-lg:   16px;
  --radius-pill: 999px;

  /* --- Spacing --- */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;
  --space-8: 48px;

  /* --- Shadow --- */
  --shadow-fab: 0 4px 12px rgba(56,56,48,0.12);
  --shadow-pop: 0 8px 24px rgba(56,56,48,0.10);

  /* --- Type --- */
  --font-num: "Roboto Flex", "DIN Alternate", system-ui, sans-serif;
  --font-tc:  "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif;
  --font-en:  "Inter", system-ui, sans-serif;
}
```

---

## 9. 語氣 Voice & Tone（UI 文案）

呼應 wireframe 設定頁的問候卡 `早安 · 今天也要好好記帳喔`——**溫和、像手帳、不說教。**

| 場景 | 原則 | 範例 |
| --- | --- | --- |
| 動作按鈕 | 動詞明確，同一動作全程同名 | `儲存並再記一筆`（不是「提交」） |
| 空狀態 | 邀請行動，不賣弄情緒 | `還沒有記錄，記下今天的第一筆吧` |
| 錯誤 | 說發生什麼 + 怎麼修，不道歉 | `金額還差 $120，補齊才能儲存` |
| 超支提醒 | 陳述事實 + 給脈絡，不責備 | `娛樂已超支 $100 · 本月還有 4 天` |
| streak | 輕量鼓勵，不製造焦慮 | `已連續記帳 12 天` |
| 分帳結果 | 直白說結果 | `A 欠你 $200 · B 欠你 $200` |

**避免**：驚嘆號堆疊、擬人化的「我幫你…」、把系統概念（欄位、同步、tombstone）暴露給使用者。

---

## 10. 一頁速查 Cheat Sheet

```txt
底色    白 #FFFFFF，卡片幾乎同色靠細線分隔
主色    鼠尾草綠 #8A9C74（CTA）/ #44503A（深）
hero    唯一實色卡片 #E9EEDD
應收    綠 +$   應付    陶土 −$（不是亮紅）
超支    陶土 #B06850   預警    赭黃 #C99A5B
文字    暖黑 #383830（非純黑）
數字    等寬 tabular-nums，獨立字體
icon    線性描邊 1.75，不填色
圓角    卡片 16 / 輸入 12 / chip 8
陰影    只有 FAB / sheet / dialog 有
動效    ≤400ms、無彈跳、尊重 reduced-motion
聲量    全畫面只給 hero 金額一個重點
```

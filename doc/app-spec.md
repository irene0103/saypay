# 分分帳 SayPay — iOS App 規格書 (app-spec.md)

> 版本：v0.1
> 上游文件：[spec.md](./spec.md) §8「路線圖：Web-first → App」
> 本文件只規範「把現有 Web App 包成 iOS App」這件事。產品功能、資料模型、計算邏輯一律以 spec.md 為準，此處不重述。

---

## 1. 目標與範圍

### 1.1 一句話

用 **Capacitor** 把現有的 Vue build 包成 iOS App。先用**免費的 Xcode 個人團隊**裝在自己的 iPhone 上，確認好用再付費走 **TestFlight**；公開上架列為最後一階段，有明確的前提條件（§8）。

### 1.2 為什麼現在做

spec.md §8.3 列的觸發條件，現在第一條已經成立：

| 觸發條件 | 現況 |
| --- | --- |
| **iOS 語音輸入要能用** | 「說一筆」已上線，但 iOS Safari 的 `webkitSpeechRecognition` 不穩，PWA 內更差（spec.md §3.7）。**這是主因** |
| 記帳提醒要能準時跳出 | 網頁版只能在打開 App 時顯示橫幅（spec.md §3.9） |
| 資料不被瀏覽器清掉 | App 的資料存在 App 自己的容器，不受 Safari ITP 七日清除影響（spec.md §3.12.1） |

### 1.3 三個階段

| 階段 | 目標 | 費用 | 需要 App Review |
| --- | --- | --- | --- |
| **A0. 免費自用** | 用 Xcode 直接把 App 裝到自己的 iPhone | **免費**（一般 Apple 帳號即可） | 不需要 |
| **A. TestFlight 內部測試** | 自己＋最多 100 位內部測試員從 TestFlight 安裝 | Apple Developer Program 每年 US$99 | **不需要**正式審核 |
| B. 公開上架 | 任何人可從 App Store 下載 | 同上 | 需要，且有 4.2 退件風險（§8） |

**A0 免費方案的限制（Xcode「Personal Team」）**

| 限制 | 影響 |
| --- | --- |
| 安裝的 App **7 天後失效**，要接上 Mac 用 Xcode 重新安裝 | 最大的不便。資料不會因此消失（重裝同一個 Bundle ID 會保留 App 資料），但每週要重裝一次 |
| 只能裝在自己的裝置，不能用 TestFlight 分給別人 | 純自用沒影響 |
| 同時最多 3 個自簽 App | 一般不會碰到 |
| 部分功能不能用：遠端推播、Sign in with Apple、iCloud 等 | **本文件階段 A 需要的都不受影響**：語音辨識、麥克風、本地通知、檔案分享都可以用 |

> 建議順序：**先用 A0 免費把 App 做出來、天天用**，確定值得再付費升級到 A。從 A0 升級到 A 不需要改程式碼，只是改用付費帳號簽章並上傳 TestFlight。
>
> **本文件的交付範圍是 A0 與 A。** 階段 B 只列前提與待辦，不在這一輪實作。

### 1.4 明確不做（這一輪）

| 不做 | 理由 |
| --- | --- |
| Android App | 同一份程式碼之後可加 `@capacitor/android`，但先把 iOS 做穩 |
| iPad 版面 | 先只支援 iPhone 直式。iPad 會以 iPhone 相容模式執行 |
| 伺服器推播（APNs remote push） | 目前沒有需要「別人觸發」的通知。記帳提醒用本地通知即可 |
| 桌面 Widget | 需要另寫 Swift WidgetKit，列為之後的加分項 |
| App 內購買 / 訂閱 | 無收費計畫 |
| 改寫成 React Native / Swift | Capacitor 可沿用約 95% 的程式碼（spec.md §8.1），重寫沒有收益 |

---

## 2. 架構

### 2.1 一份程式碼，兩種產出

```txt
            ┌──────────── vite build（mode: web）──→ dist/ → GitHub Pages（/saypay/）
src/ (Vue) ─┤
            └──────────── vite build（mode: app）──→ dist/ → npx cap sync ios → Xcode
```

| | Web（現況） | App |
| --- | --- | --- |
| `base` | `/saypay/` | `/` |
| 404 fallback（`spaFallback`） | 需要（GitHub Pages 沒有 rewrite） | 不需要（Capacitor 會把未知路徑交回 `index.html`） |
| 分享頁 `/s/:token` | 在這裡 | **不在 App 內**。App 產生的分享連結一律是 Pages 的絕對網址（spec.md §8.2 第 2 條） |

- 新增 npm script：`build:app`（`vite build --mode app`）、`ios`（`build:app` → `cap sync ios` → `cap open ios`）。
- Web 版持續存在，不因 App 而停止部署：分享連結的接收者不會為了看一筆欠款裝 App（spec.md §8.1）。

### 2.2 平台 adapter（硬性規則）

> **頁面與元件不得直接 import `@capacitor/*`。** 所有原生能力集中在 `src/platform/`，每個能力各有 web 與 native 兩種實作，用 `Capacitor.isNativePlatform()` 在執行時選擇。

| 能力 | 介面（概念） | Web 實作 | Native 實作 |
| --- | --- | --- | --- |
| 語音 | `useSpeechInput`（現有，介面不變） | Web Speech API（現有） | 原生語音辨識 plugin |
| 檔案輸出 | `download(filename, content, mime)`（現有 `src/lib/export.ts`） | Blob URL（現有） | 寫入暫存檔 → 系統分享面板 |
| 分享 | `shareText(title, text, url?)` | `navigator.share`，不支援時複製到剪貼簿 | `@capacitor/share` |
| 本地通知 | `scheduleReminder(time)` / `cancelReminder()` | no-op（維持 in-app 橫幅） | `@capacitor/local-notifications` |
| 外部連結 | `openExternal(url)` | `window.open` | `@capacitor/browser`（App 內瀏覽器） |
| 觸覺回饋 | `tap()` | no-op | `@capacitor/haptics` |

理由：

1. Web 版不會因為 import 了原生 plugin 而壞掉或變肥。
2. 現有呼叫端（`QuickEntryPage.vue`、`SettingsPage.vue`）只要介面不變就不用改。
3. 之後加 Android 只需補 native 實作。

### 2.3 App 外殼

| 項目 | 規範 |
| --- | --- |
| 狀態列 | `@capacitor/status-bar`，深色字、背景跟隨 `--color-bg` |
| 安全區域 | 沿用已完成的 `env(safe-area-inset-*)` 處理（`viewport-fit=cover`） |
| 啟動畫面 | `@capacitor/splash-screen`，底色同 App 背景，置中 logo；`ledger.load()` 完成後隱藏 |
| 鍵盤 | `@capacitor/keyboard`，`resize: body`，避免金額鍵盤／輸入框被遮 |
| 方向 | 僅直式 |
| 返回手勢 | iOS 右滑返回要對應 `router.back()`。需確認 Capacitor 產生的 WKWebView 是否開啟 `allowsBackForwardNavigationGestures`，未開啟則在 iOS 專案設定開啟 |
| 開發者工具 | `vite-plugin-vue-devtools` 只在 dev server 生效，App build 不會帶入；需在驗收時確認 |

---

## 3. 原生能力規格

### 3.1 語音輸入（最優先）

**目標：** iPhone 上按麥克風就能穩定辨識中文，取代不穩的 Web Speech API。

| 項目 | 規範 |
| --- | --- |
| 實作 | 社群原生語音辨識 plugin（iOS 底層為 `SFSpeechRecognizer`） |
| 語言 | `zh-TW` |
| 即時字幕 | 開啟 partial results，邊說邊顯示（與網頁版行為一致） |
| 開始 / 停止 | 沿用現有規則：再按一次**立即**結束，不等系統回報（見 commit `b37e747` 的修正理由） |
| 權限 | 首次使用時依序請求「麥克風」與「語音辨識」權限。被拒時提示「到 設定 → 分分帳 開啟」，並保留文字輸入 |
| 降級 | 沿用 spec.md §3.7 三層降級。Native 下「不支援」幾乎不會發生；「無網路」視 iOS 是否支援裝置端辨識而定，以 plugin 回報的可用性為準，不自行假設 |
| 解析 | 不變。辨識出的文字照樣交給 `src/core/nlParse.ts` |

**驗收：** 在實機 iPhone 上，對「說一筆」說出 spec.md §3.2.2 的三個例句，皆能辨識並解析出正確的卡片；連續開始／停止 10 次不卡住。

### 3.2 記帳提醒（本地通知）

**目標：** 落實 spec.md §3.6 / §3.9 的「記帳提醒（預設 21:00）」，在 App 沒開的時候也會跳出。

| 項目 | 規範 |
| --- | --- |
| 設定 | 設定頁「記帳提醒」：開關 + 時間，預設 21:00 |
| 權限 | **開啟開關時**才請求通知權限，不在首次啟動時就問 |
| 內容 | `今天還沒記帳，連續 N 天別斷了` |
| 「今天已記帳就不提醒」 | 本地通知在觸發當下無法執行程式判斷，因此改為**預先排程、事後取消**：每次 App 啟動與每次儲存記帳後重新排程——今天已有記帳 → 取消今天的、排明天的；尚無 → 排今天的 |
| 與 in-app 橫幅的關係 | Native 下以本地通知為主；打開 App 時的橫幅保留 |
| 預算提醒 | 不排程。預算 80% / 超支提醒本來就在儲存當下即時觸發（spec.md §3.5），不需要通知 |

**驗收：** 設定 1 分鐘後提醒、關閉 App，時間到會跳通知；當天先記一筆後，同一時間不再跳。

### 3.3 匯出與還原（L4 備份）

> **⚠️ 階段 A 的必要條件。** 同步（spec.md Phase 4）還沒做，App 的資料只存在手機上，**刪除 App = 帳全部消失**。在同步上線前，匯出＋還原是唯一的救援手段。

| 項目 | 規範 |
| --- | --- |
| 匯出 JSON / CSV | 產生檔案後開啟系統分享面板，使用者可存到「檔案」App、iCloud Drive，或用 LINE / Email 傳給自己 |
| **還原 JSON** | 目前**尚未實作**（設定頁有標示「可還原」但沒有功能）。需補上：選擇檔案 → 驗證 schema（Zod）→ 顯示摘要（N 筆記帳、N 位成員…）→ 二次確認 → 寫入 |
| 還原策略 | **合併，以 `id` 為準，`updatedAt` 較新者勝**。不清空現有資料，避免「還原錯檔案」直接毀掉帳本 |
| 每月提醒 | spec.md §3.12 L4 的每月匯出提醒，在同步上線前於 App 內顯示 |

**驗收：** Web 版匯出 JSON → 在 App 還原 → 筆數、餘額、群組完全一致；同一份檔案重複還原，資料不會重複。

> 這同時解決「從 Web 搬到 App」：iPhone 上 Safari 與 App 的資料是分開的，搬家方式就是 Web 匯出 → App 還原。

### 3.4 分享欠款

| 項目 | 規範 |
| --- | --- |
| 觸發 | 分帳頁人員列的「分享」 |
| 行為 | 開系統分享面板，內容為文字摘要＋分享連結（連結本體依 spec.md §3.11，Phase 5 完成前只分享文字摘要） |

### 3.5 生物辨識鎖（階段 B 才做）

spec.md §3.6 的「密碼 / 生物辨識鎖」。App 回到前景且離開超過 N 分鐘時要求 Face ID。列在這裡是因為它是降低 4.2 退件風險的原生功能之一（§8），階段 A 不實作。

---

## 4. iOS 專案設定

| 項目 | 值 | 備註 |
| --- | --- | --- |
| App 顯示名稱 | 待定（§10 待確認 #1） | 主畫面圖示下方的名字 |
| Bundle ID | 待定（§10 待確認 #2） | 建立後**不可更改** |
| 版本號 `CFBundleShortVersionString` | 跟 `package.json` 的 `version` | 目前是 `0.0.0`，第一版改為 `0.1.0` |
| Build 號 `CFBundleVersion` | 每次上傳 TestFlight +1 | 同一版本號可以有多個 build |
| 支援裝置 | iPhone | |
| 方向 | 直式 | |
| 最低 iOS 版本 | 以當時 Capacitor 版本的最低需求為準 | 不自行調低 |
| 加密出口合規 | `ITSAppUsesNonExemptEncryption = NO` | 只使用 HTTPS，上傳時就不用每次回答 |

### 4.1 Info.plist 權限說明文字

| Key | 文字 |
| --- | --- |
| `NSMicrophoneUsageDescription` | 用麥克風聽你說的記帳內容，例如「昨天吃火鍋 300 元」。 |
| `NSSpeechRecognitionUsageDescription` | 把你說的話轉成文字，再整理成記帳項目。 |
| `NSFaceIDUsageDescription`（階段 B） | 用 Face ID 解鎖，保護你的帳本。 |

> 文字要說清楚「為什麼需要」，空泛的說明（例如「需要使用麥克風」）是常見退件原因。

### 4.2 App 圖示

- 需要 **1024×1024 PNG、不透明、無圓角**的原始檔，Xcode 會自動產生各尺寸。
- 目前 repo 只有 `public/logo.ico`，**需要高解析度原始 logo**（§10 待確認 #3）。

---

## 5. 發佈流程

### 5.0 免費安裝到自己的 iPhone（A0）

1. 安裝 Xcode，並執行 `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`。
2. Xcode → Settings → Accounts 用**一般 Apple 帳號**登入，會自動得到一個「Personal Team」。
3. iPhone 用線接上 Mac，在 iPhone 上信任這台電腦；並到 iPhone 的 設定 → 隱私權與安全性 → **開發者模式** 開啟（會要求重新開機）。
4. `npm run ios`（= `build:app` → `cap sync ios` → `cap open ios`）。
5. Xcode 專案 → Signing & Capabilities：Team 選 Personal Team，Bundle ID 填一個自己的（例如 `io.github.irene0103.saypay`）。
6. 上方裝置選你的 iPhone → 按 ▶︎ Run。
7. 第一次開啟時，iPhone 會擋下來：到 設定 → 一般 → VPN 與裝置管理 → 信任你的開發者憑證。
8. **每 7 天**重做第 6 步重新安裝，資料會保留。

### 5.1 TestFlight 一次性設定（A）

1. 加入 Apple Developer Program（個人身分）。
2. 安裝 Xcode，並執行 `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`。
3. Xcode → Settings → Accounts 登入開發者帳號。
4. App Store Connect → 我的 App → 新增 App：平台 iOS、名稱、主要語言「繁體中文」、Bundle ID、SKU。
5. Xcode 專案 → Signing & Capabilities：選 Team，勾選 Automatically manage signing。

### 5.2 每次發版

1. `sprint` 分支完成並測試。
2. `npm run build:app && npx cap sync ios`
3. Xcode：Build 號 +1 → 目標選 **Any iOS Device** → Product → **Archive**。
4. Organizer → **Distribute App** → App Store Connect → Upload。
5. App Store Connect → TestFlight：等待處理完成（通常數分鐘到數十分鐘），回答出口合規（已在 Info.plist 設定則自動略過）。
6. 內部測試群組加入自己 → iPhone 上的 **TestFlight** App 安裝或更新。

> TestFlight 的每個 build **90 天後過期**。只要持續發版就不受影響。

### 5.3 發版前檢查清單

- [ ] `npm run test:unit` 全過、`vue-tsc` 無錯
- [ ] `build:app` 的 `base` 是 `/`（打開 App 不是白畫面）
- [ ] 實機測過：說一筆、記帳、分帳、結清、匯出／還原
- [ ] 版本號 / Build 號已更新
- [ ] 沒有 dev 專用的東西進到 App（Vue DevTools、`seedDev` 示範資料）

---

## 6. 資料與隱私

| 項目 | 階段 A（TestFlight） | 階段 B（公開上架） |
| --- | --- | --- |
| 資料位置 | 僅存在手機（App 容器內的 IndexedDB） | 手機 ＋ Supabase 同步（spec.md §6.1） |
| 刪除 App | **資料消失**，僅能靠匯出檔還原 | 綁定帳號後可從雲端取回 |
| 語音 | 音訊交給 iOS 語音辨識處理，App 不保存音訊 | 同左；隱私權政策需揭露 |
| 隱私權政策 | 內部測試不強制 | **必要**，放在 GitHub Pages |
| App 隱私問卷 | 不需要 | 依實際收集內容填寫；接上 Supabase 後要更新 |
| 帳號刪除 | 無帳號，不適用 | 有帳號就**必須**能在 App 內刪除（準則 5.1.1(v)），spec.md §3.6 已規劃 |
| 第三方登入 | 無 | 提供 Google 登入時須同時提供 Sign in with Apple（準則 4.8） |

---

## 7. 開發任務與驗收

| # | 任務 | 依賴 | 驗收 |
| --- | --- | --- | --- |
| A0 | Xcode 安裝、以一般 Apple 帳號登入（Personal Team） | 使用者操作 | Xcode 能登入、能選 Team |
| A1 | Capacitor 初始化、`build:app`、iOS 專案、App 外殼（§2.3） | A0 的 Xcode | 模擬器上 App 能開、各頁可用、不是白畫面 |
| A2 | `src/platform/` adapter 骨架；`download` 改走 adapter | A1 | Web 版行為不變；App 內匯出會開分享面板 |
| A3 | **JSON 還原**（Web 與 App 共用） | — | §3.3 驗收 |
| A4 | **原生語音**接進 `useSpeechInput` | A1、實機 | §3.1 驗收 |
| A5 | 本地通知記帳提醒 | A1 | §3.2 驗收 |
| A6 | 圖示、啟動畫面、權限文字 | logo 原始檔 | 主畫面圖示正確、權限視窗文字正確 |
| A7 | 免費安裝到自己的 iPhone（§5.0） | A1–A6 | 實機日常使用一週 |
| A8 | （付費後）加入 Developer Program、建立 App Store Connect 記錄、第一次上傳 TestFlight | A7 | iPhone 從 TestFlight 安裝成功 |

> A3 不依賴任何 Apple 相關的東西，**可以最先做**，同時解決 Web 版「設定頁寫可還原但其實不能還原」的落差。

---

## 8. 階段 B：公開上架的前提

> 以下全部完成才送 App Review。

1. **同步上線**（spec.md Phase 4：匿名帳號 + Supabase + 綁定 Google / Apple）。沒有同步就公開上架，等於讓陌生人把帳存在一個刪掉就沒了的地方。
2. **降低 4.2（Minimum Functionality）退件風險**：審核會退回「只是包一層網站」的 App。至少具備：原生語音（A4）、本地通知（A5）、系統分享（§3.4）、Face ID 鎖（§3.5）。這能降低風險，但**無法保證通過**。
3. 帳號刪除、Sign in with Apple（§6）。
4. 隱私權政策網址、支援網址、App 隱私問卷。
5. 上架素材：App Store 截圖（以 App Store Connect 當下要求的尺寸為準）、名稱、副標題、描述、關鍵字、分類（財務）、年齡分級。
6. 先以 TestFlight **外部測試**（需經 Beta App Review）讓幾位朋友試用，再送正式審核。

---

## 9. 決策記錄

延續 spec.md §11 的編號。

| # | 議題 | 決策 | 依據 |
| --- | --- | --- | --- |
| 47 | App 技術 | **Capacitor 包同一份 Vue build**，不重寫。Web 版持續部署 | §2.1、spec.md §8.1 |
| 48 | 上架範圍 | **先免費自簽安裝自用，再 TestFlight 內部測試**；公開上架以同步上線為前提 | §1.3、§8 |
| 49 | 原生能力的接法 | 一律經 `src/platform/` adapter，頁面不得直接 import `@capacitor/*` | §2.2 |
| 50 | TestFlight 前的資料保護 | **JSON 還原為必要條件**（合併、`updatedAt` 新者勝） | §3.3 |
| 51 | 支援裝置 | **僅 iPhone、直式** | §1.4 |
| 52 | 記帳提醒的「今天已記就不提醒」 | 本地通知預先排程、記帳後取消並改排明天 | §3.2 |

---

## 10. 待確認事項

| # | 問題 | 影響 |
| --- | --- | --- |
| 1 | App 顯示名稱：「分分帳」、「SayPay」，或兩者並列？（spec.md 標題用「分分帳 SayPay」，網頁 `<title>` 是「Say Pay」） | 主畫面圖示名稱、App Store Connect 的 App 名稱 |
| 2 | Bundle ID（例如 `io.github.irene0103.saypay`）。**建立後不能改** | App Store Connect App 記錄 |
| 3 | 高解析度 logo 原始檔（≥1024px 的 PNG 或 SVG） | 圖示與啟動畫面（A6） |
| 4 | 付費開發者帳號以個人或公司名義註冊（A0 免費階段不需要決定） | App Store 上顯示的開發者名稱 |

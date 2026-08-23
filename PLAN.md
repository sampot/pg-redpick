# 撿紅點（`pg-redpick`）— 遊戲規劃文檔

> **用途：** 本 repo 的遊戲權威規格——coding agent 改動前必讀：這個遊戲是什麼、規則、設計限制、優化方向。
> **整理方式：** 從本 repo 實作反向整理（2026-08-23）。**改玩法先改此檔再改碼**；本檔與程式碼衝突時，以「規則（§3）」描述的設計意圖為準回報差異。
> **上游契約：** [PG-GAME-AGENT-GUIDE.md](https://github.com/sampot/playgrounds/blob/main/docs/PG-GAME-AGENT-GUIDE.md)（唯一必讀；本檔不重複其全文）· 型錄條目 `playgrounds/catalog/entries/pg-redpick.yaml`

## 1. 一句話

對點數撿牌的台式撿紅點：單機你＋三 AI，或包廂四人連線（`redpick.v1`）；紅點計分疊加清桌／多紅／紅 A／連撿獎金，最高分勝。

## 2. 定案速覽

| 項 | 值 |
| --- | --- |
| catalog id / kind / series | `pg-redpick` / `game` / `桌遊` |
| status | `listed` |
| 模式 | 單機 4 人（你 vs 小梅／阿心／黑哥）；包廂 4 人連線＋觀戰 |
| 牌組/發牌 | 52 張；各 5 張、桌上 4 張、牌堆 28 張（`HAND_SIZE=5`、`TABLE_START=4`） |
| 計分 | 紅點（A=20；10JQK=10；2–9 面值；黑=0）＋加成獎金；終局剩桌牌歸最後撿牌者 |
| 對手 AI | 單一難度：收益最大化撿牌、避免餵紅牌 |
| 素材 | CSS/DOM 牌面＋WebAudio 合成音效；系統字型（見 `ATTRIBUTION.md`） |
| 交付形 | 純 HTML＋CSS＋ESM JS；無 build；`npx vitest run` 測試 |

## 3. 完整規則（現行實作）

### 3.1 流程

- 發牌輪流各 5 張→桌面亮 4 張→其餘 28 張進牌堆。每回合打一張手牌：
  - 與桌上任一張**同點數**（rank 相同即可，花色不限）：出手牌＋桌上該點數**全部**張數收進自己牌堆，並結算加成；
  - 對不到：該牌亮到桌上（重新排序），且**連撿中斷歸零**。
- 打牌後若牌堆有牌即補一張（從牌堆頭 `shift()`）。牌堆空且四家手牌全空→終局。

### 3.2 計分與加成（`play` 內實際值）

| 項 | 值 | 觸發條件 |
| --- | --- | --- |
| 紅點 | A=20；10/J/Q/K=10；2–9=`rank+1`；黑牌=0 | 收進牌堆的每一張紅牌（♦♥） |
| 清桌 | +15 | 一次把 ≥2 張的桌面撿光（`swept = matches.length === tableBefore && tableBefore ≥ 2`） |
| 多紅 | +5×(紅張數−1) | 單次捕獲含 ≥2 張紅牌 |
| 紅 A | +10 | 捕獲含紅 A（♦A／♥A） |
| 連撿 | +(n−1)×5 | 第 n 次連續成功撿牌（n≥2；放牌即斷） |

- 即時分數 `totalScore = pileScore(牌堆紅點) + bonuses[seat]`（獎金與紅點分開累計）。`previewCapture()` 用同一公式供 UI 預覽（出牌鈕顯示「撿走 +N」或「放到桌上」）。
- 終局：桌上剩牌整批給最後一次撿牌者（無人撿過則丟棄）；總分最高者勝。平手時 `winner` 仍記首位最高分者，訊息列改播「終局平手」並列名。

### 3.3 AI 行為（`ai.js`）

- 對手牌每張跑 `previewCapture` 評分：可撿 → `2000 + 總得分×12 + (清桌?80:0) + 連撿×15`；不可撿 → 紅牌 `-cardPoints×3`（不餵分）、黑牌 `40 − rank`（墊小的）。
- 危險修正：若**其他玩家手牌**持有同點數，紅牌再 −25——注意這是直接讀 `game.hands` 的簡化「偷看」，非明牌推估（如實記錄）。
- 取評分最高者出。節奏：UI 延遲 `420 + Math.random()×380` ms；AI 手牌空時先推進回合。

### 3.4 邊界處理

- 非法操作一律拒絕並回中文原因（未開局／還沒輪到／手牌沒有這張）；線上版再加 role 校驗與滿席閘（§5.1）。UI 以 status 列＋deny 音呈現，禁原生對話框。
- `advanceTurn` 在牌堆乾後跳過空手牌座位（guard ≤4），避免殘局卡死；補牌只在牌堆有牌時進行。
- 分頁隱藏／關閉（`visibilitychange`／`pagehide`）走 `lifecycle.js` 純函式計畫：停 AI timer、停席位輪詢、清選牌、暫停 AudioContext；恢復僅在「單機仍在對局」（resume AI）或「仍是主持」（resume poll）時成立。

## 4. 操作與畫面

| 輸入 | 動作 |
| --- | --- |
| 點手牌 | 選取（可對到的亮金邊）；**再點已選牌＝直接出**（兩段式免常駐按鈕） |
| 出牌撿點 | 打出選牌；撿到時浮出 +N 大字、清桌有全桌閃光 |
| 取消 | 清空選牌 |
| 開局／重來 | 單機發牌／回待機（非破壞性） |
| 發牌開局／再來一局 | 包廂主持專屬（滿席 ready／ended 才顯示） |

- 四方位版型（下=我，視角旋轉 `toVisual/toLogical` 讓線上任一席都在下方）；分數板四 chip 高亮回合者與領先者、連撿 ×n 徽章；HUD 有下一位、牌庫數、連撿、你的合計。
- 畫面相位由 `ui-state.js deriveChromeState` 推導 setup/match/over 三態；room 面一律隱藏單機控件（CSS `[data-pg-surface="room"]`）。Mobile-first；觀戰者四席皆牌背＋名字。

## 5. 持久化（KV 權威）

| key | 內容 | 讀寫時機 |
| --- | --- | --- |
| `session:redpick:v1`（KV，`protocol.js REDPICK_STATE_KEY`） | 包廂對局全量 store：sessionId/channelName/seq/status(waiting\|ready\|active\|ended)/seated/turn/hands/piles/bonuses/streaks/table/stock/scores/winner/message/lastAct/lastCapturer/names | functions.js 每次 open/presence/act 後整份 PUT |
| （無）localStorage / `/api/kv` 個人統計 | — | 本 repo 未用；音效偏好僅記憶體 |

- key 已帶 `session:redpick:v1` 前綴（符合命名慣例），但為**單一全域 key、無 sessionId 尾綴**：同一 KV 環境僅支撐一場包廂對局，第二場 open 不同 sessionId 會整份覆蓋第一場。多場並行前須改 per-session key（如 `session:redpick:v1:<sessionId>`），實作時在此登記。

### 5.1 包廂連線協定 `redpick.v1`（已實作）

常數單一來源＝`protocol.js`（UI 與 functions.js 共用；型錄條目 protocols 同步此處）：

- 身分：roles `host/p2/p3/p4` 各限 1 人（`REDPICK_ROLE_LIMITS` 全 1）、`joinPolicy: invite_only`；host＝席 0。capabilities：`deal/play/reset/sync`。
- act（POST `/api/session/act`，body `{role, payload:{type,…}}`）：

| type | 允許 role | 前置條件 | 效果 |
| --- | --- | --- | --- |
| `deal` | 僅 host | status ∈ {ready, ended} 且四席全滿 | 新 `RedpickGame.deal()` 寫回 store，status→active |
| `play` | 四席 | status=active、輪到該席、payload.cardId 為整數 | 走 `game.play(seat, cardId)`，拒絕原因透傳 |
| `reset` | 僅 host | status=ended | 清空牌面回 ready（仍滿席）/waiting |
| `sync` | 全部＋spectator | store 已存在 | 回當下霧化快照（guest 取私牌的唯一路徑） |

- 事件（放進回應 `events[]`，經 BroadcastChannel(channelName) 以 `{type:"session-event", event}` 廣播；`seq` 單調遞增，client 丟棄 `seq ≤ lastSeq` 的舊事件，`session.closed` 除外）：
  - `match.status {status, seatedCount, seated, names, seq}` — 入座變化
  - `match.dealt {turn, handCounts:[5,5,5,5], stockCount:28, table, liveScores, streaks, names, message, seq}`
  - `match.played {seat, cardId, turn, over, captured, points, table, handCounts, stockCount, liveScores, streaks, winner, names, message, seq}`；終局追加 `match.over {winner, scores, liveScores, names, message, seq}`
  - `match.reset {…}`；`session.closed {reason:"opponent_left"|"host_closed", seq}`
- 回應封套統一 `{ok, events[], state, seq, sessionId, channelName}`；`state` 經 `viewForRole(store, viewerRole)` **霧化**：只帶自己席的 `hand`；spectator 一律明牌（`hand:[]`、永不見任何 hands/stock 原始陣列，只有 handCounts/stockCount）。
- viewerRole 解析順序：query `?role=` → body role → `env.SESSION.getSeat()`。
- 傳輸三路徑：①畫布直呼本 functions.js（env.KV 存取 store）；②guest 走宿主隧道 `env.SESSION`（seat/channel/state/act/leave 代理；tunnel 的 getState 是 stub，故 guest 收到公開事件後以 `sync` act 補拉私牌）；③主持走 `/api/online/*` 代理 `env.HOST`：open/close/status/domain（白名單僅轉發 `/api/session/*`）/invite/revoke。
- 入座流程：host 每 2 秒輪詢 `/api/online/status` 並把 seats 映射成 `presence` POST（seatedRoles 或 seats+playerSeated 皆可解析；displayName 疊蓋席名）；滿席 waiting→ready；**滿席後有人離場→發 `session.closed` 並整份清空 store**。room 面 boot 順序：tryBootAsPlayer → tryBootAsSpectator → 最多 20 次×250ms 重試 tryBootAsRoomHost/spectator。
- 快捷鍵級細節：同 sessionId 重複 open 不清席位與 names（host remount 保護，測試釘死）。

## 6. 美術／音效／署名

- 見 `ATTRIBUTION.md`：牌面為 CSS/DOM 文字繪製（rank＋花色＋紅點徽章）、音效全 WebAudio 合成（`audio.js`，master 0.24；capture 依 points≥10/≥25 疊加音色、sweep 六連升音、deal/select/place/bonus/win/deny/turn）、字型系統堆疊。無第三方素材，無外部授權義務（照專案慣例仍保留署名檔）。
- 新增素材一律拷進 `assets/`、更新 `ATTRIBUTION.md`（CC0 也須署名）、同步 `sam-manifest.json` files。

## 7. 測試（`npx vitest run`）

現有覆蓋（6 檔 49 例）：`game.test.js`（紅點計分表、pileScore 只算紅、清桌加成、首張策略打完整局到 over）；`functions.test.js`（meta 四 role、open 寫 KV、滿席才 ready、presence 席名疊蓋、remount 保留席位、由 seats 陣列反推入座、中途離席→closed+清空、未滿席拒發牌、發牌霧化只見己手、觀戰 state/sync 純明牌、非輪到拒絕、match.played 帶 names 與次手、剩桌牌歸最後擷者、四席接力打完整局、sync 回呼叫者私牌、SESSION seat 代理、HOST open 代理）；`lifecycle.test.js`（暫停／恢復計畫矩陣）；`ui-state.test.js`（solo 控件顯示條件、setup/match/over 相位）；`shellSurface.test.js`（query/meta/solo 預設）；`sources.test.js`（html 協定 meta、描述不以協定 id 開頭、boot 函式存在、觀戰文案、await PG.ready、visibility 掛鉤、chrome 推導、CSS room 隱藏、manifest 含 lifecycle/ui-state/shellSurface）。

改動規則／AI／協定必補對應邊界測試；`app.js` DOM 行為不在單元測試範圍（sources.test.js 僅做原始碼 smoke）。

## 8. 硬約束（不可違反）

1. 僅 HTML＋CSS＋JS（ESM）；**無 build**、不入庫 `node_modules`、不安套件；工具一律 `npx <pkg>` 臨時執行。
2. 禁瀏覽器原生 `alert`／`confirm`／`prompt`；確認／錯誤一律頁內 UI（status 列、online-meta）。
3. Mobile-first：單屏牌桌、主操作不可 hover-only。
4. 線上對局的唯一 KV 是 `session:redpick:v1` session store（§5）；新增跨局統計必走 `/api/kv/{key}` 且帶 `pg-redpick-` 前綴，禁止裸 localStorage 當權威。
5. 不自行載入 `sdk.js`；宿主注入 `window.PG`（boot 先 await `pg.ready`，靜態伺服無 SDK 也要能玩）。
6. 改動可執行邏輯前先寫失敗測試（TDD）。
7. 檔案清單變動須同步 `sam-manifest.json`（含 lifecycle/ui-state/shellSurface）。
8. 協定常數以 `protocol.js` 為 UI/functions 單一來源；改 `redpick.v1` 行為須同步型錄條目 protocols 與 `functions.test.js`，且不得破壞手牌霧化（viewForRole）與 seat↔role 校驗。

## 9. 優化建議（可玩性與樂趣）

依優先級；實作前先在此登記並補測試。原則：強化算分決策與重玩誘因，不改變「對點數撿牌＋獎金疊加」的核心認同。

**高優先**

1. **單機戰績持久化**：線上有 session store 但單機跨局統計為零。以 `/api/kv/pg-redpick-stats` 存場次/勝場/最佳單局得分（LS 當快取鏡像），結算面板顯示生涯數字——補上單機模式的重玩目標。
2. **AI 改明牌推估＋難度二段**：現行 AI 直接讀各家手牌判危險（§3.3），既不公平也無難度曲線。改為只用桌面明牌＋已現紅牌推估危險度，並提供「休閒（移除 danger 修正）／標準」兩檔——誠實且讓新手有得贏。
3. **結算明細面板**：`lastAct.result` 已存 base/bonus/tags，但終局只播一句話。攤開逐家「紅點 X＋獎金 Y＝Z」與本次捕獲標籤（清桌/紅A/連撿×n），強化「算分」的樂趣回饋。

**中優先**

4. **牌堆回收提示**：終局剩桌牌歸最後撿牌者是最大策略槓桿，但 UI 只在規則摺疊區提過一次。殘局（牌庫 ≤4）時 HUD 提示「下一張收牌者將吃掉剩桌牌」，讓搶最後撿權變成顯性博弈。
5. **手牌排序切換**：固定 rank,suit 排序在高張時不易比對桌面；加「點數/花色」排序切換或同點數群組化，降低掃描成本（行動裝置尤其）。
6. **AI 個性化**：沿用既有名字給不同權重（小梅保守少餵、阿心標準、黑哥激進搶清桌），調 `ai.js` 評分係數即可，提升每局節奏差異。

**低優先**

7. 觀戰強化：state 已送 `piles`，觀戰面可顯示各家捕獲張數／紅點小計，讓包廂大螢幕更有看頭。
8. 音效：連撿 ×n 疊加音高（streak 已在 result 內，易接）；震動回饋（`navigator.vibrate`）。

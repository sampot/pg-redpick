# pg-redpick

瀏覽器**撿紅點**：四人桌（你＋三名簡易 AI）、對點數撿牌、只計紅心／方塊分數、自製音效。純前端；**mobile-first**，桌面加寬。

名稱與計分配置為原創小品，致敬「撿紅點／對點數撿牌」玩法類型，非任一商業作品復刻。

也可當作 [Playgrounds（遊樂場）](https://play.samkuo.me/) 的 **SAM**（`index.html` 入口）。

## 一鍵開 SAM 小

**[一鍵開 SAM 小](https://play.samkuo.me/?open=sampot%2Fpg-redpick&name=%E6%92%BF%E7%B4%85%E9%BB%9E)**

```
https://play.samkuo.me/?open=sampot/pg-redpick&name=撿紅點
```

同源會重用本機已匯入的沙盒；要強制新建可加 `&fresh=1`。

## 試玩（本機）

```bash
npx --yes serve .
# 或
python3 -m http.server 8080
```

點一下頁面後音效才會出聲。

## 操作

| 操作 | 說明 |
| --- | --- |
| **開局** | 發牌（各 5 張、桌上 4 張） |
| 點手牌 | 選一張（可對到的會有金框提示） |
| **出牌撿點** | 對到相同點數則收走；否則放桌上並補牌 |
| **取消選取** | 清空選牌 |
| **音效開／關** | 靜音 |
| **重來** | 回待機 |

## 計分

只計紅心／方塊：A＝20；10／J／Q／K＝10；2–9＝點數；黑桃／梅花＝0。紅點最高者勝。

## 檔案

| 檔案 | 說明 |
| --- | --- |
| `index.html` | 結構 |
| `styles.css` | 手機優先／桌面遞增 |
| `app.js` | UI、選牌、AI 節奏 |
| `game.js` | 發牌、對點、計分 |
| `ai.js` | 簡易人機 |
| `audio.js` | Web Audio 合成音效 |
| `functions.js` | Playgrounds 可選 stub |

## License

MIT

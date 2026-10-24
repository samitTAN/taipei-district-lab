# 架構

前端使用原生 HTML、CSS、JavaScript；Python FastAPI 提供資料 API、方案驗證與同源前端頁面。Node.js 用於前端資料準備、建置與煙霧測試。另保留純靜態預覽模式。

## 檔案責任

- `src/index.html`：繁體中文頁面、地圖、側欄與說明對話框。
- `src/style.css`：桌面與行動版排版、選區色彩及焦點提示。
- `src/app.js`：讀取圖資、SVG 投影、選區操作、方案驗證、儲存與分享。
- `scripts/prepare-data.mjs`：核對固定資料來源，擷取台北市。
- `scripts/build.mjs`：輸出可由任意靜態主機提供的 dist。
- `tests/smoke.cjs`：以 Node.js VM 與最小 DOM 模擬，驗證核心行為。

現行配置與使用者草案分開保存；切換現行模式不覆蓋草案。操作前保存快照，可復原／重做。v1 鄰接資料由共用座標點建立；v2 則使用官方里界的共邊鄰接，定義見 DATA.md。

## 舊版相容方案 JSON v1

```json
{
  "version": 1,
  "city": "臺北市",
  "unit": "district",
  "name": "我的台北選區方案",
  "count": 6,
  "assignments": {
    "北投區": 1,
    "士林區": 1,
    "內湖區": 2,
    "南港區": 2,
    "松山區": 3,
    "信義區": 3,
    "中山區": 4,
    "大同區": 4,
    "中正區": 5,
    "萬華區": 5,
    "大安區": 6,
    "文山區": 6
  }
}
```

count 為 1–12 整數；所有 12 個行政區必須存在；分配值 0 為未分配，其他值為 1 至 count。名稱最多 60 字元。匯入檔案大小上限 100,000 bytes。

localStorage 鍵為 `taipei-plan-v1`，目前只保留一份手動儲存的方案。分享連結為 `#plan=` 加上百分比編碼的 JSON，包含分享當時的快照，不提供同步更新、伺服器備份或存取權控管。

0.3.0 已提供 v2 逐里格式及 v1 遷移，詳見下方；v1 仍可由相容 API 驗證。

## FastAPI 後端（0.2.0）

`backend/main.py` 提供 HTTP 路由與前端入口，`backend/domain.py` 處理嚴格方案 schema 與連通分析。`create_app` 可注入圖資與前端路徑供測試使用。後端快取圖資，變更檔案後需重啟服務。

| API | 用途 |
| --- | --- |
| GET /api/health | 程序存活 |
| GET /api/ready | 圖資可用性 |
| GET /api/districts/current | 第 14 屆配置、席次及原住民選區 |
| GET /api/districts/geometry | GeoJSON 行政區界 |
| GET /api/data/source | 圖資來源、版本與授權狀態 |
| POST /api/plans/validate | 接收 v1 JSON，回傳正規方案及完整性、連通檢查 |

`/docs` 為互動 API 文件，`/openapi.json` 為規格。格式錯誤回傳 422；圖資未準備好回傳 503。空選區、未分配與未相連是可討論的草案狀態，會以檢查結果回傳而非拒絕整個請求。

FastAPI 提供頁面時注入 `/api` 設定；0.2 版前端由 API 讀取配置與地圖，匯入方案時再經後端驗證。靜態預覽仍可獨立運作；此模式保留瀏覽器內原有驗證。伺服器不儲存方案，localStorage、匯出與 fragment 分享行為維持不變。後端只提供同源 API，沒有開放任意來源的 CORS。

## 逐里方案 v2（0.3.0）

新版前端讀取 GET `/api/villages/geometry`（靜態模式為 taipei-villages.json），每個 Feature 的 properties 含 id、town、village、label、center 與 neighbors。圖資版本在 FeatureCollection 的 dataset_version。

v2 JSON 使用 version=2、unit=village，新增 dataset_version；assignments 為完整 456 個官方里代碼對應選區（0 為未分配）。其他欄位與 v1 相同。FastAPI `/api/plans/validate` 同時接受 v1 與 v2；v2 會核對整份里代碼集合及圖資版本。POST `/api/plans/migrate` 接受 v1，依各里所屬行政區回傳 v2。

前端匯入 v1 JSON、本機 taipei-plan-v1 或舊 #plan= 分享網址時，自動展開成 456 里；新存檔使用 taipei-plan-v2，保留舊存檔。新版 #v2= 分享格式依穩定排序的 456 代碼，使用 456 個十六進位字元表示分配，再附圖資版本、選區數與方案名稱。資料版本不同拒絕解碼，不以陣列位置猜測舊圖資。

拖曳塗選一筆 gesture 只記一份歷史快照；地圖平移不修改分配。搜尋與整區操作使用同一份里代碼集合，整區分配可一次復原。共邊檢查依處理圖資時產生的鄰接表執行，前後端採相同資料。

## 選舉資料（0.4.0）

backend/elections.py 載入已核對的公開歷史結果並組合單里／單所回應；資料缺失不影響里界 API。前端於地圖載入後另外讀取選舉結果，失敗時保留地圖重劃功能。查詢 API 及分母、版本與地址限制見 ELECTIONS.md。

點里、搜尋定位或開始一筆塗選會選取對應里；拖曳後續筆畫不反覆改變查詢。里／所結果另置於地圖下方，不混入草案的分配狀態。CSV 匯出只包含目前里／所的公共候選人得票與原選區當選標記。

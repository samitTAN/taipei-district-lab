# 台北選區實驗室 · Taipei District Lab

以開放原始碼，讓公民看懂台北市議員選區，並探索自己的選區方案。

[GitHub 原始碼](https://github.com/samitTAN/taipei-district-lab) · [線上版本](https://taipei-district-lab.violetguppy133.chatgpt.site/) · [資料來源與限制](docs/DATA.md) · [貢獻指南](CONTRIBUTING.md) · [發展規劃](docs/ROADMAP.md)

## 目前功能

- 檢視第 14 屆六個區域議員選區與應選席次，另說明兩個原住民身分選區。
- 以 12 個完整行政區為單位，自由分配、新增或移除選區。
- 未分配、空選區與圖資鄰接檢查；復原及重做。
- 本機瀏覽器儲存、JSON 匯入匯出與連結分享。
- 繁體中文介面，無需帳號；不使用外部 JavaScript 套件。

**這仍是行政區級探索版本：未提供逐里劃分、人口統計或法定席次計算。舊圖資尚未驗證為現行邊界。** 本工具不是官方選務網站，不為任何政黨或候選人背書。

## 快速開始

需要 Python 3.10 以上、Node.js 22 以上（建議 24）。後端採 FastAPI／Uvicorn，不需要資料庫或 API 金鑰。

```sh
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -e '.[dev]'
npm ci
npm run data:prepare
npm run build
npm run dev
```

開啟 <http://127.0.0.1:8000>，API 文件在 <http://127.0.0.1:8000/docs>。Windows PowerShell 使用 `.venv\Scripts\Activate.ps1` 啟用虛擬環境。修改前端 `src/` 後重新執行 `npm run build`；後端開發模式會自動重載。`npm start` 啟動不自動重載的 FastAPI 服務；`npm run preview:static` 僅提供不含 API 的靜態預覽。

`data:prepare` 會從固定版本的第三方來源下載歷史行政區界、核對 SHA-256，擷取台北市 12 區。圖資不在 Git 中散布，也不適用本專案 MIT 授權；使用與再散布前請閱讀 [資料文件](docs/DATA.md)。已有原始下載檔時，可離線執行：

```sh
npm run data:prepare -- --source /absolute/path/to/twtown2010.3.json
```

## 檢查與測試

```sh
npm run check
npm test
python -m pytest
```

先準備資料並完成 build。測試涵蓋地圖資料、選區分配、連通提示、復原／重做、儲存／載入、分享格式及無效匯入。測試使用輕量 DOM 模擬，不能代替真實瀏覽器視覺與無障礙檢查。GitHub Actions 會在 Node.js 22／24 驗證前端，並在 Python 3.10／3.12 執行 FastAPI 整合測試。

## 專案結構

```text
backend/              Python FastAPI 路由、schema 與方案檢查
src/                  網頁原始碼（HTML、CSS、JavaScript）
data/source.json      圖資來源、版本、雜湊與授權狀態
scripts/              資料準備、建置與本機伺服器
tests/                前端煙霧測試與 Python API 整合測試
docs/                 架構、資料、部署及發展規劃
.github/              CI、Issue 與 PR 範本
dist/                 建置輸出，不納入版本控制
```

現有的 `taipei-district-lab/` 是此工作區保留的獨立 Sites 部署 checkout，已排除於這個公開儲存庫；開發與貢獻以本根目錄的 `src/` 為準。

## 部署、隱私與貢獻

完整服務需要 Python ASGI 主機；FastAPI 同時提供 API 與 `dist/` 頁面。純靜態版本仍可部署至靜態主機，詳見 [部署指南](docs/DEPLOYMENT.md)。架構與方案格式見 [架構文件](docs/ARCHITECTURE.md)。

方案儲存在使用者瀏覽器。FastAPI 模式匯入 JSON 時，前端會把方案送到同源後端驗證，後端不持久儲存；一般編輯、儲存與連結分享均在瀏覽器完成。分享連結將方案放在 URL fragment 中；任何拿到完整連結的人都能讀取內容。請勿在方案名稱中填入個資。清除瀏覽器資料會移除已存方案，請以 JSON 備份。

歡迎回報問題、改善無障礙與資料品質、提出 PR。請先閱讀 [CONTRIBUTING.md](CONTRIBUTING.md)、[行為準則](CODE_OF_CONDUCT.md) 與 [安全政策](SECURITY.md)。

## 授權與致謝

自行開發的程式碼及文件採 [MIT License](LICENSE)。第三方圖資及其他第三方內容不在此授權範圍，見 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

互動概念參考 [Districtr](https://districtr.org/)，本專案未複製其原始碼、商標或圖像。歷史圖資來源為 [ronnywang/twgeojson](https://github.com/ronnywang/twgeojson)。

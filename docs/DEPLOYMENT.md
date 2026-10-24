# 部署

## Python FastAPI 完整部署（建議）

在支援 Python 3.10 以上的 VM 或 ASGI 主機執行：

```sh
python3 -m venv .venv
source .venv/bin/activate
python -m pip install .
npm ci
npm run data:prepare
npm run build
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

從儲存庫根目錄執行，保留 `backend/`、`data/villages-source.json`、`data/taipei-villages.json`、`data/taipei-districts.json` 與 `dist/`。對外服務應由主機提供 HTTPS；`--reload` 僅供開發使用。健康探針為 `/api/health`，圖資就緒探針為 `/api/ready`；前端是否建置可另以 `/` 檢查。

圖資可由 `DISTRICT_DATA_PATH` 指定絕對檔案路徑。API 不需要資料庫或機密環境變數。後端不持久儲存方案；未來若加入雲端儲存，需另設認證與存取控制。

既有 Sites 部署為 Cloudflare 靜態網站，不能直接執行此 Python ASGI 程序；本次變更更新 GitHub 原始碼，尚未把 FastAPI 部署到新的 Python 主機。原線上展示維持靜態版本。


## 一般靜態主機

```sh
npm ci
npm run data:prepare
npm run check
npm run build
npm test
```

把 `dist/` 的內容上傳到靜態主機即可；入口為 `index.html`。網站使用相對資源路徑，可放在網域根目錄或子路徑。建議啟用 HTTPS，讓複製分享連結可使用 Clipboard API。無需環境密鑰、帳號或資料庫。

目前官方里界已依政府資料開放授權條款第 1 版使用；公開散布時保留 THIRD_PARTY_NOTICES.md 中的出處與修改說明。CI 只執行驗證，不自動公開部署網站或發布含圖資的建置產物。

## GitHub Pages

可在本機建置後，以獨立的 gh-pages 分支發布 dist 內容，或自行設定 Pages 工作流程。請勿提交來源工作區的 `.env`、原始資料下載快取或主機帳號設定。本儲存庫不預設綁定任何部署供應商。

## 現有 Sites 網站

工作區原有的 `taipei-district-lab/` 具有獨立 Git 歷史與主機設定，保留作部署用，不會被公開儲存庫收錄。公開專案以根目錄 src 為唯一開發來源；若同步到既有網站，先完成根目錄建置與檢查，再把 dist 中的網站檔案同步到該部署 checkout。不要修改或覆寫它的 `.git` 與主機識別。

本次開源整理未自動更新既有線上網站，線上版本可能與公開來源的文件版本不同。

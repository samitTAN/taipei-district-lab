# 第三方來源與授權範圍

## 程式碼與文件

本儲存庫自行開發的程式碼與文件採根目錄 LICENSE 所載 MIT 授權。沒有使用前端套件、網路字型或外部圖片。Node.js 是前端開發工具。Python 後端使用 FastAPI、Uvicorn、Pydantic，以及測試用 pytest／HTTPX；由套件管理器安裝，各自依其套件所附授權使用，不適用本專案的 MIT 再授權。版本範圍見 pyproject.toml。

## 官方里界資料

- 提供者：臺北市政府民政局。
- 資料集：https://data.taipei/dataset/detail?id=6b17b31d-4e16-495e-95b1-9fd1f47c80d8
- 政府資料目錄與授權宣告：https://data.gov.tw/dataset/121163
- 授權：政府資料開放授權條款第 1 版（OGDL-Taiwan-1.0），https://data.gov.tw/license 。
- 原始資源與 SHA-256：data/villages-source.json。
- 衍生檔：data/taipei-villages.json（456 里）、data/taipei-districts.json（各里融合後 12 區）。
- 修改：解析 SHP UTF-8 屬性，EPSG:3826 轉換至 EPSG:4326，擷取官方里代碼及名稱，附加代表點與共邊鄰接；未簡化里界。

使用及再散布請保留提供者、來源及修改說明。這些圖資適用上述政府資料授權，並非本專案 MIT 授權。資料無法保證沒有錯誤，也不表示政府背書本工具。

0.1／0.2 版使用過的 ronnywang/twgeojson 歷史圖資現已取代，不再下載或隨新版發布。其舊來源紀錄保留於 data/source.json 供歷史查核，沒有追溯變更其授權。

重製圖資所用 pyshp、pyproj、Shapely 及其依賴由 Python 套件管理器安裝，各依原有授權使用；不再授權成專案 MIT。

## 參考與事實資料

Districtr（https://districtr.org/）為互動概念參考；未使用其原始碼、美術資產或商標。官方選委會文件與學術研究為選區範圍及席次的查核來源，連結與版本見 docs/DATA.md。網站外部連結內容仍屬各原作者。

## 2022 區域議員選舉結果與投開票所

提供者：中央選舉委員會／臺北市選舉委員會。開票結果來源與授權宣告 https://data.gov.tw/dataset/13119 ，依政府資料開放授權條款第 1 版使用。原始 votedata.zip 擷取臺北市 2022 區域議員資料，將里名對應官方地圖 ID，保留所號並核對各層級加總。

場所與地址取自 2022-08-29 公告的事實欄位：https://web.cec.gov.tw/mect/article/46783 。未複製公告電話，也未建立座標或服務範圍圖形。資料檔為 data/elections/2022-council.json；原始來源、雜湊、欄位修正及限制見 data/elections/2022-council-source.json 與 docs/ELECTIONS.md。保留此出處與加工說明，這些資料不適用程式碼 MIT 再授權。

重製時使用 pdfplumber，遵循其套件授權；執行網站與 API 不需要該套件。


2024立委選區與開票資料來源中選會；場所地址依臺北市選委會公告。出處、處理及雜湊見data/elections/2024-legislator-source.json與docs/ELECTIONS.md。資料依[政府資料開放授權條款第1版](https://data.gov.tw/license)使用，程式碼MIT不涵蓋第三方資料。

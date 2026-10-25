# 2022 台北市區域議員選舉資料

目前提供 2022-11-26 第 14 屆區域議員選舉：六個原選區、112 位候選人、456 里、1,755 個投開票所。平地、山地原住民議員為不同選票，不納入這份資料或與區域議員票混算。

## 官方來源與授權

- 中選會選舉資料庫：https://data.gov.tw/dataset/13119
- 原始結果：中選會開放資料 votedata.zip，2022 選舉 T1/prv 下的 elbase、elcand、elpaty、elctks、elprof 五個 CSV。
- 場所公告：https://web.cec.gov.tw/mect/article/46783 ，2022-08-29 公告，附件為 95 頁各投開票所表。
- 原始下載網址、ZIP／各 CSV／公告 PDF 的 SHA-256、檔案內路徑與字碼修正，見 data/elections/2022-council-source.json。
- 開票結果依政府資料開放授權條款第 1 版使用，保留中選會出處與處理說明；不改套程式碼 MIT 授權。場所及地址為上述公告事實欄位的擷取，未複製電話或整份公告內容。

核對日期：2026-10-24。來源為當時可下載的官方公開資料；場所名稱與地址依明確日期公告，不宣稱是現今或後續更正後的位置。

## 處理與核對

1. 驗證 ZIP 雜湊，再依固定 member 路徑及雜湊讀取官方 CSV。原始 ZIP 有 Big5 檔名，CSV 內容為 UTF-8。
2. 只取臺北市（63）的區域議員資料。候選人只保留號次、姓名、政黨、原選區當選註記，沒有帶入出生日期等其他欄位。
3. elbase 定義原選區、行政區及里名；以「區＋里」對應地圖 ID，不假定選舉資料庫里代碼與 GIS 的 CPTVID 相同。
4. elctks 提供候選人在里／所的得票，elprof 提供有效票、無效票、投票數與選舉人數。保留官方四位投開票所編號。
5. 用 pdfplumber 逐頁解析公告表格，取場所、地址、所轄里鄰別及原始頁碼，再按相同年份與投開票所編號合併。
6. 全部 456 里對應成功；1,755 個所號沒有重複或缺漏。逐候選人驗證所→里→原選區加總，逐統計欄位驗證所→里→全市；不以平均分配或人口比例估計得票。

全市區域議員統計：有效票 1,330,504、無效票 30,994、投票數 1,361,498、選舉人數 2,008,789，投票率 67.78%。59 個當選註記與基準區域席次一致。

### 明確字碼／空格對照

- 選舉檔「糖 U+E02D 里」與官方 GIS「糖蔀里」對應同一個既有地圖 ID；依萬華區公所名稱顯示為「糖廍里」，見 https://whdo.gov.taipei/News_Content.aspx?n=398B18EC2B34D6FC&s=1E6DF91952ACD47B 。只有這個已查核的對照，不做模糊猜測或變更幾何。
- 公告第 0957、1036 所備註行政區欄空白，其所屬行政區使用選舉資料庫相同所號的中山區；場所／地址文字未更改。
- PDF 儲存格換行與空白正規化，保留完整場所和地址字元；未地理編碼，也未把里代表點當成投票所位置。

## 使用口徑

得票率分母為該里／所有效票，投票率分母為選舉人數。候選人當選標記來自原選區結果，不表示在某個里／所得票最多就當選。

里級為官方資料庫的歸屬統計，不等於投票所座落地點。公告所轄里鄰文字與官方結果里的歸屬分開保存，沒有推定投開票所服務範圍多邊形。地圖採現有官方里界版本，沒有宣稱重建 2022 年每條邊界；里名逐一對應不等於歷史幾何完全相同。

重劃只改草案配置，查詢仍顯示 2022 原選區的候選人及歷史票數。不同原選區的候選人不能直接視為同一張選票競爭，更不能據此推算重劃後當選人。

## 重製

```sh
python -m pip install -e '.[election]'
python scripts/prepare_election.py --results-zip /path/to/votedata.zip --locations-pdf /path/to/2022-stations.pdf
```

程式從上述固定來源雜湊驗證並輸出 data/elections/2022-council.json。一般開發直接使用已提交的結果，不需下載 105 MB 原始資料庫或安裝 PDF 套件。

## API

- GET /api/elections：選舉清單及資料涵蓋數量。
- GET /api/elections/2022-taipei-council-regional：完整公開資料，亦供前端讀取。
- GET /api/elections/2022-taipei-council-regional/villages/{village_id}：單一里統計與候選人明細。
- GET /api/elections/2022-taipei-council-regional/stations/{station_id}：單一所結果，支援 1 或 0001。

找不到 ID 回傳 404，資料檔不可用回傳 503。所有結果為公共彙整資料，沒有個人投票紀錄。


## 2024 區域立委（0.6.0）

新增2024-01-13第11屆臺北市區域立委：8區、53位候選人、456里、1,764所。不含政黨票及原住民立委票。

結果採中選會votedata.zip之2024總統立委/區域立委五份CSV；場所地址依[2023-11-20公告ODS](https://web.cec.gov.tw/mect/article/46833)，保留工作表及實際列號。來源網址、雜湊與授權見data/elections/2024-legislator-source.json。

[第11屆選區範圍](https://data.gov.tw/dataset/170247)逐里展開後與開票資料交叉核對：456里均唯一歸屬；士林、松山、中正區跨選區。2024糖廍里對應GIS糖蔀里，不更動幾何。使用現有官方里界，未重建2024歷史幾何。

逐所→逐里→原選區候選人加總與全市統計均經對帳。當選標記及票數保留原選區口徑，不推算重劃後當選人。資料依政府資料開放授權條款第1版，非程式碼MIT。

重製只需Python標準函式庫：

```sh
python scripts/prepare_legislator.py --results-zip /path/to/votedata.zip --locations-ods /path/to/2024-stations.ods --ranges-csv /path/to/legislator-ranges.csv
```

輸出2024-legislator.json及legislator-config.json。API為/api/elections/2024-taipei-legislator-regional及其/villages/{village_id}、/stations/{station_id}。/api/elections列出兩種選舉。

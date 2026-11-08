Trimmed slices of TradeSkillMaster's public WoW Forever region files
(`https://public-data.tradeskillmaster.com/forever/{region}/region/items.csv`),
downloaded 2026-11-06. `forever_us_items.csv` keeps six real US rows;
`forever_kr_items.csv` is the whole KR file as it was that day — header only, the
shape of a file with no prices. (The app keeps US prices only; the KR file is
just a parser fixture.) Used by `tests/test_wow_prices*.py`.

-- Every custom avatar item names the currency its `Price` is in, as `PurchaseCurrencyType` in its
-- JSON: 2 `RecCenterTokens` for everything the token store sells, or a game's own currency for a
-- TICKET REWARD (1 `LaserTagTickets`, 100 `LostSkullsGold`, 101 `DraculaSilver`), which the
-- first-party load (`just cai-load`) derives from the storefront dumps. The token store's
-- listings — the search and the featured and hot feeds — show only `PurchaseCurrencyType` 2
-- (`TOKEN_PURCHASABLE` in src/custom-avatar-items-db.ts).
--
-- New rows get the field when they are written (a player's create, the studio create, the
-- load); this backfills it onto the rows from before, as 2: until now every item was priced in
-- tokens. Without it they would drop out of the search. Re-running is harmless: a row that
-- already names a currency is left alone. No DDL — the field is read off the JSON.

UPDATE custom_avatar_item
SET data = json_set(data, '$.PurchaseCurrencyType', 2)
WHERE json_extract(data, '$.PurchaseCurrencyType') IS NULL;

-- Generated columns + an index for the slideshow feed (`api`: /api/images/v1/slideshow),
-- which ranks recent public photos (the last SLIDESHOW_DAYS days) by cheers. Without
-- them the query has to json_extract every row of the table on every request; with them
-- it reads only the window's rows. VIRTUAL columns can be added by ALTER TABLE (STORED ones cannot).
-- Generated from src/images-db.ts (SCHEMA_DDL) — keep in sync.

ALTER TABLE image ADD COLUMN type INTEGER GENERATED ALWAYS AS (json_extract(data, '$.Type')) VIRTUAL;
ALTER TABLE image ADD COLUMN accessibility INTEGER GENERATED ALWAYS AS (json_extract(data, '$.Accessibility')) VIRTUAL;
ALTER TABLE image ADD COLUMN created_at TEXT GENERATED ALWAYS AS (json_extract(data, '$.CreatedAt')) VIRTUAL;
CREATE INDEX IF NOT EXISTS idx_image_slideshow ON image (type, accessibility, created_at);

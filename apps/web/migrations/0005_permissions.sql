ALTER TABLE contributions ADD COLUMN image_approved INTEGER NOT NULL DEFAULT 0;
UPDATE contributions SET image_approved=1 WHERE id='fixture_blue' AND state='accepted' AND original_sketch=1 AND display=1;

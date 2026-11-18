-- Search is a private projection. Only this D1 view grants indexing eligibility.
CREATE VIEW search_public_posts AS
SELECT p.*, d.revision, a.object_prefix, a.digest, a.expires, b.title
FROM posts p JOIN drafts d ON d.id=p.id JOIN assets a ON a.id=p.asset JOIN books b ON b.id=p.book
WHERE p.removed IS NULL AND p.approved>0 AND d.state='published'
 AND d.asset=p.asset AND d.book=p.book AND d.owner=p.owner
 AND d.metadata=p.metadata AND d.boundary IS p.boundary
 AND a.purpose='artwork' AND a.book=p.book AND a.owner=p.owner
 AND a.object_prefix IS NOT NULL AND a.expires>unixepoch()*1000;

CREATE TABLE search_outbox (
 post TEXT PRIMARY KEY, version INTEGER NOT NULL DEFAULT 1,
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','done','exhausted')),
 attempt INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL DEFAULT 0,
 lease TEXT, lease_until INTEGER NOT NULL DEFAULT 0, last_error TEXT
);
CREATE INDEX search_outbox_due ON search_outbox(state,next_at,lease_until);
-- Persist intent before upload, including uploads whose response is lost.
-- Tombstones remain reconcilable if an asynchronous upload completes after removal.
CREATE TABLE search_items (
 key TEXT PRIMARY KEY, post TEXT NOT NULL, source_hash TEXT NOT NULL,
 provider_id TEXT, ready INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL,
 deleted_at INTEGER, checked_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX search_items_post ON search_items(post);
CREATE TABLE search_budgets (
 bucket TEXT PRIMARY KEY, used INTEGER NOT NULL CHECK(used>=0)
);

CREATE TRIGGER search_post_insert AFTER INSERT ON posts BEGIN
 INSERT INTO search_outbox(post) VALUES(new.id) ON CONFLICT(post) DO UPDATE SET version=version+1,state='pending',attempt=0,next_at=0;
END;
CREATE TRIGGER search_post_update AFTER UPDATE ON posts BEGIN
 INSERT INTO search_outbox(post) VALUES(new.id) ON CONFLICT(post) DO UPDATE SET version=version+1,state='pending',attempt=0,next_at=0;
END;
CREATE TRIGGER search_post_delete AFTER DELETE ON posts BEGIN
 INSERT INTO search_outbox(post) VALUES(old.id) ON CONFLICT(post) DO UPDATE SET version=version+1,state='pending',attempt=0,next_at=0;
END;
CREATE TRIGGER search_draft_update AFTER UPDATE ON drafts WHEN EXISTS(SELECT 1 FROM posts WHERE id=new.id) BEGIN
 INSERT INTO search_outbox(post) VALUES(new.id) ON CONFLICT(post) DO UPDATE SET version=version+1,state='pending',attempt=0,next_at=0;
END;
CREATE TRIGGER search_asset_update AFTER UPDATE ON assets BEGIN
 INSERT INTO search_outbox(post) SELECT id FROM posts WHERE asset=new.id
 ON CONFLICT(post) DO UPDATE SET version=version+1,state='pending',attempt=0,next_at=0;
END;
INSERT INTO search_outbox(post) SELECT id FROM posts;

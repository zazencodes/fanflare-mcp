-- Immutable approval of the exact payload; the reviewer is a signed-in moderator.
CREATE TABLE seed_approvals (
  kind TEXT NOT NULL CHECK(kind IN ('catalog','artwork')),
  seed_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK(revision > 0),
  payload_hash TEXT NOT NULL,
  reviewer TEXT NOT NULL REFERENCES user(id),
  approved_at INTEGER NOT NULL,
  PRIMARY KEY(kind, seed_id, revision)
);
CREATE TABLE seed_posts (
  seed_id TEXT PRIMARY KEY,
  input_hash TEXT NOT NULL,
  owner TEXT NOT NULL REFERENCES user(id),
  draft_id TEXT NOT NULL UNIQUE REFERENCES drafts(id),
  asset_id TEXT NOT NULL UNIQUE REFERENCES assets(id),
  content_revision INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  removed_at INTEGER
);

-- A reserved non-login service identity, distinct from any reader or fixture.
CREATE TABLE seed_studio (
  singleton INTEGER PRIMARY KEY CHECK(singleton=1),
  user_id TEXT NOT NULL UNIQUE REFERENCES user(id),
  provisioned_by TEXT NOT NULL REFERENCES moderators(user_id),
  provisioned_at INTEGER NOT NULL
);
CREATE TABLE seed_catalog (
  seed_id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(id)
);

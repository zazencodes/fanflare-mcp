CREATE TABLE book_covers (
 version INTEGER PRIMARY KEY AUTOINCREMENT,
 book TEXT NOT NULL REFERENCES books(id),
 status TEXT NOT NULL CHECK(status IN ('found','missing')),
 fingerprint TEXT NOT NULL,
 provenance TEXT NOT NULL CHECK(json_valid(provenance)),
 original_sha256 TEXT,
 width INTEGER, height INTEGER,
 key_320 TEXT, key_640 TEXT,
 imported INTEGER NOT NULL,
 removed INTEGER, removed_by TEXT REFERENCES user(id)
);
CREATE INDEX book_covers_checksum ON book_covers(book,fingerprint);
CREATE INDEX book_covers_current ON book_covers(book,version DESC);
CREATE TABLE book_details (
 book TEXT PRIMARY KEY REFERENCES books(id),
 genres TEXT NOT NULL CHECK(json_valid(genres)),
 classification TEXT CHECK(classification IN ('fiction','nonfiction')),
 first_publication_year INTEGER,
 provenance TEXT NOT NULL CHECK(json_valid(provenance))
);
CREATE TABLE catalog_lists (
 slug TEXT PRIMARY KEY, title TEXT NOT NULL,
 window_start TEXT NOT NULL, window_end TEXT NOT NULL, method TEXT NOT NULL
);
CREATE TABLE catalog_list_members (
 list TEXT NOT NULL REFERENCES catalog_lists(slug),
 book TEXT NOT NULL REFERENCES books(id),
 evidence_order INTEGER,
 provenance TEXT NOT NULL CHECK(json_valid(provenance)),
 PRIMARY KEY(list,book)
);

CREATE TABLE cleanup_cursor(id INTEGER PRIMARY KEY CHECK(id=1),cursor TEXT);
ALTER TABLE index_requests ADD COLUMN coverage TEXT;
CREATE TABLE work_identities(book TEXT NOT NULL REFERENCES books,provider TEXT NOT NULL,external_id TEXT NOT NULL,PRIMARY KEY(provider,external_id));

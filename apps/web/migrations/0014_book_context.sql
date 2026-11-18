-- Packet ownership stays separate from reader/research rows and existing insert shapes.
CREATE TABLE context_approvals(book TEXT NOT NULL REFERENCES books,revision INTEGER NOT NULL,packet_hash TEXT NOT NULL,approved_by TEXT NOT NULL,approved_at TEXT NOT NULL,review TEXT NOT NULL,packet TEXT NOT NULL,PRIMARY KEY(book,revision));
CREATE TABLE context_imports(book TEXT PRIMARY KEY REFERENCES books,revision INTEGER NOT NULL,packet_hash TEXT NOT NULL,imported_at INTEGER NOT NULL,rolled_back INTEGER NOT NULL DEFAULT 0);
CREATE TABLE context_subjects(subject TEXT PRIMARY KEY REFERENCES characters,kind TEXT NOT NULL CHECK(kind IN ('character','place')),role TEXT NOT NULL,book TEXT NOT NULL REFERENCES books,created INTEGER NOT NULL CHECK(created IN (0,1)));
CREATE TABLE context_facts(fact TEXT PRIMARY KEY REFERENCES facts,book TEXT NOT NULL REFERENCES books,revision INTEGER NOT NULL);
CREATE TABLE context_sources(source TEXT PRIMARY KEY REFERENCES sources,book TEXT NOT NULL REFERENCES books,metadata TEXT NOT NULL);
CREATE TABLE context_aliases(subject TEXT NOT NULL REFERENCES characters,name TEXT NOT NULL,book TEXT NOT NULL REFERENCES books,PRIMARY KEY(subject,name));
CREATE TABLE context_chapters(book TEXT NOT NULL REFERENCES books,ord INTEGER NOT NULL,PRIMARY KEY(book,ord));
-- An aborting CHECK provides a compare-and-swap guard inside the atomic D1 batch.
CREATE TABLE context_write_guards(valid INTEGER NOT NULL CHECK(valid=1));

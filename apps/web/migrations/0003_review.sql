CREATE TABLE transaction_guards(id TEXT PRIMARY KEY,valid INTEGER NOT NULL CONSTRAINT current_state CHECK(valid=1));
ALTER TABLE contributions ADD COLUMN original_sketch INTEGER NOT NULL DEFAULT 0;
CREATE INDEX moderation_candidates ON candidates(state);
CREATE INDEX moderation_contributions ON contributions(state);
CREATE TABLE passage_cues(book TEXT,phrase TEXT,chapter INTEGER,anchor TEXT,PRIMARY KEY(book,phrase),FOREIGN KEY(book,chapter,anchor) REFERENCES anchors(book,chapter,slug));

CREATE TABLE revocations(owner TEXT REFERENCES user,client TEXT,at INTEGER NOT NULL,PRIMARY KEY(owner,client));

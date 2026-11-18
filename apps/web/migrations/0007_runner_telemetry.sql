CREATE TABLE runner_heartbeat (
 id INTEGER PRIMARY KEY CHECK(id=1),
 last_seen INTEGER NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('starting','idle','researching','blocked','error')),
 job TEXT REFERENCES jobs(id),
 session TEXT,
 model TEXT NOT NULL,
 last_error TEXT,
 started INTEGER NOT NULL
);
CREATE TABLE runner_events (
 id TEXT PRIMARY KEY,
 created INTEGER NOT NULL,
 kind TEXT NOT NULL,
 job TEXT REFERENCES jobs(id),
 message TEXT NOT NULL
);
CREATE INDEX runner_events_created ON runner_events(created);

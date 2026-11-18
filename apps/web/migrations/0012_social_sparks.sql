CREATE TABLE profiles (
 user_id TEXT PRIMARY KEY REFERENCES user(id), handle TEXT UNIQUE,
 display_name TEXT, avatar TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(avatar)),
 studio INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL,
 CHECK(handle IS NULL OR (length(handle) BETWEEN 3 AND 24 AND handle NOT GLOB '*[^a-z0-9_-]*'))
);
INSERT INTO profiles(user_id,handle,display_name,studio,created)
 SELECT user_id,'fanflare-studio','Fanflare Studio',1,provisioned_at FROM seed_studio;
CREATE TRIGGER studio_profile AFTER INSERT ON seed_studio BEGIN
 INSERT INTO profiles(user_id,handle,display_name,studio,created)
 VALUES(new.user_id,'fanflare-studio','Fanflare Studio',1,new.provisioned_at);
 INSERT INTO search_people(id,handle,display_name) VALUES(new.user_id,'fanflare-studio','Fanflare Studio');
END;
CREATE TABLE comments(id TEXT PRIMARY KEY, post TEXT NOT NULL REFERENCES posts(id), user_id TEXT NOT NULL REFERENCES user(id), body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 1000), created INTEGER NOT NULL, removed INTEGER);
CREATE INDEX comment_thread ON comments(post,created,id) WHERE removed IS NULL;
CREATE TABLE shelf(user_id TEXT NOT NULL REFERENCES user(id),book TEXT NOT NULL REFERENCES books(id),state TEXT NOT NULL CHECK(state IN ('want','reading','read')),created INTEGER NOT NULL,visited INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(user_id,book));
CREATE TABLE sparks_ledger (
 id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES user(id),action TEXT NOT NULL,subject TEXT NOT NULL,
 reference TEXT NOT NULL,amount INTEGER NOT NULL,created INTEGER NOT NULL,post TEXT REFERENCES posts(id),
 reversal_of TEXT UNIQUE REFERENCES sparks_ledger(id),spend INTEGER NOT NULL DEFAULT 0,
 UNIQUE(user_id,action,subject)
);
CREATE INDEX sparks_reader ON sparks_ledger(user_id,created);
CREATE INDEX sparks_post ON sparks_ledger(post);
CREATE TRIGGER sparks_immutable_update BEFORE UPDATE ON sparks_ledger BEGIN SELECT RAISE(ABORT,'Sparks ledger is append-only'); END;
CREATE TRIGGER sparks_immutable_delete BEFORE DELETE ON sparks_ledger BEGIN SELECT RAISE(ABORT,'Sparks ledger is append-only'); END;
CREATE TABLE badges(user_id TEXT NOT NULL REFERENCES user(id),badge TEXT NOT NULL,created INTEGER NOT NULL,PRIMARY KEY(user_id,badge));
CREATE TABLE notifications(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES user(id),kind TEXT NOT NULL,subject TEXT NOT NULL,post TEXT REFERENCES posts(id),created INTEGER NOT NULL,read_at INTEGER,UNIQUE(user_id,kind,subject));
CREATE INDEX notification_unread ON notifications(user_id,read_at);
CREATE TABLE store_ownership(user_id TEXT NOT NULL REFERENCES user(id),item TEXT NOT NULL,created INTEGER NOT NULL,purchase_id TEXT NOT NULL UNIQUE,PRIMARY KEY(user_id,item));
CREATE TABLE social_rate(user_id TEXT NOT NULL REFERENCES user(id),kind TEXT NOT NULL,bucket INTEGER NOT NULL,count INTEGER NOT NULL,PRIMARY KEY(user_id,kind,bucket));

CREATE TABLE social_effects(id TEXT PRIMARY KEY);
CREATE TRIGGER social_rate_limit BEFORE UPDATE ON social_rate WHEN new.count>CASE new.kind WHEN 'comment' THEN 10 ELSE 60 END BEGIN SELECT RAISE(ABORT,'Social action rate limit exceeded'); END;
-- Public launch date is unset: every existing and newly joining reader qualifies.
INSERT OR IGNORE INTO badges SELECT id,'Early Reader',CAST(strftime('%s','now') AS INTEGER)*1000 FROM user WHERE NOT EXISTS(SELECT 1 FROM seed_studio WHERE user_id=user.id);
CREATE TRIGGER early_reader AFTER INSERT ON user BEGIN
 INSERT INTO badges VALUES(new.id,'Early Reader',CAST(strftime('%s','now') AS INTEGER)*1000);
END;
CREATE TRIGGER studio_excluded_badges AFTER INSERT ON seed_studio BEGIN
 DELETE FROM badges WHERE user_id=new.user_id;
 DELETE FROM notifications WHERE user_id=new.user_id;
END;
-- Each receipt retains its exact result, even when other requests commit before it is read.
CREATE TABLE social_results(event TEXT PRIMARY KEY,before_lifetime INTEGER NOT NULL,balance INTEGER,lifetime INTEGER,before_badges TEXT NOT NULL,badges TEXT);
INSERT OR IGNORE INTO notifications(id,user_id,kind,subject,created)
 SELECT 'early-reader:'||user_id,user_id,'badge','Early Reader',created FROM badges WHERE badge='Early Reader';
CREATE TRIGGER early_reader_notice AFTER INSERT ON user BEGIN
 INSERT INTO notifications(id,user_id,kind,subject,created) VALUES('early-reader:'||new.id,new.id,'badge','Early Reader',CAST(strftime('%s','now') AS INTEGER)*1000);
END;

INSERT INTO search_people(id,handle,display_name) SELECT user_id,handle,display_name FROM profiles WHERE handle IS NOT NULL;

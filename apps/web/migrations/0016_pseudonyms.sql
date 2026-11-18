-- Every account has a generated pseudonym and a handle derived from it.
-- Readers choose which name is shown (pseudonym or their own name), may make
-- their profile private, and change their handle at most three times in any
-- rolling 30 days. See docs/adr/2026-11-13-every-reader-has-a-pseudonym.md.
ALTER TABLE profiles ADD COLUMN pseudonym TEXT;
ALTER TABLE profiles ADD COLUMN real_name TEXT;
ALTER TABLE profiles ADD COLUMN shown TEXT NOT NULL DEFAULT 'pseudonym' CHECK(shown IN ('pseudonym','real'));
ALTER TABLE profiles ADD COLUMN private INTEGER NOT NULL DEFAULT 0 CHECK(private IN (0,1));
-- Set when the reader leaves the first-run welcome page.
ALTER TABLE profiles ADD COLUMN welcomed INTEGER;

-- Curated, literary two-word pseudonyms: 64 x 64 combinations.
CREATE TABLE pseudonym_words(slot TEXT NOT NULL CHECK(slot IN ('first','second')), idx INTEGER NOT NULL CHECK(idx BETWEEN 0 AND 63), word TEXT NOT NULL CHECK(length(word) BETWEEN 2 AND 8), PRIMARY KEY(slot,idx));
INSERT INTO pseudonym_words(slot,idx,word) VALUES
 ('first',0,'Velvet'),
 ('first',1,'Amber'),
 ('first',2,'Silver'),
 ('first',3,'Quiet'),
 ('first',4,'Gentle'),
 ('first',5,'Golden'),
 ('first',6,'Misty'),
 ('first',7,'Wistful'),
 ('first',8,'Ivory'),
 ('first',9,'Copper'),
 ('first',10,'Hidden'),
 ('first',11,'Lunar'),
 ('first',12,'Autumn'),
 ('first',13,'Wintry'),
 ('first',14,'Midnight'),
 ('first',15,'Dusky'),
 ('first',16,'Starlit'),
 ('first',17,'Mossy'),
 ('first',18,'Russet'),
 ('first',19,'Hazel'),
 ('first',20,'Saffron'),
 ('first',21,'Cobalt'),
 ('first',22,'Indigo'),
 ('first',23,'Crimson'),
 ('first',24,'Scarlet'),
 ('first',25,'Pale'),
 ('first',26,'Bright'),
 ('first',27,'Drowsy'),
 ('first',28,'Dreamy'),
 ('first',29,'Roving'),
 ('first',30,'Curious'),
 ('first',31,'Patient'),
 ('first',32,'Clever'),
 ('first',33,'Brave'),
 ('first',34,'Merry'),
 ('first',35,'Solemn'),
 ('first',36,'Tender'),
 ('first',37,'Distant'),
 ('first',38,'Northern'),
 ('first',39,'Southern'),
 ('first',40,'Ancient'),
 ('first',41,'Secret'),
 ('first',42,'Silent'),
 ('first',43,'Restless'),
 ('first',44,'Lucky'),
 ('first',45,'Kindly'),
 ('first',46,'Twilight'),
 ('first',47,'Dappled'),
 ('first',48,'Gilded'),
 ('first',49,'Woven'),
 ('first',50,'Painted'),
 ('first',51,'Inky'),
 ('first',52,'Lyric'),
 ('first',53,'Mellow'),
 ('first',54,'Rosy'),
 ('first',55,'Frosted'),
 ('first',56,'Sunlit'),
 ('first',57,'Stormy'),
 ('first',58,'Hushed'),
 ('first',59,'Fabled'),
 ('first',60,'Opal'),
 ('first',61,'Briar'),
 ('first',62,'Linen'),
 ('first',63,'Hollow'),
 ('second',0,'Heron'),
 ('second',1,'Fox'),
 ('second',2,'Owl'),
 ('second',3,'Wren'),
 ('second',4,'Lark'),
 ('second',5,'Raven'),
 ('second',6,'Sparrow'),
 ('second',7,'Finch'),
 ('second',8,'Otter'),
 ('second',9,'Badger'),
 ('second',10,'Hare'),
 ('second',11,'Stag'),
 ('second',12,'Moth'),
 ('second',13,'Swan'),
 ('second',14,'Kestrel'),
 ('second',15,'Falcon'),
 ('second',16,'Robin'),
 ('second',17,'Magpie'),
 ('second',18,'Starling'),
 ('second',19,'Bramble'),
 ('second',20,'Willow'),
 ('second',21,'Fern'),
 ('second',22,'Thistle'),
 ('second',23,'Juniper'),
 ('second',24,'Lantern'),
 ('second',25,'Quill'),
 ('second',26,'Inkwell'),
 ('second',27,'Compass'),
 ('second',28,'Atlas'),
 ('second',29,'Harbor'),
 ('second',30,'Meadow'),
 ('second',31,'Orchard'),
 ('second',32,'Comet'),
 ('second',33,'Beacon'),
 ('second',34,'Pilgrim'),
 ('second',35,'Scribe'),
 ('second',36,'Bard'),
 ('second',37,'Poet'),
 ('second',38,'Wanderer'),
 ('second',39,'Voyager'),
 ('second',40,'Dreamer'),
 ('second',41,'Reader'),
 ('second',42,'Mapmaker'),
 ('second',43,'Archer'),
 ('second',44,'Keeper'),
 ('second',45,'Tinker'),
 ('second',46,'Sailor'),
 ('second',47,'Gardener'),
 ('second',48,'Minstrel'),
 ('second',49,'Oracle'),
 ('second',50,'Sage'),
 ('second',51,'Fable'),
 ('second',52,'Sonnet'),
 ('second',53,'Ballad'),
 ('second',54,'Riddle'),
 ('second',55,'Marigold'),
 ('second',56,'Sorrel'),
 ('second',57,'Clover'),
 ('second',58,'Acorn'),
 ('second',59,'Pebble'),
 ('second',60,'Tide'),
 ('second',61,'Harp'),
 ('second',62,'Kite'),
 ('second',63,'Lynx');

-- Every handle a reader moves away from stays retired for everyone else.
-- Reader changes (moderator IS NULL) count toward the rolling limit.
CREATE TABLE handle_changes(id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES user(id), old_handle TEXT NOT NULL, new_handle TEXT NOT NULL, changed INTEGER NOT NULL, moderator TEXT REFERENCES user(id));
CREATE INDEX handle_changes_user ON handle_changes(user_id,changed);
CREATE INDEX handle_changes_old ON handle_changes(old_handle);
-- D1 enforces both rules; a refused change aborts its whole batch.
CREATE TRIGGER handle_change_limit BEFORE INSERT ON handle_changes
 WHEN new.moderator IS NULL AND (SELECT count(*) FROM handle_changes WHERE user_id=new.user_id AND moderator IS NULL AND changed>new.changed-2592000000)>=3
 BEGIN SELECT RAISE(ABORT,'Handle change limit reached'); END;
CREATE TRIGGER handle_change_retired BEFORE INSERT ON handle_changes
 WHEN EXISTS(SELECT 1 FROM handle_changes WHERE old_handle=new.new_handle AND user_id<>new.user_id)
 BEGIN SELECT RAISE(ABORT,'Handle is already taken'); END;
-- A logged change is the only way a handle moves.
CREATE TRIGGER handle_change_apply AFTER INSERT ON handle_changes BEGIN
 UPDATE profiles SET handle=new.new_handle WHERE user_id=new.user_id AND handle=new.old_handle;
END;

-- The account's rowid, scrambled by a bijection on 0..4095, picks the word pair,
-- so the first 4,096 accounts get distinct pairs without randomness.
CREATE VIEW generated_pseudonyms AS
 SELECT u.id user_id, u.rowid n, f.word || ' ' || s.word pseudonym, lower(f.word || '-' || s.word) base
 FROM user u
 JOIN pseudonym_words f ON f.slot='first' AND f.idx=((u.rowid*2477+1013)%4096)%64
 JOIN pseudonym_words s ON s.slot='second' AND s.idx=((u.rowid*2477+1013)%4096)/64;
-- Suffix steps for generated handles, walked in order.
CREATE TABLE handle_suffixes(k INTEGER PRIMARY KEY);
WITH RECURSIVE steps(k) AS (SELECT 0 UNION ALL SELECT k+1 FROM steps WHERE k<4095)
INSERT INTO handle_suffixes SELECT k FROM steps;
-- The first free candidate: the pseudonym's handle (for the first 4,096 accounts),
-- then base-<rowid>, base-<rowid+1> and so on. A candidate is free when no other
-- account holds or retired it, so account creation never collides.
CREATE VIEW default_handles AS
 SELECT g.user_id, (
  SELECT c.candidate FROM (
   SELECT x.k, CASE WHEN x.k=0 AND g.n<4096 THEN g.base
    ELSE g.base || '-' || (g.n + x.k - (g.n<4096)) END candidate
   FROM handle_suffixes x) c
  WHERE length(c.candidate)<=24
   AND NOT EXISTS(SELECT 1 FROM profiles o WHERE o.handle=c.candidate AND o.user_id<>g.user_id)
   AND NOT EXISTS(SELECT 1 FROM handle_changes h WHERE h.old_handle=c.candidate AND h.user_id<>g.user_id)
  ORDER BY c.k LIMIT 1) handle
 FROM generated_pseudonyms g;

CREATE TRIGGER user_profile AFTER INSERT ON user BEGIN
 INSERT INTO profiles(user_id,pseudonym,display_name,created)
  SELECT user_id,pseudonym,pseudonym,CAST(strftime('%s','now') AS INTEGER)*1000 FROM generated_pseudonyms WHERE user_id=new.id;
 UPDATE profiles SET handle=(SELECT handle FROM default_handles WHERE user_id=new.id) WHERE user_id=new.id;
END;

-- The studio keeps its official name and handle.
DROP TRIGGER studio_profile;
CREATE TRIGGER studio_profile AFTER INSERT ON seed_studio BEGIN
 UPDATE profiles SET handle='fanflare-studio',pseudonym='Fanflare Studio',display_name='Fanflare Studio',shown='pseudonym',real_name=NULL,studio=1,welcomed=new.provisioned_at WHERE user_id=new.user_id;
END;

-- People search lists exactly the public profiles.
CREATE TRIGGER profiles_people_insert AFTER INSERT ON profiles BEGIN
 DELETE FROM search_people WHERE id=new.user_id;
 INSERT INTO search_people(id,handle,display_name) SELECT new.user_id,new.handle,new.display_name WHERE new.handle IS NOT NULL AND new.display_name IS NOT NULL AND new.private=0;
END;
CREATE TRIGGER profiles_people_update AFTER UPDATE OF handle,display_name,private ON profiles BEGIN
 DELETE FROM search_people WHERE id=new.user_id;
 INSERT INTO search_people(id,handle,display_name) SELECT new.user_id,new.handle,new.display_name WHERE new.handle IS NOT NULL AND new.display_name IS NOT NULL AND new.private=0;
END;

-- Backfill (idempotent: every statement below changes nothing on a second run).
-- Readers who chose a display name keep showing it, now as their own name.
UPDATE profiles SET real_name=display_name, shown='real'
 WHERE pseudonym IS NULL AND studio=0 AND handle IS NOT NULL AND display_name IS NOT NULL AND display_name<>handle;
UPDATE profiles SET pseudonym=(SELECT pseudonym FROM generated_pseudonyms g WHERE g.user_id=profiles.user_id), welcomed=COALESCE(welcomed,created)
 WHERE pseudonym IS NULL AND studio=0;
UPDATE profiles SET pseudonym=display_name, welcomed=COALESCE(welcomed,created) WHERE pseudonym IS NULL AND studio=1;
INSERT INTO profiles(user_id,pseudonym,display_name,created)
 SELECT g.user_id,g.pseudonym,g.pseudonym,CAST(strftime('%s','now') AS INTEGER)*1000 FROM generated_pseudonyms g
 WHERE NOT EXISTS(SELECT 1 FROM profiles p WHERE p.user_id=g.user_id);
UPDATE profiles SET handle=(SELECT handle FROM default_handles d WHERE d.user_id=profiles.user_id) WHERE handle IS NULL;
UPDATE profiles SET display_name=CASE shown WHEN 'real' THEN real_name ELSE pseudonym END
 WHERE studio=0 AND display_name IS NOT CASE shown WHEN 'real' THEN real_name ELSE pseudonym END;
INSERT INTO search_people(id,handle,display_name)
 SELECT user_id,handle,display_name FROM profiles p WHERE handle IS NOT NULL AND display_name IS NOT NULL AND private=0
 AND NOT EXISTS(SELECT 1 FROM search_people s WHERE s.id=p.user_id);

-- Reader choices are independently nullable: missing spoiler choice differs from explicit shown.
CREATE TABLE reader_preferences(user_id TEXT PRIMARY KEY REFERENCES user, spoilers_hidden INTEGER CHECK(spoilers_hidden IN (0,1)), positions TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(positions)));
ALTER TABLE assets ADD COLUMN width INTEGER CHECK(width>0);
ALTER TABLE assets ADD COLUMN height INTEGER CHECK(height>0);
CREATE TABLE upvotes(post TEXT NOT NULL REFERENCES posts, user_id TEXT NOT NULL REFERENCES user, created INTEGER NOT NULL, PRIMARY KEY(post,user_id));
CREATE INDEX upvotes_user_created ON upvotes(user_id,created);
CREATE INDEX upvotes_created ON upvotes(created);
CREATE TABLE favorites(user_id TEXT NOT NULL REFERENCES user, post TEXT NOT NULL REFERENCES posts, created INTEGER NOT NULL, PRIMARY KEY(user_id,post));
CREATE INDEX favorites_post ON favorites(post);
-- Only explicitly public profile identity. W2 maintains this projection through the shared API.
CREATE TABLE search_people(id TEXT PRIMARY KEY REFERENCES user, handle TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL);
CREATE TABLE site_documents(kind TEXT NOT NULL, id TEXT NOT NULL, book TEXT, title TEXT NOT NULL, names TEXT NOT NULL, description TEXT NOT NULL, PRIMARY KEY(kind,id));
CREATE VIRTUAL TABLE site_fts USING fts5(kind UNINDEXED,id UNINDEXED,book UNINDEXED,title,names,description,tokenize='unicode61 remove_diacritics 2',prefix='2 3 4');
CREATE VIRTUAL TABLE site_trigram USING fts5(kind UNINDEXED,id UNINDEXED,book UNINDEXED,title,names,description,tokenize='trigram');
CREATE TRIGGER site_documents_insert AFTER INSERT ON site_documents BEGIN
 INSERT INTO site_fts VALUES(new.kind,new.id,new.book,new.title,new.names,new.description);
 INSERT INTO site_trigram VALUES(new.kind,new.id,new.book,new.title,new.names,new.description);
END;
CREATE TRIGGER site_documents_delete AFTER DELETE ON site_documents BEGIN
 DELETE FROM site_fts WHERE kind=old.kind AND id=old.id;
 DELETE FROM site_trigram WHERE kind=old.kind AND id=old.id;
END;
CREATE TRIGGER site_documents_update AFTER UPDATE ON site_documents BEGIN
 DELETE FROM site_fts WHERE kind=old.kind AND id=old.id;
 DELETE FROM site_trigram WHERE kind=old.kind AND id=old.id;
 INSERT INTO site_fts VALUES(new.kind,new.id,new.book,new.title,new.names,new.description);
 INSERT INTO site_trigram VALUES(new.kind,new.id,new.book,new.title,new.names,new.description);
END;
CREATE VIEW site_source_documents AS
 SELECT 'book' kind,id,id book,title,authors names,'' description FROM books
 UNION ALL SELECT 'character',c.id,c.book,c.name,COALESCE((SELECT group_concat(name,' ') FROM aliases WHERE character=c.id),''),b.title FROM characters c JOIN books b ON b.id=c.book
 UNION ALL SELECT 'artwork',p.id,p.book,json_extract(p.metadata,'$.alt'),COALESCE((SELECT group_concat(c.name,' ') FROM json_each(p.metadata,'$.character_ids') j JOIN characters c ON c.id=j.value),''),
 COALESCE(json_extract(p.metadata,'$.style'),'') || ' ' || COALESCE(json_extract(p.metadata,'$.mood'),'') || ' ' || COALESCE(json_extract(p.metadata,'$.credit'),'') || ' ' || COALESCE(json_extract(p.metadata,'$.description'),'') || ' ' || COALESCE(json_extract(p.metadata,'$.tags'),'')
 FROM posts p WHERE removed IS NULL
 UNION ALL SELECT 'person',id,NULL,handle,display_name,'' FROM search_people;
CREATE TRIGGER community_books_insert AFTER INSERT ON books BEGIN
 DELETE FROM site_documents WHERE kind='book' AND id=new.id OR book=new.id AND kind='character';
 INSERT INTO site_documents SELECT * FROM site_source_documents WHERE kind='book' AND id=new.id OR book=new.id AND kind='character';
END;
CREATE TRIGGER community_books_update AFTER UPDATE ON books BEGIN
 DELETE FROM site_documents WHERE kind='book' AND id=new.id OR book=new.id AND kind='character';
 INSERT INTO site_documents SELECT * FROM site_source_documents WHERE kind='book' AND id=new.id OR book=new.id AND kind='character';
END;
CREATE TRIGGER community_books_delete AFTER DELETE ON books BEGIN
 DELETE FROM site_documents WHERE kind='book' AND id=old.id OR book=old.id AND kind='character';
 INSERT INTO site_documents SELECT * FROM site_source_documents WHERE kind='book' AND id=old.id OR book=old.id AND kind='character';
END;
CREATE TRIGGER community_characters_insert AFTER INSERT ON characters BEGIN
 DELETE FROM site_documents WHERE kind='character' AND id=new.id OR kind='artwork' AND id IN (SELECT p.id FROM posts p,json_each(p.metadata,'$.character_ids') j WHERE j.value=new.id);
 INSERT INTO site_documents SELECT * FROM site_source_documents WHERE kind='character' AND id=new.id OR kind='artwork' AND id IN (SELECT p.id FROM posts p,json_each(p.metadata,'$.character_ids') j WHERE j.value=new.id);
END;
CREATE TRIGGER community_characters_update AFTER UPDATE ON characters BEGIN
 DELETE FROM site_documents WHERE kind='character' AND id=new.id OR kind='artwork' AND id IN (SELECT p.id FROM posts p,json_each(p.metadata,'$.character_ids') j WHERE j.value=new.id);
 INSERT INTO site_documents SELECT * FROM site_source_documents WHERE kind='character' AND id=new.id OR kind='artwork' AND id IN (SELECT p.id FROM posts p,json_each(p.metadata,'$.character_ids') j WHERE j.value=new.id);
END;
CREATE TRIGGER community_characters_delete AFTER DELETE ON characters BEGIN
 DELETE FROM site_documents WHERE kind='character' AND id=old.id OR kind='artwork' AND id IN (SELECT p.id FROM posts p,json_each(p.metadata,'$.character_ids') j WHERE j.value=old.id);
 INSERT INTO site_documents SELECT * FROM site_source_documents WHERE kind='character' AND id=old.id OR kind='artwork' AND id IN (SELECT p.id FROM posts p,json_each(p.metadata,'$.character_ids') j WHERE j.value=old.id);
END;
CREATE TRIGGER community_aliases_insert AFTER INSERT ON aliases BEGIN
 DELETE FROM site_documents WHERE kind='character' AND id=new.character;
 INSERT INTO site_documents SELECT * FROM site_source_documents WHERE kind='character' AND id=new.character;
END;
CREATE TRIGGER community_aliases_update AFTER UPDATE ON aliases BEGIN
 DELETE FROM site_documents WHERE kind='character' AND id=new.character;
 INSERT INTO site_documents SELECT * FROM site_source_documents WHERE kind='character' AND id=new.character;
END;
CREATE TRIGGER community_aliases_delete AFTER DELETE ON aliases BEGIN
 DELETE FROM site_documents WHERE kind='character' AND id=old.character;
 INSERT INTO site_documents SELECT * FROM site_source_documents WHERE kind='character' AND id=old.character;
END;
CREATE TRIGGER community_posts_insert AFTER INSERT ON posts BEGIN
 DELETE FROM site_documents WHERE kind='artwork' AND id=new.id;
 INSERT INTO site_documents SELECT * FROM site_source_documents WHERE kind='artwork' AND id=new.id;
END;
CREATE TRIGGER community_posts_update AFTER UPDATE ON posts BEGIN
 DELETE FROM site_documents WHERE kind='artwork' AND id=new.id;
 INSERT INTO site_documents SELECT * FROM site_source_documents WHERE kind='artwork' AND id=new.id;
END;
CREATE TRIGGER community_posts_delete AFTER DELETE ON posts BEGIN
 DELETE FROM site_documents WHERE kind='artwork' AND id=old.id;
 INSERT INTO site_documents SELECT * FROM site_source_documents WHERE kind='artwork' AND id=old.id;
END;
CREATE TRIGGER community_search_people_insert AFTER INSERT ON search_people BEGIN
 DELETE FROM site_documents WHERE kind='person' AND id=new.id;
 INSERT INTO site_documents SELECT * FROM site_source_documents WHERE kind='person' AND id=new.id;
END;
CREATE TRIGGER community_search_people_update AFTER UPDATE ON search_people BEGIN
 DELETE FROM site_documents WHERE kind='person' AND id=new.id;
 INSERT INTO site_documents SELECT * FROM site_source_documents WHERE kind='person' AND id=new.id;
END;
CREATE TRIGGER community_search_people_delete AFTER DELETE ON search_people BEGIN
 DELETE FROM site_documents WHERE kind='person' AND id=old.id;
 INSERT INTO site_documents SELECT * FROM site_source_documents WHERE kind='person' AND id=old.id;
END;
INSERT INTO site_documents SELECT * FROM site_source_documents;

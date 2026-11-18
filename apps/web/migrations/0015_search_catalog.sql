-- Catalog genres join the existing public search projection. Membership is filtered live.
DROP VIEW site_source_documents;
CREATE VIEW site_source_documents AS
 SELECT 'book' kind,b.id,b.id book,b.title,b.authors names,COALESCE(d.genres,'') description FROM books b LEFT JOIN book_details d ON d.book=b.id
 UNION ALL SELECT 'character',c.id,c.book,c.name,COALESCE((SELECT group_concat(name,' ') FROM aliases WHERE character=c.id),''),b.title FROM characters c JOIN books b ON b.id=c.book
 UNION ALL SELECT 'artwork',p.id,p.book,json_extract(p.metadata,'$.alt'),COALESCE((SELECT group_concat(c.name,' ') FROM json_each(p.metadata,'$.character_ids') j JOIN characters c ON c.id=j.value),''),
 COALESCE(json_extract(p.metadata,'$.style'),'') || ' ' || COALESCE(json_extract(p.metadata,'$.mood'),'') || ' ' || COALESCE(json_extract(p.metadata,'$.credit'),'') || ' ' || COALESCE(json_extract(p.metadata,'$.description'),'') || ' ' || COALESCE(json_extract(p.metadata,'$.tags'),'')
 FROM posts p WHERE removed IS NULL
 UNION ALL SELECT 'person',id,NULL,handle,display_name,'' FROM search_people;
CREATE TRIGGER search_catalog_insert AFTER INSERT ON book_details BEGIN
 DELETE FROM site_documents WHERE kind='book' AND id=new.book;
 INSERT INTO site_documents SELECT * FROM site_source_documents WHERE kind='book' AND id=new.book;
END;
CREATE TRIGGER search_catalog_update AFTER UPDATE ON book_details BEGIN
 DELETE FROM site_documents WHERE kind='book' AND id=new.book;
 INSERT INTO site_documents SELECT * FROM site_source_documents WHERE kind='book' AND id=new.book;
END;
CREATE TRIGGER search_catalog_delete AFTER DELETE ON book_details BEGIN
 DELETE FROM site_documents WHERE kind='book' AND id=old.book;
 INSERT INTO site_documents SELECT * FROM site_source_documents WHERE kind='book' AND id=old.book;
END;
DELETE FROM site_documents WHERE kind='book';
INSERT INTO site_documents SELECT * FROM site_source_documents WHERE kind='book';

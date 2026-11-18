-- Public-domain chapter I, paragraphs 2 and 3 (Project Gutenberg ebook 11).
INSERT OR IGNORE INTO books VALUES('book_alice','alice’s adventures in wonderland|lewis carroll|','Alice’s Adventures in Wonderland','["Lewis Carroll"]',NULL,1794268800000);
INSERT OR IGNORE INTO editions VALUES('gutenberg_11','book_alice','Gutenberg 11 · Millennium Fulcrum 3.0',NULL);
INSERT OR IGNORE INTO chapters VALUES ('book_alice',1,'Chapter I'),('book_alice',2,'Chapter II'),('book_alice',3,'Chapter III'),('book_alice',4,'Chapter IV'),('book_alice',5,'Chapter V'),('book_alice',6,'Chapter VI'),('book_alice',7,'Chapter VII'),('book_alice',8,'Chapter VIII'),('book_alice',9,'Chapter IX'),('book_alice',10,'Chapter X'),('book_alice',11,'Chapter XI'),('book_alice',12,'Chapter XII');
INSERT OR IGNORE INTO anchors VALUES('book_alice',1,'rabbit-first-appears',2),('book_alice',1,'rabbit-checks-watch',3);
INSERT OR IGNORE INTO characters VALUES('white_rabbit','book_alice','White Rabbit',100002);
INSERT OR IGNORE INTO aliases VALUES('white_rabbit','Rabbit',100002);
INSERT OR IGNORE INTO sources VALUES('g11','book_alice','Gutenberg 11','https://www.gutenberg.org/files/11/11-h/11-h.htm#chap01',0);
INSERT OR IGNORE INTO facts(id,book,character,detail,kind,source,locator,reveal,credit) VALUES
 ('alice_eyes','book_alice','white_rabbit','Has pink eyes','fact','g11','chapter I, paragraph 2',100002,NULL),
 ('alice_watch','book_alice','white_rabbit','Carries a watch in a waistcoat pocket','fact','g11','chapter I, paragraph 3',100003,NULL),
 ('alice_colour','book_alice','white_rabbit','Waistcoat colour','unknown','g11','chapter I, paragraph 3',100003,NULL);
INSERT OR IGNORE INTO passage_cues VALUES('book_alice','White Rabbit with pink eyes ran close by her',1,'rabbit-first-appears'),('book_alice','took a watch out of its waistcoat-pocket',1,'rabbit-checks-watch');

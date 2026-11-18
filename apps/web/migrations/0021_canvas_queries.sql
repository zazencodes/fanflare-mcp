CREATE INDEX posts_recent ON posts(approved DESC,id DESC) WHERE removed IS NULL;
CREATE INDEX posts_owner_recent ON posts(owner,approved DESC,id DESC) WHERE removed IS NULL;
CREATE INDEX posts_book_recent ON posts(book,approved DESC,id DESC) WHERE removed IS NULL;

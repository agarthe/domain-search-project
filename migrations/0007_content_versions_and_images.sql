-- Content page version history
CREATE TABLE IF NOT EXISTS content_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content_page_id INTEGER NOT NULL,
  version_number INTEGER NOT NULL,
  title_en TEXT NOT NULL,
  title_ja TEXT NOT NULL,
  content_en TEXT,
  content_ja TEXT,
  edited_by TEXT DEFAULT 'admin',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (content_page_id) REFERENCES content_pages(id) ON DELETE CASCADE
);

-- Uploaded images for content pages
CREATE TABLE IF NOT EXISTS content_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  url TEXT NOT NULL,
  uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_content_versions_page ON content_versions(content_page_id, version_number DESC);
CREATE INDEX IF NOT EXISTS idx_content_images_filename ON content_images(filename);

-- Create search_history table to track all domain searches
CREATE TABLE IF NOT EXISTS search_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  domain TEXT NOT NULL,
  status TEXT NOT NULL,  -- 'available', 'taken', 'unknown'
  tld TEXT,              -- Top-level domain extracted from domain name
  search_query TEXT,     -- Original search query
  language TEXT,         -- 'en' or 'ja'
  user_ip TEXT,          -- User's IP address (anonymized)
  user_agent TEXT,       -- User's browser info
  searched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_search_history_domain ON search_history(domain);
CREATE INDEX IF NOT EXISTS idx_search_history_status ON search_history(status);
CREATE INDEX IF NOT EXISTS idx_search_history_tld ON search_history(tld);
CREATE INDEX IF NOT EXISTS idx_search_history_searched_at ON search_history(searched_at DESC);
CREATE INDEX IF NOT EXISTS idx_search_history_month ON search_history(strftime('%Y-%m', searched_at));

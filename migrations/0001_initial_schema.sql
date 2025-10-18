-- Registrars table: stores domain registrar information
CREATE TABLE IF NOT EXISTS registrars (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  website TEXT NOT NULL,
  affiliate_link_template TEXT NOT NULL, -- Template: https://registrar.com/register?domain={domain}
  logo_url TEXT,
  is_active INTEGER DEFAULT 1,
  display_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Registrar pricing table: stores pricing for different TLDs
CREATE TABLE IF NOT EXISTS registrar_pricing (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  registrar_id INTEGER NOT NULL,
  tld TEXT NOT NULL, -- e.g., .com, .net, .jp
  currency TEXT DEFAULT 'USD',
  price REAL NOT NULL,
  renewal_price REAL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (registrar_id) REFERENCES registrars(id) ON DELETE CASCADE,
  UNIQUE(registrar_id, tld)
);

-- API keys table: stores API credentials for WHOIS and domain services
CREATE TABLE IF NOT EXISTS api_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  service_name TEXT NOT NULL UNIQUE, -- e.g., whois_api, domain_api
  api_key TEXT NOT NULL,
  api_secret TEXT,
  base_url TEXT,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Domain search cache: cache domain availability results
CREATE TABLE IF NOT EXISTS domain_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  domain TEXT NOT NULL UNIQUE,
  is_available INTEGER NOT NULL, -- 0: taken, 1: available, 2: unknown
  whois_data TEXT, -- JSON string containing WHOIS details
  last_checked DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- User preferences table: store user settings (optional, for future use)
CREATE TABLE IF NOT EXISTS user_preferences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT, -- Could be session ID or authenticated user ID
  theme TEXT DEFAULT 'light', -- light or dark
  language TEXT DEFAULT 'en', -- en or ja
  favorite_tlds TEXT, -- JSON array of preferred TLDs
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_registrar_pricing_tld ON registrar_pricing(tld);
CREATE INDEX IF NOT EXISTS idx_registrar_pricing_registrar ON registrar_pricing(registrar_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_service ON api_keys(service_name);
CREATE INDEX IF NOT EXISTS idx_domain_cache_domain ON domain_cache(domain);
CREATE INDEX IF NOT EXISTS idx_domain_cache_last_checked ON domain_cache(last_checked);
CREATE INDEX IF NOT EXISTS idx_registrars_active ON registrars(is_active, display_order);

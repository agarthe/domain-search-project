-- Settings table: stores application settings
CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  setting_key TEXT NOT NULL UNIQUE,
  setting_value TEXT,
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Insert default broker link setting
INSERT OR IGNORE INTO settings (setting_key, setting_value, description) 
VALUES ('domain_broker_link', 'https://domainagents.com/offer/{{ domain }}', 'Domain broker link template. Use {{ domain }} as placeholder.');

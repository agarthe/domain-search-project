-- Add exchange_rates table for currency conversion

CREATE TABLE IF NOT EXISTS exchange_rates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  base_currency TEXT NOT NULL DEFAULT 'USD',
  target_currency TEXT NOT NULL,
  rate REAL NOT NULL,
  last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(base_currency, target_currency)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_exchange_rates_currencies ON exchange_rates(base_currency, target_currency);

-- Insert default rate (will be updated by API)
INSERT OR IGNORE INTO exchange_rates (base_currency, target_currency, rate) VALUES ('USD', 'JPY', 150.0);

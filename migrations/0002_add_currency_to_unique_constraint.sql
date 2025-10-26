-- Add currency to unique constraint for registrar_pricing
-- This allows same registrar+tld combination with different currencies

-- Step 1: Create new table with updated constraint
CREATE TABLE IF NOT EXISTS registrar_pricing_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  registrar_id INTEGER NOT NULL,
  tld TEXT NOT NULL,
  currency TEXT DEFAULT 'USD',
  price REAL NOT NULL,
  renewal_price REAL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (registrar_id) REFERENCES registrars(id) ON DELETE CASCADE,
  UNIQUE(registrar_id, tld, currency)
);

-- Step 2: Copy existing data
INSERT INTO registrar_pricing_new (id, registrar_id, tld, currency, price, renewal_price, created_at, updated_at)
SELECT id, registrar_id, tld, currency, price, renewal_price, created_at, updated_at
FROM registrar_pricing;

-- Step 3: Drop old table
DROP TABLE registrar_pricing;

-- Step 4: Rename new table
ALTER TABLE registrar_pricing_new RENAME TO registrar_pricing;

-- Step 5: Recreate indexes
CREATE INDEX IF NOT EXISTS idx_registrar_pricing_tld ON registrar_pricing(tld);
CREATE INDEX IF NOT EXISTS idx_registrar_pricing_registrar ON registrar_pricing(registrar_id);
CREATE INDEX IF NOT EXISTS idx_registrar_pricing_unique ON registrar_pricing(registrar_id, tld, currency);

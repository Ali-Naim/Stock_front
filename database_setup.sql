-- Inventory Table
CREATE TABLE IF NOT EXISTS inventory (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name TEXT NOT NULL UNIQUE,
  quantity INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Orders Table
CREATE TABLE IF NOT EXISTS orders (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  order_name TEXT NOT NULL,
  phone_number TEXT,
  village TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  is_saved BOOLEAN NOT NULL DEFAULT FALSE,
  is_registered BOOLEAN NOT NULL DEFAULT FALSE,
  source_need_id BIGINT,
  items JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Needs Table
CREATE TABLE IF NOT EXISTS family_needs (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  family_name TEXT NOT NULL,
  phone_number TEXT,
  village_id BIGINT NOT NULL REFERENCES villages(id),
  people_count INT NOT NULL DEFAULT 1,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  priority TEXT NOT NULL DEFAULT 'normal',
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Migration helpers for older databases
ALTER TABLE inventory
  ADD COLUMN IF NOT EXISTS quantity INT NOT NULL DEFAULT 0;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS order_name TEXT;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS phone_number TEXT;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS is_saved BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS is_registered BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS source_need_id BIGINT;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS items JSONB;

ALTER TABLE family_needs
  ADD COLUMN IF NOT EXISTS phone_number TEXT;

ALTER TABLE family_needs
  ADD COLUMN IF NOT EXISTS people_count INT NOT NULL DEFAULT 1;

ALTER TABLE family_needs
  ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE family_needs
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';

ALTER TABLE family_needs
  ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal';

ALTER TABLE family_needs
  ADD COLUMN IF NOT EXISTS items JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE family_needs
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- If an older schema used customer_name instead of order_name, copy values once.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'orders'
      AND column_name = 'customer_name'
  ) THEN
    EXECUTE '
      UPDATE orders
      SET order_name = customer_name
      WHERE order_name IS NULL
        AND customer_name IS NOT NULL
    ';
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_inventory_name ON inventory(name);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_is_saved ON orders(is_saved);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_family_needs_family_name ON family_needs(family_name);
CREATE INDEX IF NOT EXISTS idx_family_needs_phone_number ON family_needs(phone_number);
CREATE INDEX IF NOT EXISTS idx_family_needs_village_id ON family_needs(village_id);
CREATE INDEX IF NOT EXISTS idx_family_needs_status ON family_needs(status);
CREATE INDEX IF NOT EXISTS idx_family_needs_priority ON family_needs(priority);
CREATE INDEX IF NOT EXISTS idx_family_needs_created_at ON family_needs(created_at);

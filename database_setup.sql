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
  village TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  is_saved BOOLEAN NOT NULL DEFAULT FALSE,
  items JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Migration helpers for older databases
ALTER TABLE inventory
  ADD COLUMN IF NOT EXISTS quantity INT NOT NULL DEFAULT 0;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS order_name TEXT;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS is_saved BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS items JSONB;

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

# Database changes for Login + Roles + Allowed Pages

This frontend expects your backend to implement login and return a token plus the user roles (and optionally explicit allowed pages).

## Pages (tabs) used by the frontend

- `inventory`
- `orders`
- `needs`
- `families`
- `reports`

## Recommended RBAC schema (works in PostgreSQL / MySQL with small syntax tweaks)

### 1) Users

```sql
CREATE TABLE users (
  id            BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  username      VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### 2) Roles

```sql
CREATE TABLE roles (
  id   BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name VARCHAR(50) NOT NULL UNIQUE
);
```

Seed roles:

```sql
INSERT INTO roles (name) VALUES
  ('admin'),
  ('call_center'),
  ('data_entry'),
  ('stock');
```

## Creating users (example admin user)

There is **no default admin username/password** shipped in this repo. You create users in your DB.

If you are on **Supabase Postgres**, you can hash passwords in SQL with `pgcrypto` (Supabase commonly installs it under the `extensions` schema):

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Example: create an admin user (choose your own password)
INSERT INTO users (username, password_hash)
VALUES ('admin', extensions.crypt('ChangeMeNow_123', extensions.gen_salt('bf')))
RETURNING id;
```

Then assign roles to the user:

```sql
-- Attach the "admin" role to username "admin"
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id
FROM users u
JOIN roles r ON r.name = 'admin'
WHERE u.username = 'admin';
```

To add any user with any role, change the username + role name:

```sql
-- Example: add "agent1" as call_center
INSERT INTO users (username, password_hash)
VALUES ('agent1', extensions.crypt('AgentPassword_123', extensions.gen_salt('bf')))
RETURNING id;

INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id
FROM users u
JOIN roles r ON r.name = 'call_center'
WHERE u.username = 'agent1';
```

### 3) Pages

```sql
CREATE TABLE pages (
  id    BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  code  VARCHAR(50) NOT NULL UNIQUE,
  label VARCHAR(100)
);

INSERT INTO pages (code, label) VALUES
  ('inventory', 'Inventory'),
  ('orders',    'Orders'),
  ('needs',     'Needs'),
  ('families',  'Families'),
  ('reports',   'Reports');
```

### 4) User ↔ Role mapping (supports multiple roles per user)

```sql
CREATE TABLE user_roles (
  user_id BIGINT NOT NULL,
  role_id BIGINT NOT NULL,
  PRIMARY KEY (user_id, role_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
);
```

### 5) Role ↔ Page allowlist

```sql
CREATE TABLE role_pages (
  role_id BIGINT NOT NULL,
  page_id BIGINT NOT NULL,
  PRIMARY KEY (role_id, page_id),
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE
);
```

Seed role permissions (matches the frontend defaults):

```sql
-- admin: everything
INSERT INTO role_pages (role_id, page_id)
SELECT r.id, p.id
FROM roles r
JOIN pages p ON 1=1
WHERE r.name = 'admin';

-- call_center: needs + orders
INSERT INTO role_pages (role_id, page_id)
SELECT r.id, p.id
FROM roles r
JOIN pages p ON p.code IN ('needs','orders','families')
WHERE r.name = 'call_center';

-- data_entry: needs only
INSERT INTO role_pages (role_id, page_id)
SELECT r.id, p.id
FROM roles r
JOIN pages p ON p.code IN ('needs','orders','families')
WHERE r.name = 'data_entry';

-- stock: inventory + orders + reports
INSERT INTO role_pages (role_id, page_id)
SELECT r.id, p.id
FROM roles r
JOIN pages p ON p.code IN ('inventory','orders','families','reports')
WHERE r.name = 'stock';

## Families + distributions (logs) schema (recommended)

This feature adds:

- `families`: one row per family (represented by the father)
- `family_distributions`: one row per distribution event (with timestamp + type)
- `family_distribution_items`: items + quantities in each event

Assumptions:

- You already have a `villages` table (used by `GET /api/villages`)
- You already have an inventory items table (used by `GET /api/inventory`)

### 1) Families

```sql
CREATE TABLE families (
  id                BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  father_first_name VARCHAR(100) NOT NULL,
  father_last_name  VARCHAR(100) NOT NULL,
  phone_number      TEXT NULL,
  people_count      INT NOT NULL DEFAULT 1 CHECK (people_count > 0),
  village_id        BIGINT NULL REFERENCES villages(id) ON DELETE SET NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Optional: reduce duplicates inside the same village.
CREATE UNIQUE INDEX families_unique_father_village
  ON families (LOWER(father_first_name), LOWER(father_last_name), village_id);
```

### 2) Distribution logs (time + type)

```sql
CREATE TABLE family_distributions (
  id             BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  family_id      BIGINT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  type           VARCHAR(20) NOT NULL CHECK (type IN ('local','municipality')),
  distributed_at TIMESTAMP NOT NULL DEFAULT NOW(),
  notes          TEXT NULL,
  created_by     BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX family_distributions_family_time_idx
  ON family_distributions (family_id, distributed_at DESC);
```

### 3) Items inside each distribution

```sql
CREATE TABLE family_distribution_items (
  distribution_id BIGINT NOT NULL REFERENCES family_distributions(id) ON DELETE CASCADE,
  item_id         BIGINT NOT NULL, -- reference your inventory items table id
  quantity        NUMERIC(12,2) NOT NULL CHECK (quantity > 0),
  PRIMARY KEY (distribution_id, item_id)
);

CREATE INDEX family_distribution_items_item_idx
  ON family_distribution_items (item_id);
```

### 4) Family relations (prepare for linking families later)

```sql
CREATE TABLE family_relations (
  id            BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  family_id_a   BIGINT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  family_id_b   BIGINT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL,
  notes         TEXT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT family_relations_not_self CHECK (family_id_a <> family_id_b)
);

-- Prevent duplicates regardless of A/B order (Postgres).
CREATE UNIQUE INDEX family_relations_unique_pair_type
  ON family_relations (LEAST(family_id_a, family_id_b), GREATEST(family_id_a, family_id_b), relation_type);
```
```

## Backend auth tables (sessions) + login RPC (Supabase/Postgres)

The backend implementation added in `Stock_back` uses:

- `POST /api/auth/login` to create a session token
- `Authorization: Bearer <token>` for all other requests

Create the following table and RPC function in your database:

```sql
CREATE TABLE user_sessions (
  id            BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash    TEXT NOT NULL UNIQUE,
  roles         TEXT[] NOT NULL DEFAULT '{}'::text[],
  allowed_pages TEXT[] NOT NULL DEFAULT '{}'::text[],
  expires_at    TIMESTAMP NOT NULL,
  revoked_at    TIMESTAMP NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION auth_verify_password(p_username text, p_password text)
RETURNS TABLE (user_id bigint, username text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id, u.username
  FROM users u
  WHERE u.is_active = true
    AND u.username = p_username
    AND u.password_hash = extensions.crypt(p_password, u.password_hash::text)
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION auth_verify_password(text, text) TO anon, authenticated, service_role;
```

## Backend login response shape (what the frontend can read)

Endpoint: `POST /api/auth/login`

Request body:

```json
{ "username": "user1", "password": "secret" }
```

Response body (minimum):

```json
{
  "token": "JWT_OR_SESSION_TOKEN",
  "user": { "id": 1, "username": "user1", "roles": ["stock"] }
}
```

Optional (recommended): return `allowed_pages` directly (so permissions live in DB only):

```json
{
  "token": "JWT_OR_SESSION_TOKEN",
  "user": { "id": 1, "username": "user1", "roles": ["stock"] },
  "allowed_pages": ["inventory", "orders"]
}
```

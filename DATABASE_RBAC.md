# Database changes for Login + Roles + Allowed Pages

This frontend expects your backend to implement login and return a token plus the user roles (and optionally explicit allowed pages).

## Pages (tabs) used by the frontend

- `inventory`
- `orders`
- `needs`
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
JOIN pages p ON p.code IN ('needs','orders')
WHERE r.name = 'call_center';

-- data_entry: needs only
INSERT INTO role_pages (role_id, page_id)
SELECT r.id, p.id
FROM roles r
JOIN pages p ON p.code IN ('needs','orders')
WHERE r.name = 'data_entry';

-- stock: inventory + orders + reports
INSERT INTO role_pages (role_id, page_id)
SELECT r.id, p.id
FROM roles r
JOIN pages p ON p.code IN ('inventory','orders','reports')
WHERE r.name = 'stock';
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

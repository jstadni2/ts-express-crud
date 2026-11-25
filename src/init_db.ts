import { closePool, pool } from "./db.js";

/**
 * Initialize all database tables without migration tooling. Port of the
 * `flask --app src/app.py init-db` CLI command (SQLAlchemy `db.create_all()`).
 */
const DDL = `
DO $$ BEGIN
  CREATE TYPE siteownership AS ENUM ('Owned', 'Leased', 'P3', 'Other', 'Occupied');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE sitestatus AS ENUM ('Active', 'Inactive', 'Planned');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE organizationtype AS ENUM ('Internal', 'External');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE installationstatus AS ENUM ('Planned', 'Installed', 'Maintenance', 'Retired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS organizations (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name varchar(200) NOT NULL UNIQUE,
  org_type organizationtype NOT NULL,
  description text
);

CREATE TABLE IF NOT EXISTS contacts (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  first_name varchar(100) NOT NULL,
  last_name varchar(100) NOT NULL,
  title varchar(150),
  email varchar(255),
  phone varchar(50),
  organization_id integer NOT NULL REFERENCES organizations(id)
);

CREATE TABLE IF NOT EXISTS sites (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  site_name varchar(200) NOT NULL,
  address_line1 varchar(255) NOT NULL,
  address_line2 varchar(255),
  city varchar(100) NOT NULL,
  state varchar(100) NOT NULL,
  postal_code varchar(30) NOT NULL,
  country varchar(100) NOT NULL,
  building_code varchar(50) NOT NULL,
  ownership siteownership NOT NULL,
  status sitestatus NOT NULL,
  description text,
  longitude numeric(10, 6),
  latitude numeric(10, 6),
  room_number varchar(50),
  owner_organization_id integer NOT NULL REFERENCES organizations(id)
);

CREATE TABLE IF NOT EXISTS systems (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name varchar(200) NOT NULL,
  system_type varchar(100) NOT NULL,
  description text,
  installation_date date NOT NULL,
  warranty_expiry_date date,
  installer_organization_id integer REFERENCES organizations(id),
  equipment_condition varchar(50),
  status installationstatus NOT NULL DEFAULT 'Planned',
  site_id integer NOT NULL REFERENCES sites(id),
  responsible_organization_id integer REFERENCES organizations(id),
  last_updated timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_system_installation_date CHECK (installation_date IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS site_contacts (
  site_id integer NOT NULL REFERENCES sites(id),
  contact_id integer NOT NULL REFERENCES contacts(id),
  PRIMARY KEY (site_id, contact_id)
);

CREATE TABLE IF NOT EXISTS system_contacts (
  system_id integer NOT NULL REFERENCES systems(id),
  contact_id integer NOT NULL REFERENCES contacts(id),
  PRIMARY KEY (system_id, contact_id)
);
`;

async function main(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(DDL);
    console.log("Database tables created.");
  } finally {
    client.release();
    await closePool();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});

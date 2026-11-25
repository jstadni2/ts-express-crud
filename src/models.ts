import { sql } from "drizzle-orm";
import {
  check,
  date,
  integer,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * Enum value sets mirroring `src/models.py`. The object keys mirror the Python
 * enum member names; the values are the human-facing values stored in
 * PostgreSQL enum types.
 */
export const SITE_OWNERSHIP = {
  OWNED: "Owned",
  LEASED: "Leased",
  P3: "P3",
  OTHER: "Other",
  OCCUPIED: "Occupied",
} as const;

export const SITE_STATUS = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  PLANNED: "Planned",
} as const;

export const ORGANIZATION_TYPE = {
  INTERNAL: "Internal",
  EXTERNAL: "External",
} as const;

export const INSTALLATION_STATUS = {
  PLANNED: "Planned",
  INSTALLED: "Installed",
  MAINTENANCE: "Maintenance",
  RETIRED: "Retired",
} as const;

export const siteOwnershipEnum = pgEnum("siteownership", [
  "Owned",
  "Leased",
  "P3",
  "Other",
  "Occupied",
]);
export const siteStatusEnum = pgEnum("sitestatus", ["Active", "Inactive", "Planned"]);
export const organizationTypeEnum = pgEnum("organizationtype", ["Internal", "External"]);
export const installationStatusEnum = pgEnum("installationstatus", [
  "Planned",
  "Installed",
  "Maintenance",
  "Retired",
]);

export const organizations = pgTable("organizations", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: varchar("name", { length: 200 }).notNull().unique(),
  orgType: organizationTypeEnum("org_type").notNull(),
  description: text("description"),
});

export const contacts = pgTable("contacts", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  firstName: varchar("first_name", { length: 100 }).notNull(),
  lastName: varchar("last_name", { length: 100 }).notNull(),
  title: varchar("title", { length: 150 }),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  organizationId: integer("organization_id")
    .notNull()
    .references(() => organizations.id),
});

export const sites = pgTable("sites", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  siteName: varchar("site_name", { length: 200 }).notNull(),
  addressLine1: varchar("address_line1", { length: 255 }).notNull(),
  addressLine2: varchar("address_line2", { length: 255 }),
  city: varchar("city", { length: 100 }).notNull(),
  state: varchar("state", { length: 100 }).notNull(),
  postalCode: varchar("postal_code", { length: 30 }).notNull(),
  country: varchar("country", { length: 100 }).notNull(),
  buildingCode: varchar("building_code", { length: 50 }).notNull(),
  ownership: siteOwnershipEnum("ownership").notNull(),
  status: siteStatusEnum("status").notNull(),
  description: text("description"),
  longitude: numeric("longitude", { precision: 10, scale: 6 }),
  latitude: numeric("latitude", { precision: 10, scale: 6 }),
  roomNumber: varchar("room_number", { length: 50 }),
  ownerOrganizationId: integer("owner_organization_id")
    .notNull()
    .references(() => organizations.id),
});

export const systems = pgTable(
  "systems",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    name: varchar("name", { length: 200 }).notNull(),
    systemType: varchar("system_type", { length: 100 }).notNull(),
    description: text("description"),
    installationDate: date("installation_date").notNull(),
    warrantyExpiryDate: date("warranty_expiry_date"),
    installerOrganizationId: integer("installer_organization_id").references(
      () => organizations.id,
    ),
    equipmentCondition: varchar("equipment_condition", { length: 50 }), // e.g., New, Good, Fair, Poor
    status: installationStatusEnum("status").notNull().default("Planned"),
    siteId: integer("site_id")
      .notNull()
      .references(() => sites.id),
    responsibleOrganizationId: integer("responsible_organization_id").references(
      () => organizations.id,
    ),
    lastUpdated: timestamp("last_updated", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [check("ck_system_installation_date", sql`${table.installationDate} IS NOT NULL`)],
);

export const siteContacts = pgTable(
  "site_contacts",
  {
    siteId: integer("site_id")
      .notNull()
      .references(() => sites.id),
    contactId: integer("contact_id")
      .notNull()
      .references(() => contacts.id),
  },
  (table) => [primaryKey({ columns: [table.siteId, table.contactId] })],
);

export const systemContacts = pgTable(
  "system_contacts",
  {
    systemId: integer("system_id")
      .notNull()
      .references(() => systems.id),
    contactId: integer("contact_id")
      .notNull()
      .references(() => contacts.id),
  },
  (table) => [primaryKey({ columns: [table.systemId, table.contactId] })],
);

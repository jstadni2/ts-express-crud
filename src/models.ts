import {
  pgEnum,
  pgTable,
  integer,
  text,
  varchar,
  numeric,
  date,
  primaryKey,
  timestamp,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

/**
 * Drizzle ORM schema for the AV Installation Database.
 *
 * Mirrors the Flask/SQLAlchemy schema in the original
 * `flask-crud-auth-rbac` application. PostgreSQL native enums store the
 * human-facing display values (e.g. "Owned", "Internal", "Planned") so that
 * form submit values match stored values exactly.
 */

export const siteOwnershipEnum = pgEnum("siteownership", [
  "Owned",
  "Leased",
  "P3",
  "Other",
  "Occupied",
]);

export const siteStatusEnum = pgEnum("sitestatus", [
  "Active",
  "Inactive",
  "Planned",
]);

export const organizationTypeEnum = pgEnum("organizationtype", [
  "Internal",
  "External",
]);

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

export const systems = pgTable("systems", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: varchar("name", { length: 200 }).notNull(),
  systemType: varchar("system_type", { length: 100 }).notNull(),
  description: text("description"),
  installationDate: date("installation_date").notNull(),
  warrantyExpiryDate: date("warranty_expiry_date"),
  installerOrganizationId: integer("installer_organization_id").references(
    () => organizations.id,
  ),
  equipmentCondition: varchar("equipment_condition", { length: 50 }),
  status: installationStatusEnum("status")
    .notNull()
    .default("Planned"),
  siteId: integer("site_id")
    .notNull()
    .references(() => sites.id),
  responsibleOrganizationId: integer("responsible_organization_id").references(
    () => organizations.id,
  ),
  lastUpdated: timestamp("last_updated", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
});

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

// ----- Relations -------------------------------------------------------------
// Linked records used by the query layer and templates.

export const organizationsRelations = relations(organizations, ({ many }) => ({
  contacts: many(contacts),
  ownedSites: many(sites),
  responsibleSystems: many(systems, {
    relationName: "responsibleSystems",
  }),
  installedSystems: many(systems, {
    relationName: "installedSystems",
  }),
}));

export const contactsRelations = relations(contacts, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [contacts.organizationId],
    references: [organizations.id],
  }),
  sites: many(siteContacts),
  systems: many(systemContacts),
}));

export const sitesRelations = relations(sites, ({ one, many }) => ({
  ownerOrganization: one(organizations, {
    fields: [sites.ownerOrganizationId],
    references: [organizations.id],
  }),
  contacts: many(siteContacts),
  systems: many(systems),
}));

export const systemsRelations = relations(systems, ({ one, many }) => ({
  site: one(sites, {
    fields: [systems.siteId],
    references: [sites.id],
  }),
  responsibleOrganization: one(organizations, {
    fields: [systems.responsibleOrganizationId],
    references: [organizations.id],
    relationName: "responsibleSystems",
  }),
  installerOrganization: one(organizations, {
    fields: [systems.installerOrganizationId],
    references: [organizations.id],
    relationName: "installedSystems",
  }),
  contacts: many(systemContacts),
}));

export const siteContactsRelations = relations(siteContacts, ({ one }) => ({
  site: one(sites, {
    fields: [siteContacts.siteId],
    references: [sites.id],
  }),
  contact: one(contacts, {
    fields: [siteContacts.contactId],
    references: [contacts.id],
  }),
}));

export const systemContactsRelations = relations(systemContacts, ({ one }) => ({
  system: one(systems, {
    fields: [systemContacts.systemId],
    references: [systems.id],
  }),
  contact: one(contacts, {
    fields: [systemContacts.contactId],
    references: [contacts.id],
  }),
}));

// ----- Types ----------------------------------------------------------------

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;
export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;
export type Site = typeof sites.$inferSelect;
export type NewSite = typeof sites.$inferInsert;
export type System = typeof systems.$inferSelect;
export type NewSystem = typeof systems.$inferInsert;
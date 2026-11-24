import { and, eq, inArray } from "drizzle-orm";
import type { Request } from "express";

import { db } from "./db.js";
import {
  organizations,
  contacts,
  sites,
  systems,
  siteContacts,
  systemContacts,
} from "./models.js";
import { ValidationError, parseDate, parseDecimal, getEnumByValue } from "./helpers.js";

// Enum value lists (human-facing)
export const SITE_OWNERSHIP = ["Owned", "Leased", "P3", "Other", "Occupied"] as const;
export const SITE_STATUS = ["Active", "Inactive", "Planned"] as const;
export const ORGANIZATION_TYPE = ["Internal", "External"] as const;
export const INSTALLATION_STATUS = ["Planned", "Installed", "Maintenance", "Retired"] as const;

// ---- Mappers ----------------------------------------------------------------

function toArrayInsert(value: unknown): number[] {
  if (value === undefined || value === null || value === "") return [];
  const arr = Array.isArray(value) ? value : [value];
  return arr.map((v) => Number(v)).filter((n) => !Number.isNaN(n) && n > 0);
}

function intOrNull(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

function requiredInt(value: unknown, fieldName: string): number {
  const n = intOrNull(value);
  if (n === null) throw new ValidationError(`${fieldName} is required.`);
  return n;
}

function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return "N/A";
  const date = d instanceof Date ? d : new Date(d);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

// ---- Systems ----------------------------------------------------------------

export async function listSystems() {
  const rows = await db.query.systems.findMany({
    with: {
      site: true,
      responsibleOrganization: true,
      installerOrganization: true,
      contacts: { with: { contact: { with: { organization: true } } } },
    },
    orderBy: (s, { desc }) => [desc(s.lastUpdated)],
  });
  return rows.map((row) => ({
    ...row,
    contacts: row.contacts.map((c) => c.contact),
    lastUpdated: formatDateTime(row.lastUpdated),
  }));
}

export async function getSystem(id: string | number) {
  const row = await db.query.systems.findFirst({
    where: (s, { eq }) => eq(s.id, Number(id)),
    with: {
      site: true,
      responsibleOrganization: true,
      installerOrganization: true,
      contacts: { with: { contact: { with: { organization: true } } } },
    },
  });
  if (!row) throw new NotFoundError();
  return { ...row, contacts: row.contacts.map((c) => c.contact) };
}

export async function getSystemForEdit(id: string | number) {
  return getSystem(id);
}

async function resolveSystemContacts(ids: number[]) {
  if (ids.length === 0) return [];
  return db.query.contacts.findMany({
    where: (c, { inArray }) => inArray(c.id, ids),
  });
}

async function createSystemFromBody(body: any) {
  const installationDate = parseDate(body.installation_date);
  if (!installationDate) throw new ValidationError("Installation date is required.");
  const warrantyExpiryDate = parseDate(body.warranty_expiry_date);

  const systemId = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(systems)
      .values({
        name: String(body.name || "").trim(),
        systemType: String(body.system_type || "").trim(),
        description: String(body.description || "").trim(),
        installationDate,
        warrantyExpiryDate,
        installerOrganizationId: intOrNull(body.installer_organization_id),
        equipmentCondition: String(body.equipment_condition || "").trim() || null,
        status: getEnumByValue(INSTALLATION_STATUS, body.status, "InstallationStatus"),
        siteId: requiredInt(body.site_id, "Site"),
        responsibleOrganizationId: intOrNull(body.responsible_organization_id),
      })
      .returning({ id: systems.id });
    const contactIds = toArrayInsert(body.contact_ids);
    if (contactIds.length > 0) {
      const existing = await resolveSystemContacts(contactIds);
      await tx
        .insert(systemContacts)
        .values(existing.map((c) => ({ systemId: inserted.id, contactId: c.id })));
    }
    return inserted.id;
  });
  return systemId;
}

export async function createSystem(body: any, _req: Request): Promise<number> {
  return createSystemFromBody(body);
}

export async function updateSystem(id: string | number, body: any, _req: Request) {
  const systemId = Number(id);
  const installationDate = parseDate(body.installation_date);
  if (!installationDate) throw new ValidationError("Installation date is required.");
  const warrantyExpiryDate = parseDate(body.warranty_expiry_date);
  const contactIds = toArrayInsert(body.contact_ids);

  await db.transaction(async (tx) => {
    await tx
      .update(systems)
      .set({
        name: String(body.name || "").trim(),
        systemType: String(body.system_type || "").trim(),
        description: String(body.description || "").trim(),
        installationDate,
        warrantyExpiryDate,
        installerOrganizationId: intOrNull(body.installer_organization_id),
        equipmentCondition: String(body.equipment_condition || "").trim() || null,
        status: getEnumByValue(INSTALLATION_STATUS, body.status, "InstallationStatus"),
        siteId: requiredInt(body.site_id, "Site"),
        responsibleOrganizationId: intOrNull(body.responsible_organization_id),
      })
      .where(eq(systems.id, systemId));

    await tx.delete(systemContacts).where(eq(systemContacts.systemId, systemId));
    if (contactIds.length > 0) {
      const existing = await resolveSystemContacts(contactIds);
      await tx
        .insert(systemContacts)
        .values(existing.map((c) => ({ systemId, contactId: c.id })));
    }
  });
}

export async function deleteSystem(id: string | number) {
  const systemId = Number(id);
  await db.transaction(async (tx) => {
    await tx.delete(systemContacts).where(eq(systemContacts.systemId, systemId));
    await tx.delete(systems).where(eq(systems.id, systemId));
  });
}

// ---- Sites ------------------------------------------------------------------

export async function listSites() {
  const rows = await db.query.sites.findMany({
    with: {
      ownerOrganization: true,
      contacts: { with: { contact: true } },
    },
    orderBy: (s, { asc }) => [asc(s.siteName)],
  });
  return rows.map((row) => ({ ...row, contacts: row.contacts.map((c) => c.contact) }));
}

export async function getSite(id: string | number) {
  const row = await db.query.sites.findFirst({
    where: (s, { eq }) => eq(s.id, Number(id)),
    with: {
      ownerOrganization: true,
      contacts: { with: { contact: true } },
    },
  });
  if (!row) throw new NotFoundError();
  return { ...row, contacts: row.contacts.map((c) => c.contact) };
}

export async function getSiteForEdit(id: string | number) {
  return getSite(id);
}

async function createSiteFromBody(body: any) {
  const siteId = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(sites)
      .values({
        siteName: String(body.site_name || "").trim(),
        addressLine1: String(body.address_line1 || "").trim(),
        addressLine2: String(body.address_line2 || "").trim() || null,
        city: String(body.city || "").trim(),
        state: String(body.state || "").trim(),
        postalCode: String(body.postal_code || "").trim(),
        country: String(body.country || "").trim(),
        buildingCode: String(body.building_code || "").trim(),
        ownership: getEnumByValue(SITE_OWNERSHIP, body.ownership, "SiteOwnership"),
        status: getEnumByValue(SITE_STATUS, body.status, "SiteStatus"),
        description: String(body.description || "").trim(),
        longitude: body.longitude ? parseDecimal("Longitude", body.longitude) : null,
        latitude: body.latitude ? parseDecimal("Latitude", body.latitude) : null,
        roomNumber: String(body.room_number || "").trim() || null,
        ownerOrganizationId: requiredInt(body.owner_organization_id, "Owner Organization"),
      })
      .returning({ id: sites.id });
    const contactIds = toArrayInsert(body.contact_ids);
    if (contactIds.length > 0) {
      const existing = await resolveSiteContacts(contactIds);
      await tx
        .insert(siteContacts)
        .values(existing.map((c) => ({ siteId: inserted.id, contactId: c.id })));
    }
    return inserted.id;
  });
  return siteId;
}

async function resolveSiteContacts(ids: number[]) {
  if (ids.length === 0) return [];
  return db.query.contacts.findMany({
    where: (c, { inArray }) => inArray(c.id, ids),
  });
}

export async function createSite(body: any, _req: Request): Promise<number> {
  return createSiteFromBody(body);
}

export async function updateSite(id: string | number, body: any, _req: Request) {
  const siteId = Number(id);
  const contactIds = toArrayInsert(body.contact_ids);
  await db.transaction(async (tx) => {
    await tx
      .update(sites)
      .set({
        siteName: String(body.site_name || "").trim(),
        addressLine1: String(body.address_line1 || "").trim(),
        addressLine2: String(body.address_line2 || "").trim() || null,
        city: String(body.city || "").trim(),
        state: String(body.state || "").trim(),
        postalCode: String(body.postal_code || "").trim(),
        country: String(body.country || "").trim(),
        buildingCode: String(body.building_code || "").trim(),
        ownership: getEnumByValue(SITE_OWNERSHIP, body.ownership, "SiteOwnership"),
        status: getEnumByValue(SITE_STATUS, body.status, "SiteStatus"),
        description: String(body.description || "").trim(),
        longitude: body.longitude ? parseDecimal("Longitude", body.longitude) : null,
        latitude: body.latitude ? parseDecimal("Latitude", body.latitude) : null,
        roomNumber: String(body.room_number || "").trim() || null,
        ownerOrganizationId: requiredInt(body.owner_organization_id, "Owner Organization"),
      })
      .where(eq(sites.id, siteId));
    await tx.delete(siteContacts).where(eq(siteContacts.siteId, siteId));
    if (contactIds.length > 0) {
      const existing = await resolveSiteContacts(contactIds);
      await tx
        .insert(siteContacts)
        .values(existing.map((c) => ({ siteId, contactId: c.id })));
    }
  });
}

export async function deleteSite(id: string | number) {
  const siteId = Number(id);
  await db.transaction(async (tx) => {
    await tx.delete(siteContacts).where(eq(siteContacts.siteId, siteId));
    await tx.delete(sites).where(eq(sites.id, siteId));
  });
}

export async function siteHasSystems(id: string | number): Promise<boolean> {
  const rows = await db.query.systems.findFirst({
    where: (s, { eq }) => eq(s.siteId, Number(id)),
  });
  return Boolean(rows);
}

// ---- Organizations ------------------------------------------------------------

export async function listOrganizations() {
  return db.query.organizations.findMany({
    orderBy: (o, { asc }) => [asc(o.name)],
  });
}

export async function getOrganization(id: string | number) {
  const row = await db.query.organizations.findFirst({
    where: (o, { eq }) => eq(o.id, Number(id)),
  });
  if (!row) throw new NotFoundError();
  return row;
}

async function createOrganizationFromBody(body: any) {
  const [row] = await db
    .insert(organizations)
    .values({
      name: String(body.name || "").trim(),
      orgType: getEnumByValue(ORGANIZATION_TYPE, body.org_type, "OrganizationType"),
      description: String(body.description || "").trim(),
    })
    .returning({ id: organizations.id });
  return row.id;
}

export async function createOrganization(body: any, _req: Request): Promise<number> {
  return createOrganizationFromBody(body);
}

export async function updateOrganization(id: string | number, body: any, _req: Request) {
  await db
    .update(organizations)
    .set({
      name: String(body.name || "").trim(),
      orgType: getEnumByValue(ORGANIZATION_TYPE, body.org_type, "OrganizationType"),
      description: String(body.description || "").trim(),
    })
    .where(eq(organizations.id, Number(id)));
}

export async function deleteOrganization(id: string | number) {
  const orgId = Number(id);
  await db.transaction(async (tx) => {
    const orgContacts = await tx.query.contacts.findMany({
      where: (c, { eq }) => eq(c.organizationId, orgId),
      columns: { id: true },
    });
    const contactIds = orgContacts.map((c) => c.id);
    if (contactIds.length) {
      await tx.delete(siteContacts).where(inArray(siteContacts.contactId, contactIds));
      await tx.delete(systemContacts).where(inArray(systemContacts.contactId, contactIds));
      await tx.delete(contacts).where(inArray(contacts.id, contactIds));
    }
    await tx.delete(organizations).where(eq(organizations.id, orgId));
  });
}

export async function organizationDeleteBlocked(id: string | number): Promise<string | null> {
  const orgId = Number(id);
  const ownedSites = await db.query.sites.findFirst({
    where: (s, { eq }) => eq(s.ownerOrganizationId, orgId),
  });
  if (ownedSites) {
    return "Unable to delete organization: reassign or delete owned sites first.";
  }
  const responsibleSystems = await db.query.systems.findFirst({
    where: (s, { eq }) => eq(s.responsibleOrganizationId, orgId),
  });
  if (responsibleSystems) {
    return "Unable to delete organization: remove system ownership references first.";
  }
  return null;
}

// ---- Contacts ------------------------------------------------------------------

export async function listContacts() {
  const rows = await db.query.contacts.findMany({
    with: { organization: true },
    orderBy: (c, { asc }) => [asc(c.lastName), asc(c.firstName)],
  });
  return rows;
}

export async function getContact(id: string | number) {
  const row = await db.query.contacts.findFirst({
    where: (c, { eq }) => eq(c.id, Number(id)),
    with: { organization: true },
  });
  if (!row) throw new NotFoundError();
  return row;
}

async function createContactFromBody(body: any) {
  const [row] = await db
    .insert(contacts)
    .values({
      firstName: String(body.first_name || "").trim(),
      lastName: String(body.last_name || "").trim(),
      title: String(body.title || "").trim(),
      email: String(body.email || "").trim(),
      phone: String(body.phone || "").trim(),
      organizationId: requiredInt(body.organization_id, "Organization"),
    })
    .returning({ id: contacts.id });
  return row.id;
}

export async function createContact(body: any, _req: Request): Promise<number> {
  return createContactFromBody(body);
}

export async function updateContact(id: string | number, body: any, _req: Request) {
  await db
    .update(contacts)
    .set({
      firstName: String(body.first_name || "").trim(),
      lastName: String(body.last_name || "").trim(),
      title: String(body.title || "").trim(),
      email: String(body.email || "").trim(),
      phone: String(body.phone || "").trim(),
      organizationId: requiredInt(body.organization_id, "Organization"),
    })
    .where(eq(contacts.id, Number(id)));
}

export async function deleteContact(id: string | number) {
  const contactId = Number(id);
  await db.transaction(async (tx) => {
    await tx.delete(siteContacts).where(eq(siteContacts.contactId, contactId));
    await tx.delete(systemContacts).where(eq(systemContacts.contactId, contactId));
    await tx.delete(contacts).where(eq(contacts.id, contactId));
  });
}

class NotFoundError extends Error {
  constructor() {
    super("Not found");
    this.name = "NotFoundError";
  }
}

export { NotFoundError };
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "./db.js";
import { HttpError } from "./helpers.js";
import {
  contacts,
  organizations,
  siteContacts,
  sites,
  systemContacts,
  systems,
} from "./models.js";

// ---------------------------------------------------------------------------
// View models (template-facing shapes mirroring the Flask template context)
// ---------------------------------------------------------------------------

export interface ContactOption {
  id: number;
  full_name: string;
  org_name: string;
}

export interface SiteOption {
  id: number;
  site_name: string;
  building_code: string;
}

export interface OrganizationView {
  id: number;
  name: string;
  org_type: string;
  description: string | null;
}

export interface ContactView {
  id: number;
  first_name: string;
  last_name: string;
  full_name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  organization_id: number;
  org_name: string;
}

export interface SiteView {
  id: number;
  site_name: string;
  address_line1: string;
  address_line2: string | null;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  building_code: string;
  ownership: string;
  status: string;
  description: string | null;
  longitude: string | null;
  latitude: string | null;
  room_number: string | null;
  owner_organization_id: number;
  owner_org: string;
  contact_ids: number[];
  contacts_text: string | null;
}

export interface SystemView {
  id: number;
  name: string;
  system_type: string;
  description: string | null;
  installation_date: string | null;
  warranty_expiry_date: string | null;
  installer_organization_id: number | null;
  equipment_condition: string | null;
  status: string;
  site_id: number;
  responsible_organization_id: number | null;
  last_updated: string | null;
  site_name: string;
  building_code: string;
  responsible_org: string | null;
  installer_org: string | null;
  contact_ids: number[];
  contacts_text: string | null;
  /** Pre-escaped contact names joined with ",<br>" (rendered raw). */
  contacts_html: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fullName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`;
}

function contactLabels(contactOptions: ContactOption[]): string[] {
  return contactOptions.map((contact) => contact.full_name);
}

const responsibleOrg = alias(organizations, "responsible_org");
const installerOrg = alias(organizations, "installer_org");

async function contactsBySystem(systemIds: number[]): Promise<Map<number, ContactOption[]>> {
  const grouped = new Map<number, ContactOption[]>();
  if (systemIds.length === 0) return grouped;

  const rows = await db
    .select({
      systemId: systemContacts.systemId,
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      orgName: organizations.name,
    })
    .from(systemContacts)
    .innerJoin(contacts, eq(systemContacts.contactId, contacts.id))
    .innerJoin(organizations, eq(contacts.organizationId, organizations.id))
    .where(inArray(systemContacts.systemId, systemIds))
    .orderBy(asc(systemContacts.systemId), asc(contacts.id));

  for (const row of rows) {
    const list = grouped.get(row.systemId) ?? [];
    list.push({ id: row.id, full_name: fullName(row.firstName, row.lastName), org_name: row.orgName });
    grouped.set(row.systemId, list);
  }
  return grouped;
}

async function contactsBySite(siteIds: number[]): Promise<Map<number, number[]>> {
  const grouped = new Map<number, number[]>();
  if (siteIds.length === 0) return grouped;

  const rows = await db
    .select({ siteId: siteContacts.siteId, contactId: siteContacts.contactId })
    .from(siteContacts)
    .where(inArray(siteContacts.siteId, siteIds))
    .orderBy(asc(siteContacts.siteId), asc(siteContacts.contactId));

  for (const row of rows) {
    const list = grouped.get(row.siteId) ?? [];
    list.push(row.contactId);
    grouped.set(row.siteId, list);
  }
  return grouped;
}

interface SystemRow {
  system: typeof systems.$inferSelect;
  siteName: string | null;
  buildingCode: string | null;
  responsibleOrgName: string | null;
  installerOrgName: string | null;
}

function systemView(row: SystemRow, contactOptions: ContactOption[]): SystemView {
  const labels = contactLabels(contactOptions);
  return {
    id: row.system.id,
    name: row.system.name,
    system_type: row.system.systemType,
    description: row.system.description,
    installation_date: row.system.installationDate,
    warranty_expiry_date: row.system.warrantyExpiryDate,
    installer_organization_id: row.system.installerOrganizationId,
    equipment_condition: row.system.equipmentCondition,
    status: row.system.status,
    site_id: row.system.siteId,
    responsible_organization_id: row.system.responsibleOrganizationId,
    last_updated: (row.system.lastUpdated as unknown as string) ?? null,
    site_name: row.siteName ?? "",
    building_code: row.buildingCode ?? "",
    responsible_org: row.responsibleOrgName,
    installer_org: row.installerOrgName,
    contact_ids: contactOptions.map((contact) => contact.id),
    contacts_text: labels.length > 0 ? labels.join(", ") : null,
    contacts_html: labels.length > 0 ? labels.join(",<br>") : null,
  };
}

function systemQuery() {
  return db
    .select({
      system: systems,
      siteName: sites.siteName,
      buildingCode: sites.buildingCode,
      responsibleOrgName: responsibleOrg.name,
      installerOrgName: installerOrg.name,
    })
    .from(systems)
    .innerJoin(sites, eq(systems.siteId, sites.id))
    .leftJoin(responsibleOrg, eq(systems.responsibleOrganizationId, responsibleOrg.id))
    .leftJoin(installerOrg, eq(systems.installerOrganizationId, installerOrg.id));
}

// ---------------------------------------------------------------------------
// Systems
// ---------------------------------------------------------------------------

export async function listSystems(): Promise<SystemView[]> {
  const rows = (await systemQuery().orderBy(desc(systems.lastUpdated))) as SystemRow[];
  const grouped = await contactsBySystem(rows.map((row) => row.system.id));
  return rows.map((row) => systemView(row, grouped.get(row.system.id) ?? []));
}

export async function getSystemOr404(systemId: number): Promise<SystemView> {
  const rows = (await systemQuery().where(eq(systems.id, systemId)).limit(1)) as SystemRow[];
  if (rows.length === 0) throw new HttpError(404);
  const grouped = await contactsBySystem([systemId]);
  return systemView(rows[0], grouped.get(systemId) ?? []);
}

export interface SystemInput {
  name: string;
  systemType: string;
  description: string | null;
  installationDate: string;
  warrantyExpiryDate: string | null;
  installerOrganizationId: number | null;
  equipmentCondition: string | null;
  status: string;
  siteId: number;
  responsibleOrganizationId: number | null;
}

export async function createSystem(input: SystemInput, contactIds: number[]): Promise<number> {
  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(systems)
      .values({
        name: input.name,
        systemType: input.systemType,
        description: input.description,
        installationDate: input.installationDate,
        warrantyExpiryDate: input.warrantyExpiryDate,
        installerOrganizationId: input.installerOrganizationId,
        equipmentCondition: input.equipmentCondition,
        status: input.status as typeof systems.$inferInsert.status,
        siteId: input.siteId,
        responsibleOrganizationId: input.responsibleOrganizationId,
      })
      .returning({ id: systems.id });

    const uniqueIds = [...new Set(contactIds)];
    if (uniqueIds.length > 0) {
      await tx
        .insert(systemContacts)
        .values(uniqueIds.map((contactId) => ({ systemId: created.id, contactId })));
    }
    return created.id;
  });
}

export async function updateSystem(
  systemId: number,
  input: SystemInput,
  contactIds: number[],
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(systems)
      .set({
        name: input.name,
        systemType: input.systemType,
        description: input.description,
        installationDate: input.installationDate,
        warrantyExpiryDate: input.warrantyExpiryDate,
        installerOrganizationId: input.installerOrganizationId,
        equipmentCondition: input.equipmentCondition,
        status: input.status as typeof systems.$inferInsert.status,
        siteId: input.siteId,
        responsibleOrganizationId: input.responsibleOrganizationId,
        lastUpdated: sql`now()`,
      })
      .where(eq(systems.id, systemId));

    await tx.delete(systemContacts).where(eq(systemContacts.systemId, systemId));
    const uniqueIds = [...new Set(contactIds)];
    if (uniqueIds.length > 0) {
      await tx
        .insert(systemContacts)
        .values(uniqueIds.map((contactId) => ({ systemId, contactId })));
    }
  });
}

export async function deleteSystem(systemId: number): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(systemContacts).where(eq(systemContacts.systemId, systemId));
    await tx.delete(systems).where(eq(systems.id, systemId));
  });
}

// ---------------------------------------------------------------------------
// Sites
// ---------------------------------------------------------------------------

interface SiteRow {
  site: typeof sites.$inferSelect;
  ownerOrgName: string | null;
}

function siteView(row: SiteRow, contactIds: number[], contactOptions: ContactOption[]): SiteView {
  const labels = contactLabels(contactOptions);
  return {
    id: row.site.id,
    site_name: row.site.siteName,
    address_line1: row.site.addressLine1,
    address_line2: row.site.addressLine2,
    city: row.site.city,
    state: row.site.state,
    postal_code: row.site.postalCode,
    country: row.site.country,
    building_code: row.site.buildingCode,
    ownership: row.site.ownership,
    status: row.site.status,
    description: row.site.description,
    longitude: row.site.longitude,
    latitude: row.site.latitude,
    room_number: row.site.roomNumber,
    owner_organization_id: row.site.ownerOrganizationId,
    owner_org: row.ownerOrgName ?? "",
    contact_ids: contactIds,
    contacts_text: labels.length > 0 ? labels.join(", ") : null,
  };
}

async function siteContactOptions(
  tx: Pick<typeof db, "select">,
  siteIds: number[],
): Promise<Map<number, ContactOption[]>> {
  const grouped = new Map<number, ContactOption[]>();
  if (siteIds.length === 0) return grouped;

  const rows = await tx
    .select({
      siteId: siteContacts.siteId,
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      orgName: organizations.name,
    })
    .from(siteContacts)
    .innerJoin(contacts, eq(siteContacts.contactId, contacts.id))
    .innerJoin(organizations, eq(contacts.organizationId, organizations.id))
    .where(inArray(siteContacts.siteId, siteIds))
    .orderBy(asc(siteContacts.siteId), asc(contacts.id));

  for (const row of rows) {
    const list = grouped.get(row.siteId) ?? [];
    list.push({ id: row.id, full_name: fullName(row.firstName, row.lastName), org_name: row.orgName });
    grouped.set(row.siteId, list);
  }
  return grouped;
}

export async function listSites(): Promise<SiteView[]> {
  const rows = (await db
    .select({ site: sites, ownerOrgName: organizations.name })
    .from(sites)
    .innerJoin(organizations, eq(sites.ownerOrganizationId, organizations.id))
    .orderBy(asc(sites.siteName))) as SiteRow[];
  return siteViews(rows);
}

async function siteViews(rows: SiteRow[]): Promise<SiteView[]> {
  const ids = rows.map((row) => row.site.id);
  const [contactIds, contactOptions] = await Promise.all([
    contactsBySite(ids),
    siteContactOptions(db, ids),
  ]);
  return rows.map((row) =>
    siteView(row, contactIds.get(row.site.id) ?? [], contactOptions.get(row.site.id) ?? []),
  );
}

export async function getSiteOr404(siteId: number): Promise<SiteView> {
  const rows = (await db
    .select({ site: sites, ownerOrgName: organizations.name })
    .from(sites)
    .innerJoin(organizations, eq(sites.ownerOrganizationId, organizations.id))
    .where(eq(sites.id, siteId))
    .limit(1)) as SiteRow[];
  if (rows.length === 0) throw new HttpError(404);
  return (await siteViews(rows))[0];
}

export interface SiteInput {
  siteName: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  buildingCode: string;
  ownership: string;
  status: string;
  description: string | null;
  longitude: string | null;
  latitude: string | null;
  roomNumber: string | null;
  ownerOrganizationId: number;
}

export async function createSite(input: SiteInput, contactIds: number[]): Promise<number> {
  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(sites)
      .values({
        siteName: input.siteName,
        addressLine1: input.addressLine1,
        addressLine2: input.addressLine2,
        city: input.city,
        state: input.state,
        postalCode: input.postalCode,
        country: input.country,
        buildingCode: input.buildingCode,
        ownership: input.ownership as typeof sites.$inferInsert.ownership,
        status: input.status as typeof sites.$inferInsert.status,
        description: input.description,
        longitude: input.longitude,
        latitude: input.latitude,
        roomNumber: input.roomNumber,
        ownerOrganizationId: input.ownerOrganizationId,
      })
      .returning({ id: sites.id });

    const uniqueIds = [...new Set(contactIds)];
    if (uniqueIds.length > 0) {
      await tx
        .insert(siteContacts)
        .values(uniqueIds.map((contactId) => ({ siteId: created.id, contactId })));
    }
    return created.id;
  });
}

export async function updateSite(
  siteId: number,
  input: SiteInput,
  contactIds: number[],
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(sites)
      .set({
        siteName: input.siteName,
        addressLine1: input.addressLine1,
        addressLine2: input.addressLine2,
        city: input.city,
        state: input.state,
        postalCode: input.postalCode,
        country: input.country,
        buildingCode: input.buildingCode,
        ownership: input.ownership as typeof sites.$inferInsert.ownership,
        status: input.status as typeof sites.$inferInsert.status,
        description: input.description,
        longitude: input.longitude,
        latitude: input.latitude,
        roomNumber: input.roomNumber,
        ownerOrganizationId: input.ownerOrganizationId,
      })
      .where(eq(sites.id, siteId));

    await tx.delete(siteContacts).where(eq(siteContacts.siteId, siteId));
    const uniqueIds = [...new Set(contactIds)];
    if (uniqueIds.length > 0) {
      await tx.insert(siteContacts).values(uniqueIds.map((contactId) => ({ siteId, contactId })));
    }
  });
}

export async function siteHasSystems(siteId: number): Promise<boolean> {
  const rows = await db
    .select({ id: systems.id })
    .from(systems)
    .where(eq(systems.siteId, siteId))
    .limit(1);
  return rows.length > 0;
}

export async function deleteSite(siteId: number): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(siteContacts).where(eq(siteContacts.siteId, siteId));
    await tx.delete(sites).where(eq(sites.id, siteId));
  });
}

// ---------------------------------------------------------------------------
// Organizations
// ---------------------------------------------------------------------------

export async function listOrganizations(): Promise<OrganizationView[]> {
  const rows = await db
    .select()
    .from(organizations)
    .orderBy(asc(organizations.name));
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    org_type: row.orgType,
    description: row.description,
  }));
}

export async function getOrganizationOr404(organizationId: number): Promise<OrganizationView> {
  const rows = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  if (rows.length === 0) throw new HttpError(404);
  const row = rows[0];
  return { id: row.id, name: row.name, org_type: row.orgType, description: row.description };
}

export interface OrganizationInput {
  name: string;
  orgType: string;
  description: string | null;
}

export async function createOrganization(input: OrganizationInput): Promise<number> {
  const [created] = await db
    .insert(organizations)
    .values({
      name: input.name,
      orgType: input.orgType as typeof organizations.$inferInsert.orgType,
      description: input.description,
    })
    .returning({ id: organizations.id });
  return created.id;
}

export async function updateOrganization(
  organizationId: number,
  input: OrganizationInput,
): Promise<void> {
  await db
    .update(organizations)
    .set({
      name: input.name,
      orgType: input.orgType as typeof organizations.$inferInsert.orgType,
      description: input.description,
    })
    .where(eq(organizations.id, organizationId));
}

export async function organizationOwnsSites(organizationId: number): Promise<boolean> {
  const rows = await db
    .select({ id: sites.id })
    .from(sites)
    .where(eq(sites.ownerOrganizationId, organizationId))
    .limit(1);
  return rows.length > 0;
}

export async function organizationHasResponsibleSystems(
  organizationId: number,
): Promise<boolean> {
  const rows = await db
    .select({ id: systems.id })
    .from(systems)
    .where(eq(systems.responsibleOrganizationId, organizationId))
    .limit(1);
  return rows.length > 0;
}

export async function deleteOrganization(organizationId: number): Promise<void> {
  // Mirrors the ORM cascades in `src/models.py`: deleting an organization
  // deletes its contacts (and their site/system junction rows).
  await db.transaction(async (tx) => {
    const contactRows = await tx
      .select({ id: contacts.id })
      .from(contacts)
      .where(eq(contacts.organizationId, organizationId));
    const contactIds = contactRows.map((row) => row.id);

    if (contactIds.length > 0) {
      await tx.delete(siteContacts).where(inArray(siteContacts.contactId, contactIds));
      await tx.delete(systemContacts).where(inArray(systemContacts.contactId, contactIds));
      await tx.delete(contacts).where(eq(contacts.organizationId, organizationId));
    }

    await tx.delete(organizations).where(eq(organizations.id, organizationId));
  });
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

function contactView(row: {
  contact: typeof contacts.$inferSelect;
  orgName: string | null;
}): ContactView {
  return {
    id: row.contact.id,
    first_name: row.contact.firstName,
    last_name: row.contact.lastName,
    full_name: fullName(row.contact.firstName, row.contact.lastName),
    title: row.contact.title,
    email: row.contact.email,
    phone: row.contact.phone,
    organization_id: row.contact.organizationId,
    org_name: row.orgName ?? "",
  };
}

export async function listContacts(): Promise<ContactView[]> {
  const rows = await db
    .select({ contact: contacts, orgName: organizations.name })
    .from(contacts)
    .innerJoin(organizations, eq(contacts.organizationId, organizations.id))
    .orderBy(asc(contacts.lastName));
  return rows.map(contactView);
}

export async function getContactOr404(contactId: number): Promise<ContactView> {
  const rows = await db
    .select({ contact: contacts, orgName: organizations.name })
    .from(contacts)
    .innerJoin(organizations, eq(contacts.organizationId, organizations.id))
    .where(eq(contacts.id, contactId))
    .limit(1);
  if (rows.length === 0) throw new HttpError(404);
  return contactView(rows[0]);
}

export interface ContactInput {
  firstName: string;
  lastName: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  organizationId: number;
}

export async function createContact(input: ContactInput): Promise<number> {
  const [created] = await db
    .insert(contacts)
    .values({
      firstName: input.firstName,
      lastName: input.lastName,
      title: input.title,
      email: input.email,
      phone: input.phone,
      organizationId: input.organizationId,
    })
    .returning({ id: contacts.id });
  return created.id;
}

export async function updateContact(contactId: number, input: ContactInput): Promise<void> {
  await db
    .update(contacts)
    .set({
      firstName: input.firstName,
      lastName: input.lastName,
      title: input.title,
      email: input.email,
      phone: input.phone,
      organizationId: input.organizationId,
    })
    .where(eq(contacts.id, contactId));
}

export async function deleteContact(contactId: number): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(siteContacts).where(eq(siteContacts.contactId, contactId));
    await tx.delete(systemContacts).where(eq(systemContacts.contactId, contactId));
    await tx.delete(contacts).where(eq(contacts.id, contactId));
  });
}

// ---------------------------------------------------------------------------
// Form option lists
// ---------------------------------------------------------------------------

export async function siteOptions(): Promise<SiteOption[]> {
  const rows = await db
    .select({ id: sites.id, siteName: sites.siteName, buildingCode: sites.buildingCode })
    .from(sites)
    .orderBy(asc(sites.siteName));
  return rows.map((row) => ({
    id: row.id,
    site_name: row.siteName,
    building_code: row.buildingCode,
  }));
}

export async function organizationOptions(): Promise<Array<{ id: number; name: string }>> {
  const rows = await db
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .orderBy(asc(organizations.name));
  return rows;
}

export async function contactOptions(): Promise<ContactOption[]> {
  const rows = await db
    .select({
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      orgName: organizations.name,
    })
    .from(contacts)
    .innerJoin(organizations, eq(contacts.organizationId, organizations.id))
    .orderBy(asc(contacts.lastName), asc(contacts.firstName));
  return rows.map((row) => ({
    id: row.id,
    full_name: fullName(row.firstName, row.lastName),
    org_name: row.orgName,
  }));
}

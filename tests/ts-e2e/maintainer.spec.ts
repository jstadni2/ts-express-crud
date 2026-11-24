import { test, expect, type Page } from "@playwright/test";

import { E2E_BASE_URL } from "./base_url";
import {
  acceptNextDialog,
  clickSort,
  createContact,
  createOrganization,
  createSite,
  createSystem,
  expectFlashContains,
  expectRequiredMessage,
  filterTable,
  gotoPath,
  openEditForRow,
  rowByText,
  setActiveRole,
  table,
  uniqueName,
  visibleColumnValues,
  visibleRows,
} from "./ui_helpers";

test.beforeEach(async ({ page }) => {
  await setActiveRole(page, E2E_BASE_URL, "Maintainer");
});

async function openSystemDetailForRow(page: Page, baseUrl: string, rowText: string): Promise<void> {
  const row = rowByText(page, "systems-table", rowText);
  await expect(row).toBeVisible();
  const editHref = await row.getByRole("link", { name: "Edit" }).getAttribute("href");
  expect(editHref).not.toBeNull();
  expect(editHref!.endsWith("/edit")).toBe(true);
  await gotoPath(page, baseUrl, editHref!.replace("/edit", "/detail"));
}

test("contact CRUD and messages", async ({ page }) => {
  const baseUrl = E2E_BASE_URL;
  const orgName = uniqueName("OrgForContact");
  await createOrganization(page, baseUrl, orgName);

  await gotoPath(page, baseUrl, "/contacts/new");
  await page.getByRole("button", { name: "Save" }).click();
  await expectRequiredMessage(page, "#first_name");

  await gotoPath(page, baseUrl, "/contacts/new");
  await page.fill("#first_name", "Pat");
  await page.getByRole("button", { name: "Save" }).click();
  await expectRequiredMessage(page, "#last_name");
  await expect(page.locator("#organization_id")).toHaveAttribute("required", "");

  const firstName = uniqueName("Pat");
  const lastName = "Maintainer";
  const email = `${firstName.toLowerCase()}@example.edu`;
  await createContact(page, baseUrl, firstName, lastName, orgName, email);

  await openEditForRow(page, "contacts-table", firstName);
  await page.fill("#title", "Updated Title");
  await page.getByRole("button", { name: "Save" }).click();
  await expectFlashContains(page, "Contact updated.");

  await openEditForRow(page, "contacts-table", firstName);
  await page.fill("#first_name", "");
  await page.getByRole("button", { name: "Save" }).click();
  await expectRequiredMessage(page, "#first_name");

  await page.fill("#first_name", firstName);
  acceptNextDialog(page);
  await page.getByRole("button", { name: "Delete Contact" }).click();
  await expectFlashContains(page, "Contact deleted.");
  await expect(table(page, "contacts-table")).not.toContainText(firstName);
});

test("organization CRUD and delete constraints", async ({ page }) => {
  const baseUrl = E2E_BASE_URL;
  const parentOrg = uniqueName("OrgParent");
  const secondOrg = uniqueName("OrgSecond");
  const thirdOrg = uniqueName("OrgThird");
  await createOrganization(page, baseUrl, parentOrg);
  await createOrganization(page, baseUrl, secondOrg, "External");
  await createOrganization(page, baseUrl, thirdOrg);

  await gotoPath(page, baseUrl, "/organizations/new");
  await page.getByRole("button", { name: "Save" }).click();
  await expectRequiredMessage(page, "#name");

  await gotoPath(page, baseUrl, "/organizations");
  await openEditForRow(page, "organizations-table", secondOrg);
  await page.fill("#description", "Updated org description");
  await page.getByRole("button", { name: "Save" }).click();
  await expectFlashContains(page, "Organization updated.");

  const siteName = uniqueName("OrgBlockSite");
  const buildingCode = uniqueName("BC").slice(0, 8);
  await createSite(page, baseUrl, siteName, buildingCode, parentOrg);

  await gotoPath(page, baseUrl, "/organizations");
  await openEditForRow(page, "organizations-table", parentOrg);
  acceptNextDialog(page);
  await page.getByRole("button", { name: "Delete Organization" }).click();
  await expectFlashContains(page, "Unable to delete organization: reassign or delete owned sites first.");

  await gotoPath(page, baseUrl, "/sites");
  await openEditForRow(page, "sites-table", siteName);
  acceptNextDialog(page);
  await page.getByRole("button", { name: "Delete Site" }).click();
  await expectFlashContains(page, "Site deleted.");

  const siteName2 = uniqueName("OrgSystemSite");
  const buildingCode2 = uniqueName("BS").slice(0, 8);
  await createSite(page, baseUrl, siteName2, buildingCode2, thirdOrg);
  await createSystem(page, baseUrl, {
    name: uniqueName("OrgRespSystem"),
    siteName: siteName2,
    siteBuildingCode: buildingCode2,
    responsibleOrg: secondOrg,
    installationDate: "2026-01-01",
    status: "Installed",
  });

  await gotoPath(page, baseUrl, "/organizations");
  await openEditForRow(page, "organizations-table", secondOrg);
  acceptNextDialog(page);
  await page.getByRole("button", { name: "Delete Organization" }).click();
  await expectFlashContains(page, "Unable to delete organization: remove system ownership references first.");

  const freeOrg = uniqueName("OrgDeleteOk");
  await createOrganization(page, baseUrl, freeOrg);
  await openEditForRow(page, "organizations-table", freeOrg);
  acceptNextDialog(page);
  await page.getByRole("button", { name: "Delete Organization" }).click();
  await expectFlashContains(page, "Organization deleted.");
  await expect(table(page, "organizations-table")).not.toContainText(freeOrg);
});

test("site CRUD and delete constraint message", async ({ page }) => {
  const baseUrl = E2E_BASE_URL;
  const ownerOrg = uniqueName("SiteOwner");
  await createOrganization(page, baseUrl, ownerOrg);

  await gotoPath(page, baseUrl, "/sites/new");
  await page.getByRole("button", { name: "Save" }).click();
  await expectRequiredMessage(page, "#site_name");
  await expect(page.locator("#building_code")).toHaveAttribute("required", "");
  await expect(page.locator("#owner_organization_id")).toHaveAttribute("required", "");

  const siteName = uniqueName("SiteA");
  const buildingCode = uniqueName("SA").slice(0, 8);
  await createSite(page, baseUrl, siteName, buildingCode, ownerOrg);

  await openEditForRow(page, "sites-table", siteName);
  await page.fill("#room_number", "202");
  await page.getByRole("button", { name: "Save" }).click();
  await expectFlashContains(page, "Site updated.");

  const systemName = uniqueName("SiteLinkedSystem");
  await createSystem(page, baseUrl, {
    name: systemName,
    siteName,
    siteBuildingCode: buildingCode,
    installationDate: "2026-01-01",
    status: "Installed",
  });

  await gotoPath(page, baseUrl, "/sites");
  await openEditForRow(page, "sites-table", siteName);
  acceptNextDialog(page);
  await page.getByRole("button", { name: "Delete Site" }).click();
  await expectFlashContains(page, "Unable to delete site: remove or reassign linked systems first.");

  await gotoPath(page, baseUrl, "/systems");
  await openEditForRow(page, "systems-table", systemName);
  acceptNextDialog(page);
  await page.getByRole("button", { name: "Delete System" }).click();
  await expectFlashContains(page, "System deleted.");

  await gotoPath(page, baseUrl, "/sites");
  await openEditForRow(page, "sites-table", siteName);
  acceptNextDialog(page);
  await page.getByRole("button", { name: "Delete Site" }).click();
  await expectFlashContains(page, "Site deleted.");
});

test("system CRUD validation and contact variants", async ({ page }) => {
  const baseUrl = E2E_BASE_URL;
  const orgName = uniqueName("SystemOrg");
  await createOrganization(page, baseUrl, orgName);
  const contactALast = uniqueName("Last");
  const contactBLast = uniqueName("Last");
  await createContact(page, baseUrl, "ContactA", contactALast, orgName, "a@example.edu");
  await createContact(page, baseUrl, "ContactB", contactBLast, orgName, "b@example.edu");

  const siteName = uniqueName("SystemSite");
  const buildingCode = uniqueName("SB").slice(0, 8);
  await createSite(page, baseUrl, siteName, buildingCode, orgName);

  await gotoPath(page, baseUrl, "/systems/new");
  await page.getByRole("button", { name: "Save" }).click();
  await expectRequiredMessage(page, "#name");

  await gotoPath(page, baseUrl, "/systems/new");
  await page.fill("#name", uniqueName("NoInstallationDateSys"));
  await page.fill("#system_type", "Audio-Visual");
  await page.getByRole("button", { name: "Save" }).click();
  await expectRequiredMessage(page, "#installation_date");
  await expect(page.locator("#site_id")).toHaveAttribute("required", "");

  const noContactSystem = uniqueName("NoContactSystem");
  await createSystem(page, baseUrl, {
    name: noContactSystem,
    siteName,
    siteBuildingCode: buildingCode,
    responsibleOrg: orgName,
    contactLabels: undefined,
    installationDate: "2026-01-01",
    status: "Installed",
  });
  await expect(rowByText(page, "systems-table", noContactSystem)).toContainText("N/A");

  const contact1 = `ContactA ${contactALast} (${orgName})`;
  const contact2 = `ContactB ${contactBLast} (${orgName})`;
  const multiContactSystem = uniqueName("MultiContactSystem");
  await createSystem(page, baseUrl, {
    name: multiContactSystem,
    siteName,
    siteBuildingCode: buildingCode,
    responsibleOrg: orgName,
    contactLabels: [contact1, contact2],
    installationDate: "2026-01-01",
    status: "Installed",
  });

  const systemRow = rowByText(page, "systems-table", multiContactSystem);
  await expect(systemRow).toContainText("ContactA");
  await expect(systemRow).toContainText("ContactB");

  await openEditForRow(page, "systems-table", multiContactSystem);
  await page.fill("#description", "Updated description");
  await page.getByRole("button", { name: "Save" }).click();
  await expectFlashContains(page, "System updated.");

  await openEditForRow(page, "systems-table", multiContactSystem);
  await page.fill("#name", "");
  await page.getByRole("button", { name: "Save" }).click();
  await expectRequiredMessage(page, "#name");

  await page.fill("#name", multiContactSystem);
  acceptNextDialog(page);
  await page.getByRole("button", { name: "Delete System" }).click();
  await expectFlashContains(page, "System deleted.");
});

test("systems sort and filter including contacts N/A", async ({ page }) => {
  const baseUrl = E2E_BASE_URL;
  const orgName = uniqueName("SortSysOrg");
  await createOrganization(page, baseUrl, orgName);
  await createContact(page, baseUrl, "SysSort", uniqueName("One"), orgName, "syssort1@example.edu");

  const siteName = uniqueName("SortSysSite");
  const buildingCode = uniqueName("SS").slice(0, 8);
  await createSite(page, baseUrl, siteName, buildingCode, orgName);

  await createSystem(page, baseUrl, {
    name: "Sort-Alpha",
    siteName,
    siteBuildingCode: buildingCode,
    installationDate: "2026-01-01",
    status: "Installed",
  });
  await createSystem(page, baseUrl, {
    name: "Sort-Zulu",
    siteName,
    siteBuildingCode: buildingCode,
    installationDate: "2026-01-02",
    status: "Installed",
  });
  const responsibleOrgName = uniqueName("SortResponsibleOrg");
  await createOrganization(page, baseUrl, responsibleOrgName);
  const filterSystemName = uniqueName("FilterTargetSystem");
  await createSystem(page, baseUrl, {
    name: filterSystemName,
    siteName,
    siteBuildingCode: buildingCode,
    responsibleOrg: responsibleOrgName,
    installationDate: "2026-01-01",
    status: "Installed",
  });

  await gotoPath(page, baseUrl, "/systems");
  await clickSort(page, "systems-table", "name");
  let namesAsc = await visibleColumnValues(page, "systems-table", "name");
  expect(namesAsc).toEqual([...namesAsc].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })));

  await clickSort(page, "systems-table", "installation_date");
  const dateValues = await visibleColumnValues(page, "systems-table", "installation_date");
  const parsedDates = dateValues.filter((v) => v !== "N/A");
  expect(parsedDates).toEqual([...parsedDates].sort());

  await filterTable(page, "systems-table", "contacts", "N/A");
  let rows = await visibleRows(page, "systems-table");
  expect(rows.length).toBeGreaterThan(0);
  for (const row of rows) {
    await expect(row).toContainText("N/A");
  }

  await gotoPath(page, baseUrl, "/systems");
  await clickSort(page, "systems-table", "name", 3);
  await expect(table(page, "systems-table").getByTestId("column-name")).toHaveAttribute("aria-sort", "none");

  await gotoPath(page, baseUrl, "/systems");
  await filterTable(page, "systems-table", "site", siteName);
  rows = await visibleRows(page, "systems-table");
  expect(rows.length).toBeGreaterThan(0);
  for (const row of rows) {
    await expect(row).toContainText(siteName);
  }

  await gotoPath(page, baseUrl, "/systems");
  await filterTable(page, "systems-table", "type", "Audio-Visual");
  rows = await visibleRows(page, "systems-table");
  expect(rows.length).toBeGreaterThan(0);
  for (const row of rows) {
    await expect(row).toContainText("Audio-Visual");
  }

  await gotoPath(page, baseUrl, "/systems");
  await filterTable(page, "systems-table", "name", filterSystemName);
  rows = await visibleRows(page, "systems-table");
  expect(rows.length).toBeGreaterThan(0);
  for (const row of rows) {
    await expect(row).toContainText(filterSystemName);
  }

  await gotoPath(page, baseUrl, "/systems");
  await filterTable(page, "systems-table", "responsible_org", responsibleOrgName);
  rows = await visibleRows(page, "systems-table");
  expect(rows.length).toBeGreaterThan(0);
  for (const row of rows) {
    await expect(row).toContainText(responsibleOrgName);
  }
  await expect(rowByText(page, "systems-table", filterSystemName)).toBeVisible();
});

test("logout visible on authenticated pages", async ({ page }) => {
  const baseUrl = E2E_BASE_URL;
  await setActiveRole(page, baseUrl, "Maintainer");
  const orgName = uniqueName("LogoutOrg");
  const siteName = uniqueName("LogoutSite");
  const buildingCode = uniqueName("LG").slice(0, 8);
  const systemName = uniqueName("LogoutSystem");

  await createOrganization(page, baseUrl, orgName);
  await createSite(page, baseUrl, siteName, buildingCode, orgName);
  await createSystem(page, baseUrl, {
    name: systemName,
    siteName,
    siteBuildingCode: buildingCode,
    responsibleOrg: orgName,
    installationDate: "2026-01-01",
    status: "Installed",
  });

  for (const path of ["/", "/systems", "/sites", "/organizations", "/contacts"]) {
    await gotoPath(page, baseUrl, path);
    await expect(page.getByRole("link", { name: "Logout" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Login" })).toHaveCount(0);
  }

  await gotoPath(page, baseUrl, "/systems");
  await openSystemDetailForRow(page, baseUrl, systemName);
  await expect(page.getByRole("link", { name: "Logout" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Login" })).toHaveCount(0);
});

test("system detail displays owner contact and location", async ({ page }) => {
  const baseUrl = E2E_BASE_URL;
  const ownerOrg = uniqueName("DetailOwnerOrg");
  const responsibleOrg = uniqueName("DetailResponsibleOrg");
  await createOrganization(page, baseUrl, ownerOrg);
  await createOrganization(page, baseUrl, responsibleOrg);

  const firstName = "Detail";
  const lastName = uniqueName("Contact");
  await createContact(page, baseUrl, firstName, lastName, ownerOrg, "detail-contact@example.edu");

  const siteName = uniqueName("DetailSite");
  const buildingCode = uniqueName("DL").slice(0, 8);
  await createSite(page, baseUrl, siteName, buildingCode, ownerOrg);

  const systemName = uniqueName("DetailSystem");
  const contactLabel = `${firstName} ${lastName} (${ownerOrg})`;
  await createSystem(page, baseUrl, {
    name: systemName,
    siteName,
    siteBuildingCode: buildingCode,
    responsibleOrg,
    installationDate: "2026-01-01",
    warrantyExpiryDate: "2029-01-01",
    installerOrg: ownerOrg,
    equipmentCondition: "Good",
    status: "Installed",
    contactLabels: [contactLabel],
  });

  await gotoPath(page, baseUrl, "/systems");
  await openSystemDetailForRow(page, baseUrl, systemName);

  await expect(page.getByRole("heading", { name: "System Detail" })).toBeVisible();
  const dl = (label: string) =>
    page.locator("dt", { hasText: label }).locator("xpath=following-sibling::dd[1]");
  await expect(dl("Installation Date")).toContainText("2026-01-01");
  await expect(dl("Warranty Expiry Date")).toContainText("2029-01-01");
  await expect(dl("Installer Organization")).toContainText(ownerOrg);
  await expect(dl("Equipment Condition")).toContainText("Good");
  await expect(dl("Status")).toContainText("Installed");
  await expect(dl("Responsible Organization")).toContainText(responsibleOrg);
  const siteCell = dl("Site");
  await expect(siteCell).toContainText(siteName);
  await expect(siteCell).toContainText(buildingCode);
  const contactsCell = dl("System Contacts");
  await expect(contactsCell).toContainText(firstName);
  await expect(contactsCell).toContainText(lastName);
});

test("sites sort and filter", async ({ page }) => {
  const baseUrl = E2E_BASE_URL;
  const orgName = uniqueName("SortSiteOrg");
  const siteAlpha = uniqueName("SiteAlpha");
  const siteZulu = uniqueName("SiteZulu");
  const buildingAlpha = uniqueName("A100").slice(0, 8);
  const buildingZulu = uniqueName("Z900").slice(0, 8);
  await createOrganization(page, baseUrl, orgName);
  await createSite(page, baseUrl, siteAlpha, buildingAlpha, orgName);
  await createSite(page, baseUrl, siteZulu, buildingZulu, orgName);

  await gotoPath(page, baseUrl, "/sites");
  await clickSort(page, "sites-table", "site_name");
  let siteNames = await visibleColumnValues(page, "sites-table", "site-name");
  expect(siteNames).toEqual([...siteNames].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })));

  await filterTable(page, "sites-table", "building_code", buildingAlpha);
  let rows = await visibleRows(page, "sites-table");
  expect(rows.length).toBeGreaterThan(0);
  for (const row of rows) {
    await expect(row).toContainText(buildingAlpha);
  }
  await expect(rows[0]).toContainText(siteAlpha);

  await gotoPath(page, baseUrl, "/sites");
  await clickSort(page, "sites-table", "site_name", 2);
  let namesDesc = await visibleColumnValues(page, "sites-table", "site-name");
  expect(namesDesc).toEqual([...namesDesc].sort((a, b) => b.localeCompare(a, undefined, { sensitivity: "base" })));

  await clickSort(page, "sites-table", "site_name");
  await expect(table(page, "sites-table").getByTestId("column-site_name")).toHaveAttribute("aria-sort", "none");

  await gotoPath(page, baseUrl, "/sites");
  await filterTable(page, "sites-table", "site_name", siteAlpha);
  rows = await visibleRows(page, "sites-table");
  expect(rows.length).toBeGreaterThan(0);
  for (const row of rows) {
    await expect(row).toContainText(siteAlpha);
  }

  await gotoPath(page, baseUrl, "/sites");
  await filterTable(page, "sites-table", "owner_org", orgName);
  rows = await visibleRows(page, "sites-table");
  expect(rows.length).toBeGreaterThan(0);
  for (const row of rows) {
    await expect(row).toContainText(orgName);
  }
});

test("organizations sort and filter", async ({ page }) => {
  const baseUrl = E2E_BASE_URL;
  const orgAlpha = uniqueName("OrgAlpha");
  const orgZulu = uniqueName("OrgZulu");
  await createOrganization(page, baseUrl, orgAlpha, "Internal");
  await createOrganization(page, baseUrl, orgZulu, "External");

  await gotoPath(page, baseUrl, "/organizations");
  await clickSort(page, "organizations-table", "name");
  let orgNames = await visibleColumnValues(page, "organizations-table", "name");
  expect(orgNames).toEqual([...orgNames].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })));

  await filterTable(page, "organizations-table", "type", "External");
  let rows = await visibleRows(page, "organizations-table");
  expect(rows.length).toBeGreaterThan(0);
  for (const row of rows) {
    await expect(row).toContainText("External");
  }

  await gotoPath(page, baseUrl, "/organizations");
  await clickSort(page, "organizations-table", "name", 2);
  let orgNamesDesc = await visibleColumnValues(page, "organizations-table", "name");
  expect(orgNamesDesc).toEqual([...orgNamesDesc].sort((a, b) => b.localeCompare(a, undefined, { sensitivity: "base" })));

  await clickSort(page, "organizations-table", "name");
  await expect(table(page, "organizations-table").getByTestId("column-name")).toHaveAttribute("aria-sort", "none");

  await gotoPath(page, baseUrl, "/organizations");
  await filterTable(page, "organizations-table", "name", orgAlpha);
  rows = await visibleRows(page, "organizations-table");
  expect(rows.length).toBeGreaterThan(0);
  for (const row of rows) {
    await expect(row).toContainText(orgAlpha);
  }

  await gotoPath(page, baseUrl, "/organizations");
  await filterTable(page, "organizations-table", "description", orgAlpha);
  rows = await visibleRows(page, "organizations-table");
  expect(rows.length).toBeGreaterThan(0);
  for (const row of rows) {
    await expect(row).toContainText(orgAlpha);
  }
});

test("systems multi-column filter", async ({ page }) => {
  const baseUrl = E2E_BASE_URL;
  const orgName = uniqueName("MultiFilterOrg");
  await createOrganization(page, baseUrl, orgName);
  const siteName = uniqueName("MultiFilterSite");
  const buildingCode = uniqueName("MF").slice(0, 8);
  await createSite(page, baseUrl, siteName, buildingCode, orgName);

  const mfPrefix = uniqueName("MF");
  await createSystem(page, baseUrl, { name: `${mfPrefix}-Active`, siteName, siteBuildingCode: buildingCode, installationDate: "2026-01-01", status: "Installed" });
  await createSystem(page, baseUrl, { name: `${mfPrefix}-Inactive`, siteName, siteBuildingCode: buildingCode, installationDate: "2026-01-01", status: "Retired" });
  await createSystem(page, baseUrl, { name: uniqueName("Other"), siteName, siteBuildingCode: buildingCode, installationDate: "2026-01-01", status: "Installed" });

  await gotoPath(page, baseUrl, "/systems");
  await filterTable(page, "systems-table", "name", mfPrefix);
  let multiRows = await visibleRows(page, "systems-table");
  expect(multiRows.length).toBe(2);
  for (const row of multiRows) {
    await expect(row).toContainText(mfPrefix);
  }

  await filterTable(page, "systems-table", "status", "Installed");
  const finalRows = await visibleRows(page, "systems-table");
  expect(finalRows.length).toBe(1);
  await expect(finalRows[0]).toContainText(`${mfPrefix}-Active`);
});

test("contacts sort and filter", async ({ page }) => {
  const baseUrl = E2E_BASE_URL;
  const orgName = uniqueName("SortContactOrg");
  const emailAlpha = `${uniqueName("alpha")}@example.edu`;
  const emailZulu = `${uniqueName("zulu")}@example.edu`;
  await createOrganization(page, baseUrl, orgName);
  await createContact(page, baseUrl, "Aaron", "Alpha", orgName, emailAlpha);
  await createContact(page, baseUrl, "Zoe", "Zulu", orgName, emailZulu);

  await gotoPath(page, baseUrl, "/contacts");
  await clickSort(page, "contacts-table", "name");
  let contactNames = await visibleColumnValues(page, "contacts-table", "name");
  expect(contactNames).toEqual([...contactNames].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })));

  await filterTable(page, "contacts-table", "email", emailZulu);
  let rows = await visibleRows(page, "contacts-table");
  expect(rows.length).toBeGreaterThan(0);
  for (const row of rows) {
    await expect(row).toContainText(emailZulu);
  }
});

test("deletion reassign before parent delete", async ({ page }) => {
  const baseUrl = E2E_BASE_URL;
  const orgA = uniqueName("ReassignOrgA");
  await createOrganization(page, baseUrl, orgA);
  const siteA = uniqueName("ReassignSiteA");
  const bcA = uniqueName("RA").slice(0, 8);
  const siteB = uniqueName("ReassignSiteB");
  const bcB = uniqueName("RB").slice(0, 8);
  await createSite(page, baseUrl, siteA, bcA, orgA);
  await createSite(page, baseUrl, siteB, bcB, orgA);
  const sysName = uniqueName("ReassignSystem");
  await createSystem(page, baseUrl, { name: sysName, siteName: siteA, siteBuildingCode: bcA, installationDate: "2026-01-01", status: "Installed" });

  await gotoPath(page, baseUrl, "/sites");
  await openEditForRow(page, "sites-table", siteA);
  acceptNextDialog(page);
  await page.getByRole("button", { name: "Delete Site" }).click();
  await expectFlashContains(page, "Unable to delete site: remove or reassign linked systems first.");

  await gotoPath(page, baseUrl, "/systems");
  await openEditForRow(page, "systems-table", sysName);
  await page.selectOption("#site_id", { label: `${siteB} (${bcB})` });
  await page.getByRole("button", { name: "Save" }).click();
  await expectFlashContains(page, "System updated.");

  await gotoPath(page, baseUrl, "/sites");
  await openEditForRow(page, "sites-table", siteA);
  acceptNextDialog(page);
  await page.getByRole("button", { name: "Delete Site" }).click();
  await expectFlashContains(page, "Site deleted.");

  const orgP = uniqueName("ReassignOrgP");
  const orgQ = uniqueName("ReassignOrgQ");
  await createOrganization(page, baseUrl, orgP);
  await createOrganization(page, baseUrl, orgQ);
  const siteP = uniqueName("ReassignSiteP");
  const bcP = uniqueName("RP").slice(0, 8);
  await createSite(page, baseUrl, siteP, bcP, orgP);

  await gotoPath(page, baseUrl, "/organizations");
  await openEditForRow(page, "organizations-table", orgP);
  acceptNextDialog(page);
  await page.getByRole("button", { name: "Delete Organization" }).click();
  await expectFlashContains(page, "Unable to delete organization: reassign or delete owned sites first.");

  await gotoPath(page, baseUrl, "/sites");
  await openEditForRow(page, "sites-table", siteP);
  await page.selectOption("#owner_organization_id", { label: orgQ });
  await page.getByRole("button", { name: "Save" }).click();
  await expectFlashContains(page, "Site updated.");

  await gotoPath(page, baseUrl, "/organizations");
  await openEditForRow(page, "organizations-table", orgP);
  acceptNextDialog(page);
  await page.getByRole("button", { name: "Delete Organization" }).click();
  await expectFlashContains(page, "Organization deleted.");
});

test("list view columns", async ({ page }) => {
  const baseUrl = E2E_BASE_URL;
  const expected: Record<string, string[]> = {
    "/systems": [
      "name", "type", "contacts", "installation_date", "warranty_expiry_date", "site",
      "responsible_org", "installer_org", "equipment_condition", "status", "last_updated", "action",
    ],
    "/sites": ["site_name", "building_code", "ownership", "status", "owner_org", "room_number", "action"],
    "/organizations": ["name", "type", "description", "action"],
    "/contacts": ["name", "title", "email", "phone", "organization", "action"],
  };

  for (const [path, colKeys] of Object.entries(expected)) {
    const tableId = path.slice(1) + "-table";
    await gotoPath(page, baseUrl, path);
    for (const colKey of colKeys) {
      await expect(table(page, tableId).getByTestId(`column-${colKey}`)).toBeVisible();
    }
  }
});
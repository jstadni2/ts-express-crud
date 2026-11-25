import { test, expect } from "@playwright/test";
import {
  acceptNextDialog,
  baseUrl,
  clickSort,
  createContact,
  createOrganization,
  createSite,
  createSystem,
  expectForbiddenGet,
  expectForbiddenPost,
  expectFlashContains,
  expectRequiredMessage,
  filterTable,
  gotoPath,
  openEditForRow,
  rowByText,
  setActiveRole,
  sortedLower,
  table,
  uniqueName,
  visibleColumnValues,
  visibleRows,
} from "./ui_helpers.js";

const base = baseUrl();

test.describe("maintainer ui", () => {
  test.beforeEach(async ({ page }) => {
    await setActiveRole(page, base, "Maintainer");
  });

  async function openSystemDetailForRow(
    page: import("@playwright/test").Page,
    rowText: string,
  ): Promise<void> {
    const row = rowByText(page, "systems-table", rowText);
    await expect(row).toBeVisible();
    const editHref = await row.getByRole("link", { name: "Edit" }).getAttribute("href");
    expect(editHref).not.toBeNull();
    expect(editHref!.endsWith("/edit")).toBe(true);
    await gotoPath(page, base, editHref!.replace("/edit", "/detail"));
  }

  test("contact crud and messages", async ({ page }) => {
    const orgName = uniqueName("OrgForContact");
    await createOrganization(page, base, orgName);

    await gotoPath(page, base, "/contacts/new");
    await page.getByRole("button", { name: "Save" }).click();
    await expectRequiredMessage(page, "#first_name");

    await gotoPath(page, base, "/contacts/new");
    await page.fill("#first_name", "Pat");
    await page.getByRole("button", { name: "Save" }).click();
    await expectRequiredMessage(page, "#last_name");
    await expect(page.locator("#organization_id")).toHaveAttribute("required", "");

    const firstName = uniqueName("Pat");
    const lastName = "Maintainer";
    const email = `${firstName.toLowerCase()}@example.edu`;
    await createContact(page, base, firstName, lastName, orgName, email);

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

  test("organization crud and delete constraints", async ({ page }) => {
    const parentOrg = uniqueName("OrgParent");
    const secondOrg = uniqueName("OrgSecond");
    const thirdOrg = uniqueName("OrgThird");
    await createOrganization(page, base, parentOrg);
    await createOrganization(page, base, secondOrg, "External");
    await createOrganization(page, base, thirdOrg);

    await gotoPath(page, base, "/organizations/new");
    await page.getByRole("button", { name: "Save" }).click();
    await expectRequiredMessage(page, "#name");

    await gotoPath(page, base, "/organizations");
    await openEditForRow(page, "organizations-table", secondOrg);
    await page.fill("#description", "Updated org description");
    await page.getByRole("button", { name: "Save" }).click();
    await expectFlashContains(page, "Organization updated.");

    const siteName = uniqueName("OrgBlockSite");
    const buildingCode = uniqueName("BC").slice(0, 8);
    await createSite(page, base, siteName, buildingCode, parentOrg);

    await gotoPath(page, base, "/organizations");
    await openEditForRow(page, "organizations-table", parentOrg);
    acceptNextDialog(page);
    await page.getByRole("button", { name: "Delete Organization" }).click();
    await expectFlashContains(
      page,
      "Unable to delete organization: reassign or delete owned sites first.",
    );

    await gotoPath(page, base, "/sites");
    await openEditForRow(page, "sites-table", siteName);
    acceptNextDialog(page);
    await page.getByRole("button", { name: "Delete Site" }).click();
    await expectFlashContains(page, "Site deleted.");

    const siteName2 = uniqueName("OrgSystemSite");
    const buildingCode2 = uniqueName("BS").slice(0, 8);
    await createSite(page, base, siteName2, buildingCode2, thirdOrg);
    await createSystem(page, base, {
      name: uniqueName("OrgRespSystem"),
      siteName: siteName2,
      siteBuildingCode: buildingCode2,
      responsibleOrg: secondOrg,
      installationDate: "2026-01-01",
      status: "Installed",
    });

    await gotoPath(page, base, "/organizations");
    await openEditForRow(page, "organizations-table", secondOrg);
    acceptNextDialog(page);
    await page.getByRole("button", { name: "Delete Organization" }).click();
    await expectFlashContains(
      page,
      "Unable to delete organization: remove system ownership references first.",
    );

    const freeOrg = uniqueName("OrgDeleteOk");
    await createOrganization(page, base, freeOrg);
    await openEditForRow(page, "organizations-table", freeOrg);
    acceptNextDialog(page);
    await page.getByRole("button", { name: "Delete Organization" }).click();
    await expectFlashContains(page, "Organization deleted.");
    await expect(table(page, "organizations-table")).not.toContainText(freeOrg);
  });

  test("site crud and delete constraint message", async ({ page }) => {
    const ownerOrg = uniqueName("SiteOwner");
    await createOrganization(page, base, ownerOrg);

    await gotoPath(page, base, "/sites/new");
    await page.getByRole("button", { name: "Save" }).click();
    await expectRequiredMessage(page, "#site_name");
    await expect(page.locator("#building_code")).toHaveAttribute("required", "");
    await expect(page.locator("#owner_organization_id")).toHaveAttribute("required", "");

    const siteName = uniqueName("SiteA");
    const buildingCode = uniqueName("SA").slice(0, 8);
    await createSite(page, base, siteName, buildingCode, ownerOrg);

    await openEditForRow(page, "sites-table", siteName);
    await page.fill("#room_number", "202");
    await page.getByRole("button", { name: "Save" }).click();
    await expectFlashContains(page, "Site updated.");

    const systemName = uniqueName("SiteLinkedSystem");
    await createSystem(page, base, {
      name: systemName,
      siteName,
      siteBuildingCode: buildingCode,
      installationDate: "2026-01-01",
      status: "Installed",
    });

    await gotoPath(page, base, "/sites");
    await openEditForRow(page, "sites-table", siteName);
    acceptNextDialog(page);
    await page.getByRole("button", { name: "Delete Site" }).click();
    await expectFlashContains(
      page,
      "Unable to delete site: remove or reassign linked systems first.",
    );

    await gotoPath(page, base, "/systems");
    await openEditForRow(page, "systems-table", systemName);
    acceptNextDialog(page);
    await page.getByRole("button", { name: "Delete System" }).click();
    await expectFlashContains(page, "System deleted.");

    await gotoPath(page, base, "/sites");
    await openEditForRow(page, "sites-table", siteName);
    acceptNextDialog(page);
    await page.getByRole("button", { name: "Delete Site" }).click();
    await expectFlashContains(page, "Site deleted.");
  });

  test("system crud validation and contact variants", async ({ page }) => {
    const orgName = uniqueName("SystemOrg");
    await createOrganization(page, base, orgName);
    const contactALast = uniqueName("Last");
    const contactBLast = uniqueName("Last");
    await createContact(page, base, "ContactA", contactALast, orgName, "a@example.edu");
    await createContact(page, base, "ContactB", contactBLast, orgName, "b@example.edu");

    const siteName = uniqueName("SystemSite");
    const buildingCode = uniqueName("SB").slice(0, 8);
    await createSite(page, base, siteName, buildingCode, orgName);

    await gotoPath(page, base, "/systems/new");
    await page.getByRole("button", { name: "Save" }).click();
    await expectRequiredMessage(page, "#name");

    await gotoPath(page, base, "/systems/new");
    await page.fill("#name", uniqueName("NoInstallationDateSys"));
    await page.fill("#system_type", "Audio-Visual");
    await page.getByRole("button", { name: "Save" }).click();
    await expectRequiredMessage(page, "#installation_date");
    await expect(page.locator("#site_id")).toHaveAttribute("required", "");

    const noContactSystem = uniqueName("NoContactSystem");
    await createSystem(page, base, {
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
    await createSystem(page, base, {
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

  test("systems sort and filter including contacts na", async ({ page }) => {
    const orgName = uniqueName("SortSysOrg");
    await createOrganization(page, base, orgName);
    await createContact(page, base, "SysSort", uniqueName("One"), orgName, "syssort1@example.edu");

    const siteName = uniqueName("SortSysSite");
    const buildingCode = uniqueName("SS").slice(0, 8);
    await createSite(page, base, siteName, buildingCode, orgName);

    await createSystem(page, base, {
      name: "Sort-Alpha",
      siteName,
      siteBuildingCode: buildingCode,
      installationDate: "2026-01-01",
      status: "Installed",
    });
    await createSystem(page, base, {
      name: "Sort-Zulu",
      siteName,
      siteBuildingCode: buildingCode,
      installationDate: "2026-01-02",
      status: "Installed",
    });
    const responsibleOrgName = uniqueName("SortResponsibleOrg");
    await createOrganization(page, base, responsibleOrgName);
    const filterSystemName = uniqueName("FilterTargetSystem");
    await createSystem(page, base, {
      name: filterSystemName,
      siteName,
      siteBuildingCode: buildingCode,
      responsibleOrg: responsibleOrgName,
      installationDate: "2026-01-01",
      status: "Installed",
    });

    await gotoPath(page, base, "/systems");
    await clickSort(page, "systems-table", "name", 1);
    const namesAsc = await visibleColumnValues(page, "systems-table", "name");
    expect(namesAsc).toEqual(sortedLower(namesAsc));

    await clickSort(page, "systems-table", "installation_date", 1);
    const dateValues = await visibleColumnValues(page, "systems-table", "installation_date");
    // Convert to comparable format for sorting check
    const parsedDates = dateValues.filter((value: string) => value !== "N/A");
    expect(parsedDates).toEqual([...parsedDates].sort());

    await filterTable(page, "systems-table", "contacts", "N/A");
    const rows = await visibleRows(page, "systems-table");
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      await expect(row).toContainText("N/A");
    }

    // 3rd sort click returns column to unsorted state
    await gotoPath(page, base, "/systems");
    await clickSort(page, "systems-table", "name", 3);
    await expect(table(page, "systems-table").getByTestId("column-name")).toHaveAttribute(
      "aria-sort",
      "none",
    );

    // filter by site and type columns
    await gotoPath(page, base, "/systems");
    await filterTable(page, "systems-table", "site", siteName);
    const siteRows = await visibleRows(page, "systems-table");
    expect(siteRows.length).toBeGreaterThan(0);
    for (const row of siteRows) {
      await expect(row).toContainText(siteName);
    }

    await gotoPath(page, base, "/systems");
    await filterTable(page, "systems-table", "type", "Audio-Visual");
    const typeRows = await visibleRows(page, "systems-table");
    expect(typeRows.length).toBeGreaterThan(0);
    for (const row of typeRows) {
      await expect(row).toContainText("Audio-Visual");
    }

    await gotoPath(page, base, "/systems");
    await filterTable(page, "systems-table", "name", filterSystemName);
    const nameRows = await visibleRows(page, "systems-table");
    expect(nameRows.length).toBeGreaterThan(0);
    for (const row of nameRows) {
      await expect(row).toContainText(filterSystemName);
    }

    await gotoPath(page, base, "/systems");
    await filterTable(page, "systems-table", "responsible_org", responsibleOrgName);
    const orgRows = await visibleRows(page, "systems-table");
    expect(orgRows.length).toBeGreaterThan(0);
    for (const row of orgRows) {
      await expect(row).toContainText(responsibleOrgName);
    }
    await expect(rowByText(page, "systems-table", filterSystemName)).toBeVisible();
  });

  test("logout visible on authenticated pages", async ({ page }) => {
    await setActiveRole(page, base, "Maintainer");
    const orgName = uniqueName("LogoutOrg");
    const siteName = uniqueName("LogoutSite");
    const buildingCode = uniqueName("LG").slice(0, 8);
    const systemName = uniqueName("LogoutSystem");

    await createOrganization(page, base, orgName);
    await createSite(page, base, siteName, buildingCode, orgName);
    await createSystem(page, base, {
      name: systemName,
      siteName,
      siteBuildingCode: buildingCode,
      responsibleOrg: orgName,
      installationDate: "2026-01-01",
      status: "Installed",
    });

    for (const path of ["/", "/systems", "/sites", "/organizations", "/contacts"]) {
      await gotoPath(page, base, path);
      await expect(page.getByRole("link", { name: "Logout" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Login" })).toHaveCount(0);
    }

    await gotoPath(page, base, "/systems");
    await openSystemDetailForRow(page, systemName);
    await expect(page.getByRole("link", { name: "Logout" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Login" })).toHaveCount(0);
  });

  test("system detail displays owner contact and location", async ({ page }) => {
    const ownerOrg = uniqueName("DetailOwnerOrg");
    const responsibleOrg = uniqueName("DetailResponsibleOrg");
    await createOrganization(page, base, ownerOrg);
    await createOrganization(page, base, responsibleOrg);

    const firstName = "Detail";
    const lastName = uniqueName("Contact");
    await createContact(page, base, firstName, lastName, ownerOrg, "detail-contact@example.edu");

    const siteName = uniqueName("DetailSite");
    const buildingCode = uniqueName("DL").slice(0, 8);
    await createSite(page, base, siteName, buildingCode, ownerOrg);

    const systemName = uniqueName("DetailSystem");
    const contactLabel = `${firstName} ${lastName} (${ownerOrg})`;
    await createSystem(page, base, {
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

    await gotoPath(page, base, "/systems");
    await openSystemDetailForRow(page, systemName);

    await expect(page.getByRole("heading", { name: "System Detail" })).toBeVisible();
    const installationDateCell = page
      .locator("dt", { hasText: "Installation Date" })
      .locator("xpath=following-sibling::dd[1]");
    await expect(installationDateCell).toContainText("2026-01-01");
    const warrantyCell = page
      .locator("dt", { hasText: "Warranty Expiry Date" })
      .locator("xpath=following-sibling::dd[1]");
    await expect(warrantyCell).toContainText("2029-01-01");
    const installerCell = page
      .locator("dt", { hasText: "Installer Organization" })
      .locator("xpath=following-sibling::dd[1]");
    await expect(installerCell).toContainText(ownerOrg);
    const conditionCell = page
      .locator("dt", { hasText: "Equipment Condition" })
      .locator("xpath=following-sibling::dd[1]");
    await expect(conditionCell).toContainText("Good");
    const statusCell = page
      .locator("dt", { hasText: "Status" })
      .locator("xpath=following-sibling::dd[1]");
    await expect(statusCell).toContainText("Installed");
    const responsibleCell = page
      .locator("dt", { hasText: "Responsible Organization" })
      .locator("xpath=following-sibling::dd[1]");
    await expect(responsibleCell).toContainText(responsibleOrg);
    const siteCell = page.locator("dt", { hasText: "Site" }).locator("xpath=following-sibling::dd[1]");
    await expect(siteCell).toContainText(siteName);
    await expect(siteCell).toContainText(buildingCode);
    const contactsCell = page
      .locator("dt", { hasText: "System Contacts" })
      .locator("xpath=following-sibling::dd[1]");
    await expect(contactsCell).toContainText(firstName);
    await expect(contactsCell).toContainText(lastName);
  });

  test("sites sort and filter", async ({ page }) => {
    const orgName = uniqueName("SortSiteOrg");
    const siteAlpha = uniqueName("SiteAlpha");
    const siteZulu = uniqueName("SiteZulu");
    const buildingAlpha = uniqueName("A100").slice(0, 8);
    const buildingZulu = uniqueName("Z900").slice(0, 8);
    await createOrganization(page, base, orgName);
    await createSite(page, base, siteAlpha, buildingAlpha, orgName);
    await createSite(page, base, siteZulu, buildingZulu, orgName);

    await gotoPath(page, base, "/sites");
    await clickSort(page, "sites-table", "site_name", 1);
    const siteNames = await visibleColumnValues(page, "sites-table", "site-name");
    expect(siteNames).toEqual(sortedLower(siteNames));

    await filterTable(page, "sites-table", "building_code", buildingAlpha);
    const rows = await visibleRows(page, "sites-table");
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      await expect(row).toContainText(buildingAlpha);
    }
    await expect(rows[0]).toContainText(siteAlpha);

    // 2nd sort click gives descending order
    await gotoPath(page, base, "/sites");
    await clickSort(page, "sites-table", "site_name", 2);
    const namesDesc = await visibleColumnValues(page, "sites-table", "site-name");
    expect(namesDesc).toEqual(sortedLower(namesDesc).reverse());

    // 3rd sort click returns column to unsorted state
    await clickSort(page, "sites-table", "site_name", 1);
    await expect(table(page, "sites-table").getByTestId("column-site_name")).toHaveAttribute(
      "aria-sort",
      "none",
    );

    // filter by site_name and owner_org columns
    await gotoPath(page, base, "/sites");
    await filterTable(page, "sites-table", "site_name", siteAlpha);
    const nameRows = await visibleRows(page, "sites-table");
    expect(nameRows.length).toBeGreaterThan(0);
    for (const row of nameRows) {
      await expect(row).toContainText(siteAlpha);
    }

    await gotoPath(page, base, "/sites");
    await filterTable(page, "sites-table", "owner_org", orgName);
    const orgRows = await visibleRows(page, "sites-table");
    expect(orgRows.length).toBeGreaterThan(0);
    for (const row of orgRows) {
      await expect(row).toContainText(orgName);
    }
  });

  test("organizations sort and filter", async ({ page }) => {
    const orgAlpha = uniqueName("OrgAlpha");
    const orgZulu = uniqueName("OrgZulu");
    await createOrganization(page, base, orgAlpha, "Internal");
    await createOrganization(page, base, orgZulu, "External");

    await gotoPath(page, base, "/organizations");
    await clickSort(page, "organizations-table", "name", 1);
    const orgNames = await visibleColumnValues(page, "organizations-table", "name");
    expect(orgNames).toEqual(sortedLower(orgNames));

    await filterTable(page, "organizations-table", "type", "External");
    const rows = await visibleRows(page, "organizations-table");
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      await expect(row).toContainText("External");
    }

    // 2nd sort click gives descending order
    await gotoPath(page, base, "/organizations");
    await clickSort(page, "organizations-table", "name", 2);
    const orgNamesDesc = await visibleColumnValues(page, "organizations-table", "name");
    expect(orgNamesDesc).toEqual(sortedLower(orgNamesDesc).reverse());

    // 3rd sort click returns column to unsorted state
    await clickSort(page, "organizations-table", "name", 1);
    await expect(table(page, "organizations-table").getByTestId("column-name")).toHaveAttribute(
      "aria-sort",
      "none",
    );

    // filter by name and description columns
    await gotoPath(page, base, "/organizations");
    await filterTable(page, "organizations-table", "name", orgAlpha);
    const nameRows = await visibleRows(page, "organizations-table");
    expect(nameRows.length).toBeGreaterThan(0);
    for (const row of nameRows) {
      await expect(row).toContainText(orgAlpha);
    }

    await gotoPath(page, base, "/organizations");
    await filterTable(page, "organizations-table", "description", orgAlpha);
    const descRows = await visibleRows(page, "organizations-table");
    expect(descRows.length).toBeGreaterThan(0);
    for (const row of descRows) {
      await expect(row).toContainText(orgAlpha);
    }
  });

  test("systems multi column filter", async ({ page }) => {
    const orgName = uniqueName("MultiFilterOrg");
    await createOrganization(page, base, orgName);
    const siteName = uniqueName("MultiFilterSite");
    const buildingCode = uniqueName("MF").slice(0, 8);
    await createSite(page, base, siteName, buildingCode, orgName);

    // unique prefix ensures name filter only matches systems created by this test
    const mfPrefix = uniqueName("MF");
    await createSystem(page, base, {
      name: `${mfPrefix}-Active`,
      siteName,
      siteBuildingCode: buildingCode,
      installationDate: "2026-01-01",
      status: "Installed",
    });
    await createSystem(page, base, {
      name: `${mfPrefix}-Inactive`,
      siteName,
      siteBuildingCode: buildingCode,
      installationDate: "2026-01-01",
      status: "Retired",
    });
    await createSystem(page, base, {
      name: uniqueName("Other"),
      siteName,
      siteBuildingCode: buildingCode,
      installationDate: "2026-01-01",
      status: "Installed",
    });

    await gotoPath(page, base, "/systems");
    await filterTable(page, "systems-table", "name", mfPrefix);
    const multiRows = await visibleRows(page, "systems-table");
    expect(multiRows.length).toBe(2);
    for (const row of multiRows) {
      await expect(row).toContainText(mfPrefix);
    }

    // second filter applied simultaneously — AND with the name filter already active
    await filterTable(page, "systems-table", "status", "Installed");
    const finalRows = await visibleRows(page, "systems-table");
    expect(finalRows.length).toBe(1);
    await expect(finalRows[0]).toContainText(`${mfPrefix}-Active`);
  });

  test("contacts sort and filter", async ({ page }) => {
    const orgName = uniqueName("SortContactOrg");
    const emailAlpha = `${uniqueName("alpha")}@example.edu`;
    const emailZulu = `${uniqueName("zulu")}@example.edu`;
    await createOrganization(page, base, orgName);
    await createContact(page, base, "Aaron", "Alpha", orgName, emailAlpha);
    await createContact(page, base, "Zoe", "Zulu", orgName, emailZulu);

    await gotoPath(page, base, "/contacts");
    await clickSort(page, "contacts-table", "name", 1);
    const contactNames = await visibleColumnValues(page, "contacts-table", "name");
    expect(contactNames).toEqual(sortedLower(contactNames));

    await filterTable(page, "contacts-table", "email", emailZulu);
    const rows = await visibleRows(page, "contacts-table");
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      await expect(row).toContainText(emailZulu);
    }
  });

  test("deletion reassign before parent delete", async ({ page }) => {
    // Reassign system to a different site → unblock site deletion
    const orgA = uniqueName("ReassignOrgA");
    await createOrganization(page, base, orgA);
    const siteA = uniqueName("ReassignSiteA");
    const bcA = uniqueName("RA").slice(0, 8);
    const siteB = uniqueName("ReassignSiteB");
    const bcB = uniqueName("RB").slice(0, 8);
    await createSite(page, base, siteA, bcA, orgA);
    await createSite(page, base, siteB, bcB, orgA);
    const sysName = uniqueName("ReassignSystem");
    await createSystem(page, base, {
      name: sysName,
      siteName: siteA,
      siteBuildingCode: bcA,
      installationDate: "2026-01-01",
      status: "Installed",
    });

    await gotoPath(page, base, "/sites");
    await openEditForRow(page, "sites-table", siteA);
    acceptNextDialog(page);
    await page.getByRole("button", { name: "Delete Site" }).click();
    await expectFlashContains(
      page,
      "Unable to delete site: remove or reassign linked systems first.",
    );

    await gotoPath(page, base, "/systems");
    await openEditForRow(page, "systems-table", sysName);
    await page.selectOption("#site_id", { label: `${siteB} (${bcB})` });
    await page.getByRole("button", { name: "Save" }).click();
    await expectFlashContains(page, "System updated.");

    await gotoPath(page, base, "/sites");
    await openEditForRow(page, "sites-table", siteA);
    acceptNextDialog(page);
    await page.getByRole("button", { name: "Delete Site" }).click();
    await expectFlashContains(page, "Site deleted.");

    // Reassign site to a different org → unblock org deletion
    const orgP = uniqueName("ReassignOrgP");
    const orgQ = uniqueName("ReassignOrgQ");
    await createOrganization(page, base, orgP);
    await createOrganization(page, base, orgQ);
    const siteP = uniqueName("ReassignSiteP");
    const bcP = uniqueName("RP").slice(0, 8);
    await createSite(page, base, siteP, bcP, orgP);

    await gotoPath(page, base, "/organizations");
    await openEditForRow(page, "organizations-table", orgP);
    acceptNextDialog(page);
    await page.getByRole("button", { name: "Delete Organization" }).click();
    await expectFlashContains(
      page,
      "Unable to delete organization: reassign or delete owned sites first.",
    );

    await gotoPath(page, base, "/sites");
    await openEditForRow(page, "sites-table", siteP);
    await page.selectOption("#owner_organization_id", { label: orgQ });
    await page.getByRole("button", { name: "Save" }).click();
    await expectFlashContains(page, "Site updated.");

    await gotoPath(page, base, "/organizations");
    await openEditForRow(page, "organizations-table", orgP);
    acceptNextDialog(page);
    await page.getByRole("button", { name: "Delete Organization" }).click();
    await expectFlashContains(page, "Organization deleted.");
  });

  test("list view columns", async ({ page }) => {
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
      const tableId = `${path.replace(/^\//, "")}-table`;
      await gotoPath(page, base, path);
      for (const colKey of colKeys) {
        await expect(table(page, tableId).getByTestId(`column-${colKey}`)).toBeVisible();
      }
    }
  });
});

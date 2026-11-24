import { test, expect, type Page } from "@playwright/test";

import { E2E_BASE_URL } from "./base_url";
import {
  acceptNextDialog,
  createContact,
  createOrganization,
  createSite,
  createSystem,
  expectFlashContains,
  openEditForRow,
  rowByText,
  setActiveRole,
  table,
  uniqueName,
} from "./ui_helpers";

test("admin list actions show edit links", async ({ page }) => {
  const baseUrl = E2E_BASE_URL;
  await setActiveRole(page, baseUrl, "Admin");

  const orgName = uniqueName("AdminListOrg");
  const firstName = "Admin";
  const lastName = uniqueName("ListContact");
  const siteName = uniqueName("AdminListSite");
  const buildingCode = uniqueName("AL").slice(0, 8);
  const systemName = uniqueName("AdminListSystem");

  await createOrganization(page, baseUrl, orgName);
  await createContact(page, baseUrl, firstName, lastName, orgName, `${lastName.toLowerCase()}@example.edu`);
  await createSite(page, baseUrl, siteName, buildingCode, orgName);
  await createSystem(page, baseUrl, {
    name: systemName,
    siteName,
    siteBuildingCode: buildingCode,
    responsibleOrg: orgName,
    installationDate: "2026-01-01",
    status: "Installed",
  });

  const coverage: Array<[string, string, string, string, string]> = [
    ["/systems", "systems-table", systemName, "Create New System", "Edit System"],
    ["/sites", "sites-table", siteName, "Create New Site", "Edit Site"],
    ["/organizations", "organizations-table", orgName, "Create New Organization", "Edit Organization"],
    ["/contacts", "contacts-table", `${firstName} ${lastName}`, "Create New Contact", "Edit Contact"],
  ];

  for (const [path, tableId, rowText, createText, editHeading] of coverage) {
    await page.goto(`${baseUrl}${path}`);
    await expect(page.getByRole("link", { name: createText })).toBeVisible();
    const row = rowByText(page, tableId, rowText);
    await expect(row).toBeVisible();
    await expect(row.getByRole("link", { name: "Edit" })).toBeVisible();
    await expect(row.getByRole("link", { name: "View" })).toHaveCount(0);
    await row.getByRole("link", { name: "Edit" }).click();
    await expect(page.getByRole("heading", { name: editHeading })).toBeVisible();
  }
});

test("admin non-user CRUD smoke", async ({ page }) => {
  const baseUrl = E2E_BASE_URL;
  await setActiveRole(page, baseUrl, "Admin");

  const orgName = uniqueName("AdminSmokeOrg");
  await createOrganization(page, baseUrl, orgName);
  await openEditForRow(page, "organizations-table", orgName);
  await page.fill("#description", "Admin smoke org");
  await page.getByRole("button", { name: "Save" }).click();
  await expectFlashContains(page, "Organization updated.");

  const contactFirst = "Admin";
  const contactLast = uniqueName("SmokeContact");
  await createContact(page, baseUrl, contactFirst, contactLast, orgName, `${contactLast.toLowerCase()}@example.edu`);
  await openEditForRow(page, "contacts-table", contactFirst);
  await page.fill("#title", "Admin Smoke");
  await page.getByRole("button", { name: "Save" }).click();
  await expectFlashContains(page, "Contact updated.");

  const siteName = uniqueName("AdminSmokeSite");
  const buildingCode = uniqueName("AS").slice(0, 8);
  await createSite(page, baseUrl, siteName, buildingCode, orgName);
  await openEditForRow(page, "sites-table", siteName);
  await page.fill("#room_number", "303");
  await page.getByRole("button", { name: "Save" }).click();
  await expectFlashContains(page, "Site updated.");

  const systemName = uniqueName("AdminSmokeSystem");
  await createSystem(page, baseUrl, {
    name: systemName,
    siteName,
    siteBuildingCode: buildingCode,
    responsibleOrg: orgName,
    installationDate: "2026-01-01",
    status: "Installed",
  });
  await openEditForRow(page, "systems-table", systemName);
  await page.fill("#description", "Admin smoke system");
  await page.getByRole("button", { name: "Save" }).click();
  await expectFlashContains(page, "System updated.");

  await openEditForRow(page, "systems-table", systemName);
  acceptNextDialog(page);
  await page.getByRole("button", { name: "Delete System" }).click();
  await expectFlashContains(page, "System deleted.");

  await page.goto(`${baseUrl}/sites`);
  await openEditForRow(page, "sites-table", siteName);
  acceptNextDialog(page);
  await page.getByRole("button", { name: "Delete Site" }).click();
  await expectFlashContains(page, "Site deleted.");

  await page.goto(`${baseUrl}/contacts`);
  await openEditForRow(page, "contacts-table", contactFirst);
  acceptNextDialog(page);
  await page.getByRole("button", { name: "Delete Contact" }).click();
  await expectFlashContains(page, "Contact deleted.");

  await page.goto(`${baseUrl}/organizations`);
  await openEditForRow(page, "organizations-table", orgName);
  acceptNextDialog(page);
  await page.getByRole("button", { name: "Delete Organization" }).click();
  await expectFlashContains(page, "Organization deleted.");
});
import { test, expect } from "@playwright/test";
import {
  acceptNextDialog,
  baseUrl,
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
} from "./ui_helpers.js";

const base = baseUrl();

test("admin list actions show edit links", async ({ page }) => {
  await setActiveRole(page, base, "Admin");

  const orgName = uniqueName("AdminListOrg");
  const firstName = "Admin";
  const lastName = uniqueName("ListContact");
  const siteName = uniqueName("AdminListSite");
  const buildingCode = uniqueName("AL").slice(0, 8);
  const systemName = uniqueName("AdminListSystem");

  await createOrganization(page, base, orgName);
  await createContact(page, base, firstName, lastName, orgName, `${lastName.toLowerCase()}@example.edu`);
  await createSite(page, base, siteName, buildingCode, orgName);
  await createSystem(page, base, {
    name: systemName,
    siteName,
    siteBuildingCode: buildingCode,
    responsibleOrg: orgName,
    installationDate: "2026-01-01",
    status: "Installed",
  });

  const coverage: Array<{
    path: string;
    tableId: string;
    rowText: string;
    createText: string;
    editHeading: string;
  }> = [
    {
      path: "/systems",
      tableId: "systems-table",
      rowText: systemName,
      createText: "Create New System",
      editHeading: "Edit System",
    },
    {
      path: "/sites",
      tableId: "sites-table",
      rowText: siteName,
      createText: "Create New Site",
      editHeading: "Edit Site",
    },
    {
      path: "/organizations",
      tableId: "organizations-table",
      rowText: orgName,
      createText: "Create New Organization",
      editHeading: "Edit Organization",
    },
    {
      path: "/contacts",
      tableId: "contacts-table",
      rowText: `${firstName} ${lastName}`,
      createText: "Create New Contact",
      editHeading: "Edit Contact",
    },
  ];

  for (const { path, tableId, rowText, createText, editHeading } of coverage) {
    await page.goto(`${base}${path}`);
    await expect(page.getByRole("link", { name: createText })).toBeVisible();
    const row = rowByText(page, tableId, rowText);
    await expect(row).toBeVisible();
    await expect(row.getByRole("link", { name: "Edit" })).toBeVisible();
    await expect(row.getByRole("link", { name: "View" })).toHaveCount(0);
    await row.getByRole("link", { name: "Edit" }).click();
    await expect(page.getByRole("heading", { name: editHeading })).toBeVisible();
  }
});

test("admin non user crud smoke", async ({ page }) => {
  await setActiveRole(page, base, "Admin");

  const orgName = uniqueName("AdminSmokeOrg");
  await createOrganization(page, base, orgName);
  await openEditForRow(page, "organizations-table", orgName);
  await page.fill("#description", "Admin smoke org");
  await page.getByRole("button", { name: "Save" }).click();
  await expectFlashContains(page, "Organization updated.");

  const contactFirst = "Admin";
  const contactLast = uniqueName("SmokeContact");
  await createContact(page, base, contactFirst, contactLast, orgName, `${contactLast.toLowerCase()}@example.edu`);
  await openEditForRow(page, "contacts-table", contactFirst);
  await page.fill("#title", "Admin Smoke");
  await page.getByRole("button", { name: "Save" }).click();
  await expectFlashContains(page, "Contact updated.");

  const siteName = uniqueName("AdminSmokeSite");
  const buildingCode = uniqueName("AS").slice(0, 8);
  await createSite(page, base, siteName, buildingCode, orgName);
  await openEditForRow(page, "sites-table", siteName);
  await page.fill("#room_number", "303");
  await page.getByRole("button", { name: "Save" }).click();
  await expectFlashContains(page, "Site updated.");

  const systemName = uniqueName("AdminSmokeSystem");
  await createSystem(page, base, {
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

  await page.goto(`${base}/sites`);
  await openEditForRow(page, "sites-table", siteName);
  acceptNextDialog(page);
  await page.getByRole("button", { name: "Delete Site" }).click();
  await expectFlashContains(page, "Site deleted.");

  await page.goto(`${base}/contacts`);
  await openEditForRow(page, "contacts-table", contactFirst);
  acceptNextDialog(page);
  await page.getByRole("button", { name: "Delete Contact" }).click();
  await expectFlashContains(page, "Contact deleted.");

  await page.goto(`${base}/organizations`);
  await openEditForRow(page, "organizations-table", orgName);
  acceptNextDialog(page);
  await page.getByRole("button", { name: "Delete Organization" }).click();
  await expectFlashContains(page, "Organization deleted.");
});

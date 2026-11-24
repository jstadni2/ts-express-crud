import { test, expect, type Page } from "@playwright/test";

import { E2E_BASE_URL } from "./base_url";
import {
  createContact,
  createOrganization,
  createSite,
  createSystem,
  expectForbiddenGet,
  expectForbiddenPost,
  openViewForRow,
  rowByText,
  setActiveRole,
  uniqueName,
} from "./ui_helpers";

async function seedViewerReadData(page: Page, baseUrl: string): Promise<Record<string, string>> {
  await setActiveRole(page, baseUrl, "Admin");

  const orgName = uniqueName("ViewerOrg");
  const firstName = "Viewer";
  const lastName = uniqueName("Contact");
  const siteName = uniqueName("ViewerSite");
  const buildingCode = uniqueName("VB").slice(0, 8);
  const systemName = uniqueName("ViewerSystem");

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

  return {
    organization: orgName,
    contact: `${firstName} ${lastName}`,
    site: siteName,
    system: systemName,
  };
}

test("viewer list and detail views are read-only", async ({ page }) => {
  const baseUrl = E2E_BASE_URL;
  const records = await seedViewerReadData(page, baseUrl);
  await setActiveRole(page, baseUrl, "Viewer");

  await page.goto(`${baseUrl}/`);
  await expect(page.getByRole("link", { name: "Users" })).toHaveCount(0);

  const coverage: Array<[string, string, string, string, string]> = [
    ["/systems", "systems-table", records.system, "Create New System", "System Detail"],
    ["/sites", "sites-table", records.site, "Create New Site", "Site Detail"],
    ["/organizations", "organizations-table", records.organization, "Create New Organization", "Organization Detail"],
    ["/contacts", "contacts-table", records.contact, "Create New Contact", "Contact Detail"],
  ];

  for (const [path, tableId, rowText, createText, detailHeading] of coverage) {
    await page.goto(`${baseUrl}${path}`);
    await expect(page.getByRole("link", { name: "Users" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: createText })).toHaveCount(0);

    const row = rowByText(page, tableId, rowText);
    await expect(row).toBeVisible();
    await expect(row.getByRole("link", { name: "View" })).toBeVisible();
    await expect(row.getByRole("link", { name: "Edit" })).toHaveCount(0);
    await openViewForRow(page, tableId, rowText);
    await expect(page.getByRole("heading", { name: detailHeading })).toBeVisible();
  }

  await page.goto(`${baseUrl}/systems`);
  const systemRow = rowByText(page, "systems-table", records.system);
  await expect(systemRow.getByRole("button", { name: "Deactivate" })).toHaveCount(0);
  await expect(systemRow.getByRole("button", { name: "Activate" })).toHaveCount(0);
});

const restrictedGetPaths = [
  "/systems/new",
  "/systems/999999/edit",
  "/sites/new",
  "/sites/999999/edit",
  "/organizations/new",
  "/organizations/999999/edit",
  "/contacts/new",
  "/contacts/999999/edit",
];

for (const path of restrictedGetPaths) {
  test(`viewer restricted GET ${path} returns 403`, async ({ page }) => {
    const baseUrl = E2E_BASE_URL;
    await setActiveRole(page, baseUrl, "Viewer");
    await expectForbiddenGet(page, baseUrl, path);
  });
}

const restrictedPostPaths = [
  "/systems/999999/delete",
  "/sites/999999/delete",
  "/organizations/999999/delete",
  "/contacts/999999/delete",
];

for (const path of restrictedPostPaths) {
  test(`viewer restricted POST ${path} returns 403`, async ({ page }) => {
    const baseUrl = E2E_BASE_URL;
    await setActiveRole(page, baseUrl, "Viewer");
    await expectForbiddenPost(page, baseUrl, path);
  });
}
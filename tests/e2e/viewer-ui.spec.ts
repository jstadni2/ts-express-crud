import { test, expect, type Page } from "@playwright/test";
import {
  baseUrl,
  createContact,
  createOrganization,
  createSite,
  createSystem,
  expectForbiddenGet,
  expectForbiddenPost,
  openViewForRow,
  rowByText,
  setActiveRole,
  table,
  uniqueName,
} from "./ui_helpers.js";

const base = baseUrl();

interface ViewerReadData {
  organization: string;
  contact: string;
  site: string;
  system: string;
}

async function seedViewerReadData(page: Page): Promise<ViewerReadData> {
  await setActiveRole(page, base, "Admin");

  const orgName = uniqueName("ViewerOrg");
  const firstName = "Viewer";
  const lastName = uniqueName("Contact");
  const siteName = uniqueName("ViewerSite");
  const buildingCode = uniqueName("VB").slice(0, 8);
  const systemName = uniqueName("ViewerSystem");

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

  return {
    organization: orgName,
    contact: `${firstName} ${lastName}`,
    site: siteName,
    system: systemName,
  };
}

test("viewer list and detail views are read only", async ({ page }) => {
  const records = await seedViewerReadData(page);
  await setActiveRole(page, base, "Viewer");

  await page.goto(`${base}/`);
  await expect(page.getByRole("link", { name: "Users" })).toHaveCount(0);

  const coverage: Array<{
    path: string;
    tableId: string;
    rowText: string;
    createText: string;
    detailHeading: string;
  }> = [
    {
      path: "/systems",
      tableId: "systems-table",
      rowText: records.system,
      createText: "Create New System",
      detailHeading: "System Detail",
    },
    {
      path: "/sites",
      tableId: "sites-table",
      rowText: records.site,
      createText: "Create New Site",
      detailHeading: "Site Detail",
    },
    {
      path: "/organizations",
      tableId: "organizations-table",
      rowText: records.organization,
      createText: "Create New Organization",
      detailHeading: "Organization Detail",
    },
    {
      path: "/contacts",
      tableId: "contacts-table",
      rowText: records.contact,
      createText: "Create New Contact",
      detailHeading: "Contact Detail",
    },
  ];

  for (const { path, tableId, rowText, createText, detailHeading } of coverage) {
    await page.goto(`${base}${path}`);
    await expect(page.getByRole("link", { name: "Users" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: createText })).toHaveCount(0);

    const row = rowByText(page, tableId, rowText);
    await expect(row).toBeVisible();
    await expect(row.getByRole("link", { name: "View" })).toBeVisible();
    await expect(row.getByRole("link", { name: "Edit" })).toHaveCount(0);
    await openViewForRow(page, tableId, rowText);
    await expect(page.getByRole("heading", { name: detailHeading })).toBeVisible();
  }

  await page.goto(`${base}/systems`);
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
  test(`viewer restricted GET url returns 403: ${path}`, async ({ page }) => {
    await setActiveRole(page, base, "Viewer");
    await expectForbiddenGet(page, base, path);
  });
}

const restrictedPostPaths = [
  "/systems/999999/delete",
  "/sites/999999/delete",
  "/organizations/999999/delete",
  "/contacts/999999/delete",
];

for (const path of restrictedPostPaths) {
  test(`viewer restricted POST url returns 403: ${path}`, async ({ page }) => {
    await setActiveRole(page, base, "Viewer");
    await expectForbiddenPost(page, base, path);
  });
}

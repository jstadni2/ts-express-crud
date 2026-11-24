import { expect, type Page, type Locator, type Response } from "@playwright/test";

export function uniqueName(prefix: string): string {
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
}

export function gotoPath(page: Page, baseUrl: string, path: string): Promise<Response | null> {
  return page.goto(`${baseUrl}${path}`);
}

export function acceptNextDialog(page: Page): void {
  page.once("dialog", (dialog) => dialog.accept());
}

export function flashLocator(page: Page): Locator {
  return page.locator("section:has(h2:text-is('Messages')) li");
}

export async function expectFlashContains(page: Page, text: string): Promise<void> {
  await expect(flashLocator(page)).toContainText(text);
}

export function table(page: Page, tableId: string): Locator {
  return page.getByTestId(tableId);
}

export function dataRows(page: Page, tableId: string): Locator {
  const rowRegex = new RegExp("^row-\\d+$");
  return table(page, tableId).getByTestId(rowRegex);
}

export function rowByText(page: Page, tableId: string, rowText: string): Locator {
  return dataRows(page, tableId).filter({ hasText: rowText }).first();
}

export async function visibleRows(page: Page, tableId: string): Promise<Locator[]> {
  const rows = dataRows(page, tableId);
  const count = await rows.count();
  const result: Locator[] = [];
  for (let i = 0; i < count; i++) {
    const row = rows.nth(i);
    if (await row.isVisible()) {
      result.push(row);
    }
  }
  return result;
}

export async function openEditForRow(page: Page, tableId: string, rowText: string): Promise<void> {
  const row = rowByText(page, tableId, rowText);
  await expect(row).toBeVisible();
  await row.getByRole("link", { name: "Edit" }).click();
}

export async function openViewForRow(page: Page, tableId: string, rowText: string): Promise<void> {
  const row = rowByText(page, tableId, rowText);
  await expect(row).toBeVisible();
  await row.getByRole("link", { name: "View" }).click();
}

export async function createOrganization(
  page: Page,
  baseUrl: string,
  name: string,
  orgType = "Internal",
): Promise<void> {
  await gotoPath(page, baseUrl, "/organizations/new");
  await page.fill("#name", name);
  await page.selectOption("#org_type", orgType);
  await page.fill("#description", `Description for ${name}`);
  await page.getByRole("button", { name: "Save" }).click();
  await expectFlashContains(page, "Organization created.");
  await expect(table(page, "organizations-table")).toContainText(name);
}

export async function createContact(
  page: Page,
  baseUrl: string,
  firstName: string,
  lastName: string,
  organizationName: string,
  email: string,
): Promise<void> {
  await gotoPath(page, baseUrl, "/contacts/new");
  await page.fill("#first_name", firstName);
  await page.fill("#last_name", lastName);
  await page.fill("#title", "AV Test");
  await page.fill("#email", email);
  await page.fill("#phone", "555-0000");
  await page.selectOption("#organization_id", { label: organizationName });
  await page.getByRole("button", { name: "Save" }).click();
  await expectFlashContains(page, "Contact created.");
  await expect(table(page, "contacts-table")).toContainText(`${firstName} ${lastName}`);
}

export async function createSite(
  page: Page,
  baseUrl: string,
  siteName: string,
  buildingCode: string,
  ownerOrgName: string,
  contactLabels?: string[],
): Promise<void> {
  await gotoPath(page, baseUrl, "/sites/new");
  await page.fill("#site_name", siteName);
  await page.fill("#address_line1", "100 Test Ave");
  await page.fill("#address_line2", "");
  await page.fill("#city", "Champaign");
  await page.fill("#state", "IL");
  await page.fill("#postal_code", "61820");
  await page.fill("#country", "USA");
  await page.fill("#building_code", buildingCode);
  await page.selectOption("#ownership", "Owned");
  await page.selectOption("#status", "Active");
  await page.fill("#description", `Site desc ${siteName}`);
  await page.fill("#room_number", "101");
  await page.selectOption("#owner_organization_id", { label: ownerOrgName });
  if (contactLabels) {
    await page.selectOption("#contact_ids", contactLabels.map((label) => ({ label })));
  }
  await page.getByRole("button", { name: "Save" }).click();
  await expectFlashContains(page, "Site created.");
  await expect(table(page, "sites-table")).toContainText(siteName);
}

export async function createSystem(
  page: Page,
  baseUrl: string,
  options: {
    name: string;
    systemType?: string;
    description?: string;
    installationDate?: string;
    warrantyExpiryDate?: string;
    installerOrg?: string;
    equipmentCondition?: string;
    status?: string;
    siteName: string;
    siteBuildingCode: string;
    responsibleOrg?: string;
    contactLabels?: string[];
  },
): Promise<void> {
  const {
    name,
    systemType = "Audio-Visual",
    description,
    installationDate,
    warrantyExpiryDate,
    installerOrg,
    equipmentCondition,
    status = "Planned",
    siteName,
    siteBuildingCode,
    responsibleOrg,
    contactLabels,
  } = options;
  await gotoPath(page, baseUrl, "/systems/new");
  await page.fill("#name", name);
  await page.fill("#system_type", systemType);
  await page.fill("#description", description || `System desc ${name}`);
  if (installationDate) await page.fill("#installation_date", installationDate);
  if (warrantyExpiryDate) await page.fill("#warranty_expiry_date", warrantyExpiryDate);
  if (installerOrg) await page.selectOption("#installer_organization_id", { label: installerOrg });
  if (equipmentCondition) await page.fill("#equipment_condition", equipmentCondition);
  await page.selectOption("#status", status);
  const siteLabel = `${siteName} (${siteBuildingCode})`;
  await page.selectOption("#site_id", { label: siteLabel });
  if (responsibleOrg) await page.selectOption("#responsible_organization_id", { label: responsibleOrg });
  if (contactLabels) {
    await page.selectOption("#contact_ids", contactLabels.map((label) => ({ label })));
  }
  await page.getByRole("button", { name: "Save" }).click();
  await expectFlashContains(page, "System created.");
  await expect(table(page, "systems-table")).toContainText(name);
}

export async function clickSort(
  page: Page,
  tableId: string,
  columnKey: string,
  times = 1,
): Promise<void> {
  const button = table(page, tableId).getByTestId(`sort-button-${columnKey}`);
  for (let i = 0; i < times; i++) {
    await button.click();
  }
}

export async function visibleColumnValues(
  page: Page,
  tableId: string,
  columnTestIdKey: string,
): Promise<string[]> {
  const cellPattern = new RegExp(`^row-\\d+-${columnTestIdKey}$`);
  const values: string[] = [];
  for (const row of await visibleRows(page, tableId)) {
    values.push((await row.getByTestId(cellPattern).first().innerText()).trim());
  }
  return values;
}

export async function filterTable(
  page: Page,
  tableId: string,
  columnKey: string,
  value: string,
): Promise<void> {
  const toggle = table(page, tableId).getByTestId(`filter-toggle-${columnKey}`);
  await toggle.click();
  const input = table(page, tableId).getByTestId(`filter-row-${columnKey}`);
  await input.fill(value);
}

export async function expectRequiredMessage(page: Page, inputSelector: string): Promise<void> {
  const message = await page.locator(inputSelector).evaluate(
    (el: HTMLInputElement) => el.validationMessage,
  );
  expect(message.trim()).not.toBe("");
}

export async function setActiveRole(page: Page, baseUrl: string, roleName: string): Promise<void> {
  const normalized = roleName.trim().toLowerCase();
  const goTo = `${baseUrl}/dev/mock-session-role?role=${normalized}`;
  const response = await page.goto(goTo);
  expect(response).not.toBeNull();
  expect(response!.status(), "mock session role should return 200").toBe(200);
  await expectFlashContains(page, `Active role set to ${titleCase(roleName)}.`);
  await page.goto(`${baseUrl}/`);
}

export async function expectForbiddenGet(
  page: Page,
  baseUrl: string,
  path: string,
): Promise<void> {
  const response = await page.goto(`${baseUrl}${path}`);
  expect(response).not.toBeNull();
  expect(response!.status()).toBe(403);
  await expect(page.locator("main")).toContainText(
    "An unexpected error occurred. Please try again or contact support if the problem persists.",
  );
  await expectFlashContains(page, "You do not have permission to perform that action.");
}

export async function expectForbiddenPost(
  page: Page,
  baseUrl: string,
  path: string,
): Promise<void> {
  await page.goto(`${baseUrl}/dev/role`);
  const csrfToken = await page
    .locator('input[name="csrf_token"]')
    .getAttribute("value");
  expect(csrfToken, "CSRF token not found").toBeTruthy();

  const response = await page.request.post(`${baseUrl}${path}`, {
    form: { csrf_token: csrfToken! },
  });
  expect(response.status()).toBe(403);
  const body = await response.text();
  expect(body).toContain("Something went wrong");
  expect(body).toContain(
    "An unexpected error occurred. Please try again or contact support if the problem persists.",
  );
  expect(body).toContain("You do not have permission to perform that action.");
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}
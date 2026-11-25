import { randomUUID } from "node:crypto";
import { expect, type APIResponse, type Locator, type Page } from "@playwright/test";

/** Default e2e base URL, mirroring tests/e2e/conftest.py. */
export function baseUrl(): string {
  return process.env.E2E_BASE_URL ?? "http://127.0.0.1:5010";
}

export function uniqueName(prefix: string): string {
  return `${prefix}-${randomUUID().replaceAll("-", "").slice(0, 8)}`;
}

export function gotoPath(page: Page, base: string, path: string): Promise<unknown> {
  return page.goto(`${base}${path}`);
}

export function acceptNextDialog(page: Page): void {
  void page.once("dialog", (dialog) => void dialog.accept());
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
  return table(page, tableId).getByTestId(/^row-\d+$/);
}

export function rowByText(page: Page, tableId: string, rowText: string): Locator {
  return dataRows(page, tableId).filter({ hasText: rowText }).first();
}

export async function visibleRows(page: Page, tableId: string): Promise<Locator[]> {
  const rows = dataRows(page, tableId);
  const result: Locator[] = [];
  const count = await rows.count();
  for (let idx = 0; idx < count; idx += 1) {
    const row = rows.nth(idx);
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
  base: string,
  name: string,
  orgType = "Internal",
): Promise<void> {
  await gotoPath(page, base, "/organizations/new");
  await page.fill("#name", name);
  await page.selectOption("#org_type", orgType);
  await page.fill("#description", `Description for ${name}`);
  await page.getByRole("button", { name: "Save" }).click();
  await expectFlashContains(page, "Organization created.");
  await expect(table(page, "organizations-table")).toContainText(name);
}

export async function createContact(
  page: Page,
  base: string,
  firstName: string,
  lastName: string,
  organizationName: string,
  email: string,
): Promise<void> {
  await gotoPath(page, base, "/contacts/new");
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
  base: string,
  siteName: string,
  buildingCode: string,
  ownerOrgName: string,
  contactLabels?: string[],
): Promise<void> {
  await gotoPath(page, base, "/sites/new");
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
    await page.selectOption(
      "#contact_ids",
      contactLabels.map((label) => ({ label })),
    );
  }
  await page.getByRole("button", { name: "Save" }).click();
  await expectFlashContains(page, "Site created.");
  await expect(table(page, "sites-table")).toContainText(siteName);
}

export interface CreateSystemOptions {
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
}

export async function createSystem(
  page: Page,
  base: string,
  options: CreateSystemOptions,
): Promise<void> {
  await gotoPath(page, base, "/systems/new");
  await page.fill("#name", options.name);
  await page.fill("#system_type", options.systemType ?? "Audio-Visual");
  await page.fill("#description", options.description || `System desc ${options.name}`);
  if (options.installationDate) {
    await page.fill("#installation_date", options.installationDate);
  }
  if (options.warrantyExpiryDate) {
    await page.fill("#warranty_expiry_date", options.warrantyExpiryDate);
  }
  if (options.installerOrg) {
    await page.selectOption("#installer_organization_id", { label: options.installerOrg });
  }
  if (options.equipmentCondition) {
    await page.fill("#equipment_condition", options.equipmentCondition);
  }
  await page.selectOption("#status", options.status ?? "Planned");
  const siteLabel = `${options.siteName} (${options.siteBuildingCode})`;
  await page.selectOption("#site_id", { label: siteLabel });
  if (options.responsibleOrg) {
    await page.selectOption("#responsible_organization_id", { label: options.responsibleOrg });
  }
  if (options.contactLabels) {
    await page.selectOption(
      "#contact_ids",
      options.contactLabels.map((label) => ({ label })),
    );
  }
  await page.getByRole("button", { name: "Save" }).click();
  await expectFlashContains(page, "System created.");
  await expect(table(page, "systems-table")).toContainText(options.name);
}

export async function clickSort(
  page: Page,
  tableId: string,
  columnKey: string,
  times = 1,
): Promise<void> {
  const button = table(page, tableId).getByTestId(`sort-button-${columnKey}`);
  for (let click = 0; click < times; click += 1) {
    await button.click();
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function visibleColumnValues(
  page: Page,
  tableId: string,
  columnTestIdKey: string,
): Promise<string[]> {
  const cellPattern = new RegExp(`^row-\\d+-${escapeRegExp(columnTestIdKey)}$`);
  const values: string[] = [];
  for (const row of await visibleRows(page, tableId)) {
    values.push((await row.getByTestId(cellPattern).first().innerText()).trim());
  }
  return values;
}

/** Code-point sort by lowercased value, mirroring Python's `sorted(key=str.lower)`. */
export function sortedLower(values: string[]): string[] {
  return [...values].sort((a, b) => {
    const la = a.toLowerCase();
    const lb = b.toLowerCase();
    if (la < lb) return -1;
    if (la > lb) return 1;
    return 0;
  });
}

export async function filterTable(
  page: Page,
  tableId: string,
  columnKey: string,
  value: string,
): Promise<void> {
  const toggle = table(page, tableId).getByTestId(`filter-toggle-${columnKey}`);
  await toggle.click();
  const inputLocator = table(page, tableId).getByTestId(`filter-row-${columnKey}`);
  await inputLocator.fill(value);
}

export async function expectRequiredMessage(page: Page, inputSelector: string): Promise<void> {
  const message = await page.locator(inputSelector).evaluate("el => el.validationMessage");
  expect(typeof message).toBe("string");
  expect((message as string).trim()).not.toBe("");
}

export async function setActiveRole(
  page: Page,
  base: string,
  roleName: string,
): Promise<void> {
  const normalized = roleName.trim().toLowerCase();
  const response = await page.goto(`${base}/dev/mock-session-role?role=${normalized}`);
  expect(response).not.toBeNull();
  expect(response!.status()).toBe(200);
  await expectFlashContains(page, `Active role set to ${titleCase(roleName)}.`);
  await page.goto(`${base}/`);
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

export async function expectForbiddenGet(
  page: Page,
  base: string,
  path: string,
): Promise<void> {
  const response = await page.goto(`${base}${path}`);
  expect(response).not.toBeNull();
  expect(response!.status()).toBe(403);
  await expect(page.locator("main")).toContainText(
    "An unexpected error occurred. Please try again or contact support if the problem persists.",
  );
  await expectFlashContains(page, "You do not have permission to perform that action.");
}

export async function expectForbiddenPost(
  page: Page,
  base: string,
  path: string,
): Promise<void> {
  // Go to the dev role page to get a CSRF token in the browser session context.
  // The session carries the developer role (set via mock-session-role), which
  // allows this GET to render dev_role.html containing the CSRF token input.
  await page.goto(`${base}/dev/role`);
  const csrfToken = await page.locator('input[name="csrf_token"]').getAttribute("value");
  expect(csrfToken, "CSRF token not found").toBeTruthy();
  expect(csrfToken!).not.toBe("");

  // Make the POST request with the CSRF token
  const response = await page.request.post(`${base}${path}`, {
    form: { csrf_token: csrfToken! },
  });
  await assertForbiddenResponse(response);
}

async function assertForbiddenResponse(response: APIResponse): Promise<void> {
  expect(response.status()).toBe(403);
  const body = await response.text();
  expect(body).toContain("Something went wrong");
  expect(body).toContain(
    "An unexpected error occurred. Please try again or contact support if the problem persists.",
  );
  expect(body).toContain("You do not have permission to perform that action.");
}

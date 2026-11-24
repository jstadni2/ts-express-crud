from __future__ import annotations

import re
from uuid import uuid4

from playwright.sync_api import APIResponse, Locator, Page, expect


def unique_name(prefix: str) -> str:
    return f"{prefix}-{uuid4().hex[:8]}"


def goto_path(page: Page, base_url: str, path: str) -> None:
    page.goto(f"{base_url}{path}")


def accept_next_dialog(page: Page) -> None:
    page.once("dialog", lambda dialog: dialog.accept())


def flash_locator(page: Page) -> Locator:
    return page.locator("section:has(h2:text-is('Messages')) li")


def expect_flash_contains(page: Page, text: str) -> None:
    expect(flash_locator(page)).to_contain_text(text)


def table(page: Page, table_id: str) -> Locator:
    return page.get_by_test_id(table_id)


def data_rows(page: Page, table_id: str) -> Locator:
    return table(page, table_id).get_by_test_id(re.compile(r"^row-\d+$"))


def row_by_text(page: Page, table_id: str, row_text: str) -> Locator:
    return data_rows(page, table_id).filter(has_text=row_text).first


def visible_rows(page: Page, table_id: str) -> list[Locator]:
    rows = data_rows(page, table_id)
    result: list[Locator] = []
    for idx in range(rows.count()):
        row = rows.nth(idx)
        if row.is_visible():
            result.append(row)
    return result


def open_edit_for_row(page: Page, table_id: str, row_text: str) -> None:
    row = row_by_text(page, table_id, row_text)
    expect(row).to_be_visible()
    row.get_by_role("link", name="Edit").click()


def open_view_for_row(page: Page, table_id: str, row_text: str) -> None:
    row = row_by_text(page, table_id, row_text)
    expect(row).to_be_visible()
    row.get_by_role("link", name="View").click()


def create_organization(page: Page, base_url: str, name: str, org_type: str = "Internal") -> None:
    goto_path(page, base_url, "/organizations/new")
    page.fill("#name", name)
    page.select_option("#org_type", org_type)
    page.fill("#description", f"Description for {name}")
    page.get_by_role("button", name="Save").click()
    expect_flash_contains(page, "Organization created.")
    expect(table(page, "organizations-table")).to_contain_text(name)


def create_contact(
    page: Page,
    base_url: str,
    first_name: str,
    last_name: str,
    organization_name: str,
    email: str,
) -> None:
    goto_path(page, base_url, "/contacts/new")
    page.fill("#first_name", first_name)
    page.fill("#last_name", last_name)
    page.fill("#title", "AV Test")
    page.fill("#email", email)
    page.fill("#phone", "555-0000")
    page.select_option("#organization_id", label=organization_name)
    page.get_by_role("button", name="Save").click()
    expect_flash_contains(page, "Contact created.")
    expect(table(page, "contacts-table")).to_contain_text(f"{first_name} {last_name}")


def create_site(
    page: Page,
    base_url: str,
    site_name: str,
    building_code: str,
    owner_org_name: str,
    contact_labels: list[str] | None = None,
) -> None:
    goto_path(page, base_url, "/sites/new")
    page.fill("#site_name", site_name)
    page.fill("#address_line1", "100 Test Ave")
    page.fill("#address_line2", "")
    page.fill("#city", "Champaign")
    page.fill("#state", "IL")
    page.fill("#postal_code", "61820")
    page.fill("#country", "USA")
    page.fill("#building_code", building_code)
    page.select_option("#ownership", "Owned")
    page.select_option("#status", "Active")
    page.fill("#description", f"Site desc {site_name}")
    page.fill("#room_number", "101")
    page.select_option("#owner_organization_id", label=owner_org_name)
    if contact_labels:
        page.select_option("#contact_ids", label=contact_labels)
    page.get_by_role("button", name="Save").click()
    expect_flash_contains(page, "Site created.")
    expect(table(page, "sites-table")).to_contain_text(site_name)


def create_system(
    page: Page,
    base_url: str,
    *,
    name: str,
    system_type: str = "Audio-Visual",
    description: str = "",
    installation_date: str = "",
    warranty_expiry_date: str = "",
    installer_org: str | None = None,
    equipment_condition: str = "",
    status: str = "Planned",
    site_name: str,
    site_building_code: str,
    responsible_org: str | None = None,
    contact_labels: list[str] | None = None,
) -> None:
    goto_path(page, base_url, "/systems/new")
    page.fill("#name", name)
    page.fill("#system_type", system_type)
    page.fill("#description", description or f"System desc {name}")
    if installation_date:
        page.fill("#installation_date", installation_date)
    if warranty_expiry_date:
        page.fill("#warranty_expiry_date", warranty_expiry_date)
    if installer_org:
        page.select_option("#installer_organization_id", label=installer_org)
    if equipment_condition:
        page.fill("#equipment_condition", equipment_condition)
    page.select_option("#status", status)
    site_label = f"{site_name} ({site_building_code})"
    page.select_option("#site_id", label=site_label)
    if responsible_org:
        page.select_option("#responsible_organization_id", label=responsible_org)
    if contact_labels:
        page.select_option("#contact_ids", label=contact_labels)
    page.get_by_role("button", name="Save").click()
    expect_flash_contains(page, "System created.")
    expect(table(page, "systems-table")).to_contain_text(name)


def click_sort(page: Page, table_id: str, column_key: str, times: int = 1) -> None:
    button = table(page, table_id).get_by_test_id(f"sort-button-{column_key}")
    for _ in range(times):
        button.click()


def visible_column_values(page: Page, table_id: str, column_testid_key: str) -> list[str]:
    cell_pattern = re.compile(rf"^row-\d+-{re.escape(column_testid_key)}$")
    values: list[str] = []
    for row in visible_rows(page, table_id):
        values.append(row.get_by_test_id(cell_pattern).first.inner_text().strip())
    return values


def filter_table(page: Page, table_id: str, column_key: str, value: str) -> None:
    toggle = table(page, table_id).get_by_test_id(f"filter-toggle-{column_key}")
    toggle.click()
    input_locator = table(page, table_id).get_by_test_id(f"filter-row-{column_key}")
    input_locator.fill(value)


def expect_required_message(page: Page, input_selector: str) -> None:
    message = page.locator(input_selector).evaluate("el => el.validationMessage")
    assert isinstance(message, str)
    assert message.strip() != ""


def set_active_role(page: Page, base_url: str, role_name: str) -> None:
    normalized = role_name.strip().lower()
    go_to = f"{base_url}/dev/mock-session-role?role={normalized}"
    response = page.goto(go_to)
    assert response is not None
    assert response.status == 200
    expect_flash_contains(page, f"Active role set to {role_name.title()}.")
    page.goto(f"{base_url}/")


def expect_forbidden_get(page: Page, base_url: str, path: str) -> None:
    response = page.goto(f"{base_url}{path}")
    assert response is not None
    assert response.status == 403
    expect(page.locator("main")).to_contain_text(
        "An unexpected error occurred. Please try again or contact support if the problem persists."
    )
    expect_flash_contains(page, "You do not have permission to perform that action.")


def expect_forbidden_post(page: Page, base_url: str, path: str) -> None:
    # Go to the dev role page to get a CSRF token in the browser session context.
    # The session carries the developer role (set via mock-session-role), which
    # allows this GET to render dev_role.html containing the CSRF token input.
    page.goto(f"{base_url}/dev/role")
    csrf_token = page.locator('input[name="csrf_token"]').get_attribute("value")
    assert csrf_token is not None and csrf_token != "", "CSRF token not found"

    # Make the POST request with the CSRF token
    response = page.request.post(
        f"{base_url}{path}",
        form={"csrf_token": csrf_token},
    )
    _assert_forbidden_response(response)


def _assert_forbidden_response(response: APIResponse) -> None:
    assert response.status == 403
    body = response.text()
    assert "Something went wrong" in body
    assert "An unexpected error occurred. Please try again or contact support if the problem persists." in body
    assert "You do not have permission to perform that action." in body

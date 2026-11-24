from __future__ import annotations

from playwright.sync_api import Page, expect

from tests.e2e.ui_helpers import (
	accept_next_dialog,
	create_contact,
	create_organization,
	create_site,
	create_system,
	expect_flash_contains,
	open_edit_for_row,
	row_by_text,
	set_active_role,
	table,
	unique_name,
)


def test_admin_list_actions_show_edit_links(base_url: str, page: Page):
	set_active_role(page, base_url, "Admin")

	org_name = unique_name("AdminListOrg")
	first_name = "Admin"
	last_name = unique_name("ListContact")
	site_name = unique_name("AdminListSite")
	building_code = unique_name("AL")[:8]
	system_name = unique_name("AdminListSystem")

	create_organization(page, base_url, org_name)
	create_contact(page, base_url, first_name, last_name, org_name, f"{last_name.lower()}@example.edu")
	create_site(page, base_url, site_name, building_code, org_name)
	create_system(
		page,
		base_url,
		name=system_name,
		site_name=site_name,
		site_building_code=building_code,
		responsible_org=org_name,
		installation_date="2026-01-01",
		status="Installed",
	)

	coverage = [
		("/systems", "systems-table", system_name, "Create New System", "Edit System"),
		("/sites", "sites-table", site_name, "Create New Site", "Edit Site"),
		(
			"/organizations",
			"organizations-table",
			org_name,
			"Create New Organization",
			"Edit Organization",
		),
		("/contacts", "contacts-table", f"{first_name} {last_name}", "Create New Contact", "Edit Contact"),
	]

	for path, table_id, row_text, create_text, edit_heading in coverage:
		page.goto(f"{base_url}{path}")
		expect(page.get_by_role("link", name=create_text)).to_be_visible()
		row = row_by_text(page, table_id, row_text)
		expect(row).to_be_visible()
		expect(row.get_by_role("link", name="Edit")).to_be_visible()
		expect(row.get_by_role("link", name="View")).to_have_count(0)
		row.get_by_role("link", name="Edit").click()
		expect(page.get_by_role("heading", name=edit_heading)).to_be_visible()




def test_admin_non_user_crud_smoke(base_url: str, page: Page):
	set_active_role(page, base_url, "Admin")

	org_name = unique_name("AdminSmokeOrg")
	create_organization(page, base_url, org_name)
	open_edit_for_row(page, "organizations-table", org_name)
	page.fill("#description", "Admin smoke org")
	page.get_by_role("button", name="Save").click()
	expect_flash_contains(page, "Organization updated.")

	contact_first = "Admin"
	contact_last = unique_name("SmokeContact")
	create_contact(page, base_url, contact_first, contact_last, org_name, f"{contact_last.lower()}@example.edu")
	open_edit_for_row(page, "contacts-table", contact_first)
	page.fill("#title", "Admin Smoke")
	page.get_by_role("button", name="Save").click()
	expect_flash_contains(page, "Contact updated.")

	site_name = unique_name("AdminSmokeSite")
	building_code = unique_name("AS")[:8]
	create_site(page, base_url, site_name, building_code, org_name)
	open_edit_for_row(page, "sites-table", site_name)
	page.fill("#room_number", "303")
	page.get_by_role("button", name="Save").click()
	expect_flash_contains(page, "Site updated.")

	system_name = unique_name("AdminSmokeSystem")
	create_system(
		page,
		base_url,
		name=system_name,
		site_name=site_name,
		site_building_code=building_code,
		responsible_org=org_name,
		installation_date="2026-01-01",
		status="Installed",
	)
	open_edit_for_row(page, "systems-table", system_name)
	page.fill("#description", "Admin smoke system")
	page.get_by_role("button", name="Save").click()
	expect_flash_contains(page, "System updated.")

	open_edit_for_row(page, "systems-table", system_name)
	accept_next_dialog(page)
	page.get_by_role("button", name="Delete System").click()
	expect_flash_contains(page, "System deleted.")

	page.goto(f"{base_url}/sites")
	open_edit_for_row(page, "sites-table", site_name)
	accept_next_dialog(page)
	page.get_by_role("button", name="Delete Site").click()
	expect_flash_contains(page, "Site deleted.")

	page.goto(f"{base_url}/contacts")
	open_edit_for_row(page, "contacts-table", contact_first)
	accept_next_dialog(page)
	page.get_by_role("button", name="Delete Contact").click()
	expect_flash_contains(page, "Contact deleted.")

	page.goto(f"{base_url}/organizations")
	open_edit_for_row(page, "organizations-table", org_name)
	accept_next_dialog(page)
	page.get_by_role("button", name="Delete Organization").click()
	expect_flash_contains(page, "Organization deleted.")

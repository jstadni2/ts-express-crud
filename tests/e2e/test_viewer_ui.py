from __future__ import annotations

import pytest
from playwright.sync_api import Page, expect

from tests.e2e.ui_helpers import (
	create_contact,
	create_organization,
	create_site,
	create_system,
	expect_forbidden_get,
	expect_forbidden_post,
	open_view_for_row,
	row_by_text,
	set_active_role,
	table,
	unique_name,
)


def _seed_viewer_read_data(page: Page, base_url: str) -> dict[str, str]:
	set_active_role(page, base_url, "Admin")

	org_name = unique_name("ViewerOrg")
	first_name = "Viewer"
	last_name = unique_name("Contact")
	site_name = unique_name("ViewerSite")
	building_code = unique_name("VB")[:8]
	system_name = unique_name("ViewerSystem")

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

	return {
		"organization": org_name,
		"contact": f"{first_name} {last_name}",
		"site": site_name,
		"system": system_name,
	}


def test_viewer_list_and_detail_views_are_read_only(base_url: str, page: Page):
	records = _seed_viewer_read_data(page, base_url)
	set_active_role(page, base_url, "Viewer")

	page.goto(f"{base_url}/")
	expect(page.get_by_role("link", name="Users")).to_have_count(0)

	coverage = [
		("/systems", "systems-table", records["system"], "Create New System", "System Detail"),
		("/sites", "sites-table", records["site"], "Create New Site", "Site Detail"),
		(
			"/organizations",
			"organizations-table",
			records["organization"],
			"Create New Organization",
			"Organization Detail",
		),
		("/contacts", "contacts-table", records["contact"], "Create New Contact", "Contact Detail"),
	]

	for path, table_id, row_text, create_text, detail_heading in coverage:
		page.goto(f"{base_url}{path}")
		expect(page.get_by_role("link", name="Users")).to_have_count(0)
		expect(page.get_by_role("link", name=create_text)).to_have_count(0)

		row = row_by_text(page, table_id, row_text)
		expect(row).to_be_visible()
		expect(row.get_by_role("link", name="View")).to_be_visible()
		expect(row.get_by_role("link", name="Edit")).to_have_count(0)
		open_view_for_row(page, table_id, row_text)
		expect(page.get_by_role("heading", name=detail_heading)).to_be_visible()

	page.goto(f"{base_url}/systems")
	system_row = row_by_text(page, "systems-table", records["system"])
	expect(system_row.get_by_role("button", name="Deactivate")).to_have_count(0)
	expect(system_row.get_by_role("button", name="Activate")).to_have_count(0)


@pytest.mark.parametrize(
	"path",
	[
		"/systems/new",
		"/systems/999999/edit",
		"/sites/new",
		"/sites/999999/edit",
		"/organizations/new",
		"/organizations/999999/edit",
		"/contacts/new",
		"/contacts/999999/edit",
	],
)
def test_viewer_restricted_get_urls_return_403(base_url: str, page: Page, path: str):
	set_active_role(page, base_url, "Viewer")
	expect_forbidden_get(page, base_url, path)


@pytest.mark.parametrize(
	"path",
	[
		"/systems/999999/delete",
		"/sites/999999/delete",
		"/organizations/999999/delete",
		"/contacts/999999/delete",
	],
)
def test_viewer_restricted_post_urls_return_403(base_url: str, page: Page, path: str):
	set_active_role(page, base_url, "Viewer")
	expect_forbidden_post(page, base_url, path)

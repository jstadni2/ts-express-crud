from __future__ import annotations

import pytest
import re

from playwright.sync_api import Page, expect

from tests.e2e.ui_helpers import (
    accept_next_dialog,
    click_sort,
    create_contact,
    create_organization,
    create_site,
    create_system,
    expect_forbidden_get,
    expect_forbidden_post,
    expect_flash_contains,
    expect_required_message,
    filter_table,
    goto_path,
    open_edit_for_row,
    row_by_text,
    set_active_role,
    table,
    unique_name,
    visible_column_values,
    visible_rows,
)


@pytest.fixture(autouse=True)
def maintainer_role(base_url: str, page: Page):
    set_active_role(page, base_url, "Maintainer")


def _open_system_detail_for_row(page: Page, base_url: str, row_text: str) -> None:
    row = row_by_text(page, "systems-table", row_text)
    expect(row).to_be_visible()
    edit_href = row.get_by_role("link", name="Edit").get_attribute("href")
    assert edit_href is not None
    assert edit_href.endswith("/edit")
    goto_path(page, base_url, edit_href.replace("/edit", "/detail"))


def test_contact_crud_and_messages(base_url: str, page: Page):
    org_name = unique_name("OrgForContact")
    create_organization(page, base_url, org_name)

    goto_path(page, base_url, "/contacts/new")
    page.get_by_role("button", name="Save").click()
    expect_required_message(page, "#first_name")

    goto_path(page, base_url, "/contacts/new")
    page.fill("#first_name", "Pat")
    page.get_by_role("button", name="Save").click()
    expect_required_message(page, "#last_name")
    expect(page.locator("#organization_id")).to_have_attribute("required", "")

    first_name = unique_name("Pat")
    last_name = "Maintainer"
    email = f"{first_name.lower()}@example.edu"
    create_contact(page, base_url, first_name, last_name, org_name, email)

    open_edit_for_row(page, "contacts-table", first_name)
    page.fill("#title", "Updated Title")
    page.get_by_role("button", name="Save").click()
    expect_flash_contains(page, "Contact updated.")

    open_edit_for_row(page, "contacts-table", first_name)
    page.fill("#first_name", "")
    page.get_by_role("button", name="Save").click()
    expect_required_message(page, "#first_name")

    page.fill("#first_name", first_name)
    accept_next_dialog(page)
    page.get_by_role("button", name="Delete Contact").click()
    expect_flash_contains(page, "Contact deleted.")
    expect(table(page, "contacts-table")).not_to_contain_text(first_name)


def test_organization_crud_and_delete_constraints(base_url: str, page: Page):
    parent_org = unique_name("OrgParent")
    second_org = unique_name("OrgSecond")
    third_org = unique_name("OrgThird")
    create_organization(page, base_url, parent_org)
    create_organization(page, base_url, second_org, org_type="External")
    create_organization(page, base_url, third_org)

    goto_path(page, base_url, "/organizations/new")
    page.get_by_role("button", name="Save").click()
    expect_required_message(page, "#name")

    goto_path(page, base_url, "/organizations")
    open_edit_for_row(page, "organizations-table", second_org)
    page.fill("#description", "Updated org description")
    page.get_by_role("button", name="Save").click()
    expect_flash_contains(page, "Organization updated.")

    site_name = unique_name("OrgBlockSite")
    building_code = unique_name("BC")[:8]
    create_site(page, base_url, site_name, building_code, parent_org)

    goto_path(page, base_url, "/organizations")
    open_edit_for_row(page, "organizations-table", parent_org)
    accept_next_dialog(page)
    page.get_by_role("button", name="Delete Organization").click()
    expect_flash_contains(page, "Unable to delete organization: reassign or delete owned sites first.")

    goto_path(page, base_url, "/sites")
    open_edit_for_row(page, "sites-table", site_name)
    accept_next_dialog(page)
    page.get_by_role("button", name="Delete Site").click()
    expect_flash_contains(page, "Site deleted.")

    site_name_2 = unique_name("OrgSystemSite")
    building_code_2 = unique_name("BS")[:8]
    create_site(page, base_url, site_name_2, building_code_2, third_org)
    create_system(
        page,
        base_url,
        name=unique_name("OrgRespSystem"),
        site_name=site_name_2,
        site_building_code=building_code_2,
        responsible_org=second_org,
        installation_date="2026-01-01",
        status="Installed",
    )

    goto_path(page, base_url, "/organizations")
    open_edit_for_row(page, "organizations-table", second_org)
    accept_next_dialog(page)
    page.get_by_role("button", name="Delete Organization").click()
    expect_flash_contains(page, "Unable to delete organization: remove system ownership references first.")

    free_org = unique_name("OrgDeleteOk")
    create_organization(page, base_url, free_org)
    open_edit_for_row(page, "organizations-table", free_org)
    accept_next_dialog(page)
    page.get_by_role("button", name="Delete Organization").click()
    expect_flash_contains(page, "Organization deleted.")
    expect(table(page, "organizations-table")).not_to_contain_text(free_org)


def test_site_crud_and_delete_constraint_message(base_url: str, page: Page):
    owner_org = unique_name("SiteOwner")
    create_organization(page, base_url, owner_org)

    goto_path(page, base_url, "/sites/new")
    page.get_by_role("button", name="Save").click()
    expect_required_message(page, "#site_name")
    expect(page.locator("#building_code")).to_have_attribute("required", "")
    expect(page.locator("#owner_organization_id")).to_have_attribute("required", "")

    site_name = unique_name("SiteA")
    building_code = unique_name("SA")[:8]
    create_site(page, base_url, site_name, building_code, owner_org)

    open_edit_for_row(page, "sites-table", site_name)
    page.fill("#room_number", "202")
    page.get_by_role("button", name="Save").click()
    expect_flash_contains(page, "Site updated.")

    system_name = unique_name("SiteLinkedSystem")
    create_system(
        page,
        base_url,
        name=system_name,
        site_name=site_name,
        site_building_code=building_code,
        installation_date="2026-01-01",
        status="Installed",
    )

    goto_path(page, base_url, "/sites")
    open_edit_for_row(page, "sites-table", site_name)
    accept_next_dialog(page)
    page.get_by_role("button", name="Delete Site").click()
    expect_flash_contains(page, "Unable to delete site: remove or reassign linked systems first.")

    goto_path(page, base_url, "/systems")
    open_edit_for_row(page, "systems-table", system_name)
    accept_next_dialog(page)
    page.get_by_role("button", name="Delete System").click()
    expect_flash_contains(page, "System deleted.")

    goto_path(page, base_url, "/sites")
    open_edit_for_row(page, "sites-table", site_name)
    accept_next_dialog(page)
    page.get_by_role("button", name="Delete Site").click()
    expect_flash_contains(page, "Site deleted.")


def test_system_crud_validation_and_contact_variants(base_url: str, page: Page):
    org_name = unique_name("SystemOrg")
    create_organization(page, base_url, org_name)
    contact_a_last = unique_name("Last")
    contact_b_last = unique_name("Last")
    create_contact(page, base_url, "ContactA", contact_a_last, org_name, "a@example.edu")
    create_contact(page, base_url, "ContactB", contact_b_last, org_name, "b@example.edu")

    site_name = unique_name("SystemSite")
    building_code = unique_name("SB")[:8]
    create_site(page, base_url, site_name, building_code, org_name)

    goto_path(page, base_url, "/systems/new")
    page.get_by_role("button", name="Save").click()
    expect_required_message(page, "#name")

    goto_path(page, base_url, "/systems/new")
    page.fill("#name", unique_name("NoInstallationDateSys"))
    page.fill("#system_type", "Audio-Visual")
    page.get_by_role("button", name="Save").click()
    expect_required_message(page, "#installation_date")
    expect(page.locator("#site_id")).to_have_attribute("required", "")



    no_contact_system = unique_name("NoContactSystem")
    create_system(
        page,
        base_url,
        name=no_contact_system,
        site_name=site_name,
        site_building_code=building_code,
        responsible_org=org_name,
        contact_labels=None,
        installation_date="2026-01-01",
        status="Installed",
    )

    expect(row_by_text(page, "systems-table", no_contact_system)).to_contain_text("N/A")

    contact_1 = f"ContactA {contact_a_last} ({org_name})"
    contact_2 = f"ContactB {contact_b_last} ({org_name})"
    multi_contact_system = unique_name("MultiContactSystem")
    create_system(
        page,
        base_url,
        name=multi_contact_system,
        site_name=site_name,
        site_building_code=building_code,
        responsible_org=org_name,
        contact_labels=[contact_1, contact_2],
        installation_date="2026-01-01",
        status="Installed",
    )

    system_row = row_by_text(page, "systems-table", multi_contact_system)
    expect(system_row).to_contain_text("ContactA")
    expect(system_row).to_contain_text("ContactB")

    open_edit_for_row(page, "systems-table", multi_contact_system)
    page.fill("#description", "Updated description")
    page.get_by_role("button", name="Save").click()
    expect_flash_contains(page, "System updated.")



    open_edit_for_row(page, "systems-table", multi_contact_system)
    page.fill("#name", "")
    page.get_by_role("button", name="Save").click()
    expect_required_message(page, "#name")

    page.fill("#name", multi_contact_system)
    accept_next_dialog(page)
    page.get_by_role("button", name="Delete System").click()
    expect_flash_contains(page, "System deleted.")


def test_systems_sort_and_filter_including_contacts_na(base_url: str, page: Page):
    org_name = unique_name("SortSysOrg")
    create_organization(page, base_url, org_name)
    create_contact(page, base_url, "SysSort", unique_name("One"), org_name, "syssort1@example.edu")

    site_name = unique_name("SortSysSite")
    building_code = unique_name("SS")[:8]
    create_site(page, base_url, site_name, building_code, org_name)

    create_system(
        page,
        base_url,
        name="Sort-Alpha",
        site_name=site_name,
        site_building_code=building_code,
        installation_date="2026-01-01",
        status="Installed",
    )
    create_system(
        page,
        base_url,
        name="Sort-Zulu",
        site_name=site_name,
        site_building_code=building_code,
        installation_date="2026-01-02",
        status="Installed",
    )
    responsible_org_name = unique_name("SortResponsibleOrg")
    create_organization(page, base_url, responsible_org_name)
    filter_system_name = unique_name("FilterTargetSystem")
    create_system(
        page,
        base_url,
        name=filter_system_name,
        site_name=site_name,
        site_building_code=building_code,
        responsible_org=responsible_org_name,
        installation_date="2026-01-01",
        status="Installed",
    )

    goto_path(page, base_url, "/systems")
    click_sort(page, "systems-table", "name", times=1)
    names_asc = visible_column_values(page, "systems-table", "name")
    assert names_asc == sorted(names_asc, key=str.lower)

    click_sort(page, "systems-table", "installation_date", times=1)
    date_values = visible_column_values(page, "systems-table", "installation_date")
    # Convert to comparable format for sorting check
    parsed_dates = [value for value in date_values if value != 'N/A']
    assert parsed_dates == sorted(parsed_dates)

    filter_table(page, "systems-table", "contacts", "N/A")
    rows = visible_rows(page, "systems-table")
    assert len(rows) > 0
    for row in rows:
        expect(row).to_contain_text("N/A")

    # 3rd sort click returns column to unsorted state
    goto_path(page, base_url, "/systems")
    click_sort(page, "systems-table", "name", times=3)
    expect(table(page, "systems-table").get_by_test_id("column-name")).to_have_attribute("aria-sort", "none")

    # filter by site and type columns
    goto_path(page, base_url, "/systems")
    filter_table(page, "systems-table", "site", site_name)
    rows = visible_rows(page, "systems-table")
    assert len(rows) > 0
    for row in rows:
        expect(row).to_contain_text(site_name)

    goto_path(page, base_url, "/systems")
    filter_table(page, "systems-table", "type", "Audio-Visual")
    rows = visible_rows(page, "systems-table")
    assert len(rows) > 0
    for row in rows:
        expect(row).to_contain_text("Audio-Visual")

    goto_path(page, base_url, "/systems")
    filter_table(page, "systems-table", "name", filter_system_name)
    rows = visible_rows(page, "systems-table")
    assert len(rows) > 0
    for row in rows:
        expect(row).to_contain_text(filter_system_name)

    goto_path(page, base_url, "/systems")
    filter_table(page, "systems-table", "responsible_org", responsible_org_name)
    rows = visible_rows(page, "systems-table")
    assert len(rows) > 0
    for row in rows:
        expect(row).to_contain_text(responsible_org_name)
    expect(row_by_text(page, "systems-table", filter_system_name)).to_be_visible()


def test_logout_visible_on_authenticated_pages(base_url: str, page: Page):
    set_active_role(page, base_url, "Maintainer")
    org_name = unique_name("LogoutOrg")
    site_name = unique_name("LogoutSite")
    building_code = unique_name("LG")[:8]
    system_name = unique_name("LogoutSystem")

    create_organization(page, base_url, org_name)
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

    for path in ["/", "/systems", "/sites", "/organizations", "/contacts"]:
        goto_path(page, base_url, path)
        expect(page.get_by_role("link", name="Logout")).to_be_visible()
        expect(page.get_by_role("link", name="Login")).to_have_count(0)

    goto_path(page, base_url, "/systems")
    _open_system_detail_for_row(page, base_url, system_name)
    expect(page.get_by_role("link", name="Logout")).to_be_visible()
    expect(page.get_by_role("link", name="Login")).to_have_count(0)


def test_system_detail_displays_owner_contact_and_location(base_url: str, page: Page):
    owner_org = unique_name("DetailOwnerOrg")
    responsible_org = unique_name("DetailResponsibleOrg")
    create_organization(page, base_url, owner_org)
    create_organization(page, base_url, responsible_org)

    first_name = "Detail"
    last_name = unique_name("Contact")
    create_contact(page, base_url, first_name, last_name, owner_org, "detail-contact@example.edu")

    site_name = unique_name("DetailSite")
    building_code = unique_name("DL")[:8]
    create_site(page, base_url, site_name, building_code, owner_org)

    system_name = unique_name("DetailSystem")
    contact_label = f"{first_name} {last_name} ({owner_org})"
    create_system(
        page,
        base_url,
        name=system_name,
        site_name=site_name,
        site_building_code=building_code,
        responsible_org=responsible_org,
        installation_date="2026-01-01",
        warranty_expiry_date="2029-01-01",
        installer_org=owner_org,
        equipment_condition="Good",
        status="Installed",
        contact_labels=[contact_label],
    )

    goto_path(page, base_url, "/systems")
    _open_system_detail_for_row(page, base_url, system_name)

    expect(page.get_by_role("heading", name="System Detail")).to_be_visible()
    expect(page.locator("dt", has_text="Installation Date").locator("xpath=following-sibling::dd[1]")).to_contain_text(
        "2026-01-01"
    )
    expect(page.locator("dt", has_text="Warranty Expiry Date").locator("xpath=following-sibling::dd[1]")).to_contain_text(
        "2029-01-01"
    )
    expect(page.locator("dt", has_text="Installer Organization").locator("xpath=following-sibling::dd[1]")).to_contain_text(
        owner_org
    )
    expect(page.locator("dt", has_text="Equipment Condition").locator("xpath=following-sibling::dd[1]")).to_contain_text(
        "Good"
    )
    expect(page.locator("dt", has_text="Status").locator("xpath=following-sibling::dd[1]")).to_contain_text(
        "Installed"
    )
    expect(page.locator("dt", has_text="Responsible Organization").locator("xpath=following-sibling::dd[1]")).to_contain_text(
        responsible_org
    )
    site_cell = page.locator("dt", has_text="Site").locator("xpath=following-sibling::dd[1]")
    expect(site_cell).to_contain_text(site_name)
    expect(site_cell).to_contain_text(building_code)
    contacts_cell = page.locator("dt", has_text="System Contacts").locator("xpath=following-sibling::dd[1]")
    expect(contacts_cell).to_contain_text(first_name)
    expect(contacts_cell).to_contain_text(last_name)


def test_sites_sort_and_filter(base_url: str, page: Page):
    org_name = unique_name("SortSiteOrg")
    site_alpha = unique_name("SiteAlpha")
    site_zulu = unique_name("SiteZulu")
    building_alpha = unique_name("A100")[:8]
    building_zulu = unique_name("Z900")[:8]
    create_organization(page, base_url, org_name)
    create_site(page, base_url, site_alpha, building_alpha, org_name)
    create_site(page, base_url, site_zulu, building_zulu, org_name)

    goto_path(page, base_url, "/sites")
    click_sort(page, "sites-table", "site_name", times=1)
    site_names = visible_column_values(page, "sites-table", "site-name")
    assert site_names == sorted(site_names, key=str.lower)

    filter_table(page, "sites-table", "building_code", building_alpha)
    rows = visible_rows(page, "sites-table")
    assert len(rows) > 0
    for row in rows:
        expect(row).to_contain_text(building_alpha)
    expect(rows[0]).to_contain_text(site_alpha)

    # 2nd sort click gives descending order
    goto_path(page, base_url, "/sites")
    click_sort(page, "sites-table", "site_name", times=2)
    names_desc = visible_column_values(page, "sites-table", "site-name")
    assert names_desc == sorted(names_desc, key=str.lower, reverse=True)

    # 3rd sort click returns column to unsorted state
    click_sort(page, "sites-table", "site_name", times=1)
    expect(table(page, "sites-table").get_by_test_id("column-site_name")).to_have_attribute("aria-sort", "none")

    # filter by site_name and owner_org columns
    goto_path(page, base_url, "/sites")
    filter_table(page, "sites-table", "site_name", site_alpha)
    rows = visible_rows(page, "sites-table")
    assert len(rows) > 0
    for row in rows:
        expect(row).to_contain_text(site_alpha)

    goto_path(page, base_url, "/sites")
    filter_table(page, "sites-table", "owner_org", org_name)
    rows = visible_rows(page, "sites-table")
    assert len(rows) > 0
    for row in rows:
        expect(row).to_contain_text(org_name)


def test_organizations_sort_and_filter(base_url: str, page: Page):
    org_alpha = unique_name("OrgAlpha")
    org_zulu = unique_name("OrgZulu")
    create_organization(page, base_url, org_alpha, org_type="Internal")
    create_organization(page, base_url, org_zulu, org_type="External")

    goto_path(page, base_url, "/organizations")
    click_sort(page, "organizations-table", "name", times=1)
    org_names = visible_column_values(page, "organizations-table", "name")
    assert org_names == sorted(org_names, key=str.lower)

    filter_table(page, "organizations-table", "type", "External")
    rows = visible_rows(page, "organizations-table")
    assert len(rows) > 0
    for row in rows:
        expect(row).to_contain_text("External")

    # 2nd sort click gives descending order
    goto_path(page, base_url, "/organizations")
    click_sort(page, "organizations-table", "name", times=2)
    org_names_desc = visible_column_values(page, "organizations-table", "name")
    assert org_names_desc == sorted(org_names_desc, key=str.lower, reverse=True)

    # 3rd sort click returns column to unsorted state
    click_sort(page, "organizations-table", "name", times=1)
    expect(table(page, "organizations-table").get_by_test_id("column-name")).to_have_attribute("aria-sort", "none")

    # filter by name and description columns
    goto_path(page, base_url, "/organizations")
    filter_table(page, "organizations-table", "name", org_alpha)
    rows = visible_rows(page, "organizations-table")
    assert len(rows) > 0
    for row in rows:
        expect(row).to_contain_text(org_alpha)

    goto_path(page, base_url, "/organizations")
    filter_table(page, "organizations-table", "description", org_alpha)
    rows = visible_rows(page, "organizations-table")
    assert len(rows) > 0
    for row in rows:
        expect(row).to_contain_text(org_alpha)


def test_systems_multi_column_filter(base_url: str, page: Page):
    org_name = unique_name("MultiFilterOrg")
    create_organization(page, base_url, org_name)
    site_name = unique_name("MultiFilterSite")
    building_code = unique_name("MF")[:8]
    create_site(page, base_url, site_name, building_code, org_name)

    # unique prefix ensures name filter only matches systems created by this test
    mf_prefix = unique_name("MF")
    create_system(page, base_url, name=f"{mf_prefix}-Active", site_name=site_name, site_building_code=building_code,
                   installation_date="2026-01-01", status="Installed")
    create_system(page, base_url, name=f"{mf_prefix}-Inactive", site_name=site_name, site_building_code=building_code,
                   installation_date="2026-01-01", status="Retired")
    create_system(page, base_url, name=unique_name("Other"), site_name=site_name, site_building_code=building_code,
                   installation_date="2026-01-01", status="Installed")

    goto_path(page, base_url, "/systems")
    filter_table(page, "systems-table", "name", mf_prefix)
    multi_rows = visible_rows(page, "systems-table")
    assert len(multi_rows) == 2
    for row in multi_rows:
        expect(row).to_contain_text(mf_prefix)

    # second filter applied simultaneously — AND with the name filter already active
    filter_table(page, "systems-table", "status", "Installed")
    final_rows = visible_rows(page, "systems-table")
    assert len(final_rows) == 1
    expect(final_rows[0]).to_contain_text(f"{mf_prefix}-Active")


def test_contacts_sort_and_filter(base_url: str, page: Page):
    org_name = unique_name("SortContactOrg")
    email_alpha = f"{unique_name('alpha')}@example.edu"
    email_zulu = f"{unique_name('zulu')}@example.edu"
    create_organization(page, base_url, org_name)
    create_contact(page, base_url, "Aaron", "Alpha", org_name, email_alpha)
    create_contact(page, base_url, "Zoe", "Zulu", org_name, email_zulu)

    goto_path(page, base_url, "/contacts")
    click_sort(page, "contacts-table", "name", times=1)
    contact_names = visible_column_values(page, "contacts-table", "name")
    assert contact_names == sorted(contact_names, key=str.lower)

    filter_table(page, "contacts-table", "email", email_zulu)
    rows = visible_rows(page, "contacts-table")
    assert len(rows) > 0
    for row in rows:
        expect(row).to_contain_text(email_zulu)


def test_deletion_reassign_before_parent_delete(base_url: str, page: Page):
    # Reassign system to a different site → unblock site deletion
    org_a = unique_name("ReassignOrgA")
    create_organization(page, base_url, org_a)
    site_a = unique_name("ReassignSiteA")
    bc_a = unique_name("RA")[:8]
    site_b = unique_name("ReassignSiteB")
    bc_b = unique_name("RB")[:8]
    create_site(page, base_url, site_a, bc_a, org_a)
    create_site(page, base_url, site_b, bc_b, org_a)
    sys_name = unique_name("ReassignSystem")
    create_system(
        page,
        base_url,
        name=sys_name,
        site_name=site_a,
        site_building_code=bc_a,
        installation_date="2026-01-01",
        status="Installed",
    )

    goto_path(page, base_url, "/sites")
    open_edit_for_row(page, "sites-table", site_a)
    accept_next_dialog(page)
    page.get_by_role("button", name="Delete Site").click()
    expect_flash_contains(page, "Unable to delete site: remove or reassign linked systems first.")

    goto_path(page, base_url, "/systems")
    open_edit_for_row(page, "systems-table", sys_name)
    page.select_option("#site_id", label=f"{site_b} ({bc_b})")
    page.get_by_role("button", name="Save").click()
    expect_flash_contains(page, "System updated.")

    goto_path(page, base_url, "/sites")
    open_edit_for_row(page, "sites-table", site_a)
    accept_next_dialog(page)
    page.get_by_role("button", name="Delete Site").click()
    expect_flash_contains(page, "Site deleted.")

    # Reassign site to a different org → unblock org deletion
    org_p = unique_name("ReassignOrgP")
    org_q = unique_name("ReassignOrgQ")
    create_organization(page, base_url, org_p)
    create_organization(page, base_url, org_q)
    site_p = unique_name("ReassignSiteP")
    bc_p = unique_name("RP")[:8]
    create_site(page, base_url, site_p, bc_p, org_p)

    goto_path(page, base_url, "/organizations")
    open_edit_for_row(page, "organizations-table", org_p)
    accept_next_dialog(page)
    page.get_by_role("button", name="Delete Organization").click()
    expect_flash_contains(page, "Unable to delete organization: reassign or delete owned sites first.")

    goto_path(page, base_url, "/sites")
    open_edit_for_row(page, "sites-table", site_p)
    page.select_option("#owner_organization_id", label=org_q)
    page.get_by_role("button", name="Save").click()
    expect_flash_contains(page, "Site updated.")

    goto_path(page, base_url, "/organizations")
    open_edit_for_row(page, "organizations-table", org_p)
    accept_next_dialog(page)
    page.get_by_role("button", name="Delete Organization").click()
    expect_flash_contains(page, "Organization deleted.")




def test_list_view_columns(base_url: str, page: Page):
    expected = {
        "/systems": [
            "name", "type", "contacts", "installation_date", "warranty_expiry_date", "site",
            "responsible_org", "installer_org", "equipment_condition", "status", "last_updated", "action",
        ],
        "/sites": ["site_name", "building_code", "ownership", "status", "owner_org", "room_number", "action"],
        "/organizations": ["name", "type", "description", "action"],
        "/contacts": ["name", "title", "email", "phone", "organization", "action"],
    }

    for path, col_keys in expected.items():
        table_id = path.lstrip("/") + "-table"
        goto_path(page, base_url, path)
        for col_key in col_keys:
            expect(table(page, table_id).get_by_test_id(f"column-{col_key}")).to_be_visible()



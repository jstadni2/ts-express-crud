/**
 * Column definitions for the sort/filter tables. Port of the inline `columns`
 * lists in the Jinja2 list templates; templates only reference these shapes.
 */
export interface TableColumn {
  label: string;
  key: string;
  sort_type: "text" | "date" | "number";
  sortable: boolean;
  filterable: boolean;
}

function textColumn(label: string, key: string): TableColumn {
  return { label, key, sort_type: "text", sortable: true, filterable: true };
}

function dateColumn(label: string, key: string): TableColumn {
  return { label, key, sort_type: "date", sortable: true, filterable: true };
}

function actionColumn(): TableColumn {
  return { label: "Action", key: "action", sort_type: "text", sortable: false, filterable: false };
}

export const SYSTEM_COLUMNS: TableColumn[] = [
  textColumn("Name", "name"),
  textColumn("Type", "type"),
  textColumn("Contacts", "contacts"),
  dateColumn("Installation Date", "installation_date"),
  dateColumn("Warranty Expiry", "warranty_expiry_date"),
  textColumn("Site", "site"),
  textColumn("Responsible Organization", "responsible_org"),
  textColumn("Installer Organization", "installer_org"),
  textColumn("Equipment Condition", "equipment_condition"),
  textColumn("Status", "status"),
  dateColumn("Last Updated", "last_updated"),
  actionColumn(),
];

export const SITE_COLUMNS: TableColumn[] = [
  textColumn("Site Name", "site_name"),
  textColumn("Building Code", "building_code"),
  textColumn("Ownership", "ownership"),
  textColumn("Status", "status"),
  textColumn("Owner Organization", "owner_org"),
  textColumn("Room Number(s)", "room_number"),
  actionColumn(),
];

export const ORGANIZATION_COLUMNS: TableColumn[] = [
  textColumn("Name", "name"),
  textColumn("Type", "type"),
  textColumn("Description", "description"),
  actionColumn(),
];

export const CONTACT_COLUMNS: TableColumn[] = [
  textColumn("Name", "name"),
  textColumn("Title", "title"),
  textColumn("Email", "email"),
  textColumn("Phone", "phone"),
  textColumn("Organization", "organization"),
  actionColumn(),
];

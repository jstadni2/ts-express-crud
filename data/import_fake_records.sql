-- Import fake organizations, contacts, and systems for local development.
-- Prerequisites: sites must already be loaded (make import-sites).
-- Run once; re-running will fail on the unique constraint for organization names.

BEGIN;

-- Step 1: organizations (no FK dependencies)
CREATE TEMP TABLE _import_orgs (
    name        text,
    org_type    text,
    description text
);

\copy _import_orgs FROM 'data/fake_organizations.csv' CSV HEADER

INSERT INTO organizations (name, org_type, description)
SELECT
    name,
    UPPER(org_type)::organizationtype,
    NULLIF(description, '')
FROM _import_orgs;

-- Step 2: contacts (depends on organizations)
CREATE TEMP TABLE _import_contacts (
    first_name        text,
    last_name         text,
    title             text,
    email             text,
    phone             text,
    organization_name text
);

\copy _import_contacts FROM 'data/fake_contacts.csv' CSV HEADER

INSERT INTO contacts (first_name, last_name, title, email, phone, organization_id)
SELECT
    c.first_name,
    c.last_name,
    NULLIF(c.title, ''),
    NULLIF(c.email, ''),
    NULLIF(c.phone, ''),
    o.id
FROM _import_contacts c
JOIN organizations o ON o.name = c.organization_name;

-- Step 3: systems (depends on sites already in DB and organizations inserted above)
CREATE TEMP TABLE _import_systems (
    name                          text,
    system_type                   text,
    description                   text,
    installation_date             text,
    warranty_expiry_date          text,
    installer_organization_name   text,
    equipment_condition           text,
    status                        text,
    building_code                 text,
    responsible_organization_name text
);

\copy _import_systems FROM 'data/fake_systems.csv' CSV HEADER

INSERT INTO systems (
    name,
    system_type,
    description,
    installation_date,
    warranty_expiry_date,
    installer_organization_id,
    equipment_condition,
    status,
    site_id,
    responsible_organization_id,
    last_updated
)
SELECT
    s.name,
    s.system_type,
    NULLIF(s.description, ''),
    COALESCE(NULLIF(s.installation_date, '')::date, CURRENT_DATE),
    NULLIF(s.warranty_expiry_date, '')::date,
    inst.id,
    NULLIF(s.equipment_condition, ''),
    UPPER(s.status)::installationstatus,
    site.id,
    resp.id,
    NOW()
FROM _import_systems s
JOIN sites site ON site.building_code = s.building_code
JOIN organizations inst ON inst.name = s.installer_organization_name
JOIN organizations resp ON resp.name = s.responsible_organization_name;

-- Step 4: system_contacts junction — link each system to its primary contact
-- Note: We no longer have primary_contact_email in the systems CSV, so we skip this step for now.
-- If we want to keep system_contacts, we would need to add a column for contact email in the CSV.
-- For the purpose of this update, we will not create any system_contacts.
-- COMMENTED OUT: 
-- INSERT INTO system_contacts (system_id, contact_id)
-- SELECT sys.id, con.id
-- FROM _import_systems s
-- JOIN systems sys ON sys.name = s.name
-- JOIN contacts con ON con.email = s.primary_contact_email
-- WHERE s.primary_contact_email <> '';

COMMIT;
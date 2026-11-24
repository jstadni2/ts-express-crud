BEGIN;

-- TODO: For production import, map actual organizations to F&S sites
INSERT INTO organizations (name, org_type, description)
VALUES ('University of Illinois', 'INTERNAL', 'Default organization for university buildings.');

CREATE TEMP TABLE _import_sites (
    building_code text,
    site_name     text,
    address_line1 text,
    address_line2 text,
    city          text,
    state         text,
    postal_code   text,
    ownership     text,
    status        text
);

\copy _import_sites FROM 'data/building_list_report-2026_08.csv' CSV HEADER

INSERT INTO sites (
    building_code,
    site_name,
    address_line1,
    address_line2,
    city,
    state,
    postal_code,
    country,
    ownership,
    status,
    owner_organization_id
)
SELECT
    building_code,
    site_name,
    address_line1,
    NULLIF(address_line2, ''),
    city,
    state,
    postal_code,
    'US',
    UPPER(ownership)::siteownership,
    UPPER(status)::sitestatus,
    1
FROM _import_sites;

COMMIT;

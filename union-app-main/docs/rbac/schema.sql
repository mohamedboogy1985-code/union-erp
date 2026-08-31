-- =====================================================================
-- AI-UFAI - نظام الإدارة المالية والمحاسبية الذكي
-- النقابة العامة للبناء والأخشاب
-- Phase 0: قاعدة البيانات المرجعية للتشريعات
-- Phase 1: Foundation - الهيكل التنظيمي + الهوية + الصلاحيات
-- =====================================================================

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------
-- Phase 0: المرجعيات القانونية
-- ---------------------------------------------------------------------

CREATE TABLE legal_documents (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    document_name   TEXT NOT NULL,
    number          TEXT,
    year            INTEGER,
    type            TEXT NOT NULL CHECK (type IN ('LAW','AMENDMENT','MINISTERIAL_DECREE','BYLAW','INTERNAL_POLICY')),
    source_file     TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE legal_references (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    legal_document_id   INTEGER NOT NULL REFERENCES legal_documents(id) ON DELETE CASCADE,
    article_number      TEXT,
    page_number         INTEGER,
    title               TEXT NOT NULL,
    text_excerpt        TEXT,
    effective_from      TEXT,
    effective_to        TEXT,
    created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE legal_versions (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    legal_reference_id  INTEGER NOT NULL REFERENCES legal_references(id) ON DELETE CASCADE,
    version_number      INTEGER NOT NULL,
    effective_from      TEXT NOT NULL,
    effective_to        TEXT,
    status              TEXT NOT NULL CHECK (status IN ('DRAFT','ACTIVE','SUPERSEDED','REPEALED')) DEFAULT 'DRAFT',
    created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_legal_references_doc ON legal_references(legal_document_id);
CREATE INDEX idx_legal_versions_ref ON legal_versions(legal_reference_id);

-- ---------------------------------------------------------------------
-- Phase 1: الهيكل التنظيمي (Geography)
-- ---------------------------------------------------------------------

CREATE TABLE governorates (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    name    TEXT NOT NULL UNIQUE
);

CREATE TABLE cities (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    governorate_id  INTEGER NOT NULL REFERENCES governorates(id) ON DELETE RESTRICT,
    name            TEXT NOT NULL,
    UNIQUE(governorate_id, name)
);

CREATE TABLE districts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    city_id     INTEGER NOT NULL REFERENCES cities(id) ON DELETE RESTRICT,
    name        TEXT NOT NULL,
    UNIQUE(city_id, name)
);

CREATE INDEX idx_cities_governorate ON cities(governorate_id);
CREATE INDEX idx_districts_city ON districts(city_id);

-- ---------------------------------------------------------------------
-- Phase 1: الوحدات التنظيمية (النقابة العامة / اللجان / المكاتب)
-- ---------------------------------------------------------------------

CREATE TABLE organizational_units (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_id       INTEGER REFERENCES organizational_units(id) ON DELETE RESTRICT,
    name            TEXT NOT NULL,
    unit_type       TEXT NOT NULL CHECK (unit_type IN ('UNION','COMMITTEE','OFFICE')),
    governorate_id  INTEGER REFERENCES governorates(id) ON DELETE RESTRICT,
    city_id         INTEGER REFERENCES cities(id) ON DELETE RESTRICT,
    cost_center_code TEXT UNIQUE,
    is_active       INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_org_units_parent ON organizational_units(parent_id);
CREATE INDEX idx_org_units_governorate ON organizational_units(governorate_id);
CREATE INDEX idx_org_units_type ON organizational_units(unit_type);

-- ---------------------------------------------------------------------
-- Phase 1: الهوية والصلاحيات (Identity & RBAC)
-- ---------------------------------------------------------------------

CREATE TABLE roles (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    code        TEXT NOT NULL UNIQUE,
    name_ar     TEXT NOT NULL,
    description TEXT
);

CREATE TABLE permissions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    code        TEXT NOT NULL UNIQUE,
    name_ar     TEXT NOT NULL,
    module      TEXT NOT NULL
);

CREATE TABLE role_permissions (
    role_id         INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id   INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE users (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    username        TEXT NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    full_name       TEXT NOT NULL,
    unit_id         INTEGER REFERENCES organizational_units(id) ON DELETE RESTRICT,
    email           TEXT,
    is_active       INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
    must_change_password INTEGER NOT NULL DEFAULT 1 CHECK (must_change_password IN (0,1)),
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    last_login_at   TEXT
);

CREATE TABLE user_roles (
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id     INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, role_id)
);

CREATE INDEX idx_users_unit ON users(unit_id);

-- ---------------------------------------------------------------------
-- Phase 1: سجل التدقيق (Audit) - أساسي من أول يوم، كل تعديل لازم يتسجل
-- ---------------------------------------------------------------------

CREATE TABLE audit_logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action      TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id   INTEGER,
    details     TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);

-- ---------------------------------------------------------------------
-- Schema version - لتتبع الترحيلات (migrations) المستقبلية
-- ---------------------------------------------------------------------
CREATE TABLE schema_meta (
    key     TEXT PRIMARY KEY,
    value   TEXT NOT NULL
);
INSERT INTO schema_meta (key, value) VALUES ('schema_version', '0001_phase0_phase1');

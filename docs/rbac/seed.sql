-- =====================================================================
-- Seed Data - RBAC System for UnionERP
-- النقابة العامة للبناء والأخشاب
-- =====================================================================

-- المحافظات والمدن (نماذج أولية - تُستكمل لاحقًا وفق القائمة الفعلية للنقابة)
INSERT INTO governorates (name) VALUES ('القاهرة'), ('الجيزة'), ('الإسكندرية');

INSERT INTO cities (governorate_id, name) VALUES
    ((SELECT id FROM governorates WHERE name = 'القاهرة'), 'وسط القاهرة'),
    ((SELECT id FROM governorates WHERE name = 'الجيزة'), 'الجيزة'),
    ((SELECT id FROM governorates WHERE name = 'الإسكندرية'), 'وسط الإسكندرية');

-- الهيكل التنظيمي: النقابة العامة كجذر، ثم لجنة ومكتب تجريبيين
INSERT INTO organizational_units (parent_id, name, unit_type, governorate_id, city_id, cost_center_code, is_active)
VALUES (NULL, 'النقابة العامة للبناء والأخشاب', 'UNION',
        (SELECT id FROM governorates WHERE name = 'القاهرة'),
        (SELECT id FROM cities WHERE name = 'وسط القاهرة'),
        'UN-000', 1);

INSERT INTO organizational_units (parent_id, name, unit_type, governorate_id, city_id, cost_center_code, is_active)
VALUES (
    (SELECT id FROM organizational_units WHERE cost_center_code = 'UN-000'),
    'لجنة نقابية - القاهرة (تجريبي)', 'COMMITTEE',
    (SELECT id FROM governorates WHERE name = 'القاهرة'),
    (SELECT id FROM cities WHERE name = 'وسط القاهرة'),
    'CM-001', 1
);

INSERT INTO organizational_units (parent_id, name, unit_type, governorate_id, city_id, cost_center_code, is_active)
VALUES (
    (SELECT id FROM organizational_units WHERE cost_center_code = 'UN-000'),
    'مكتب شئون عضوية - الجيزة (تجريبي)', 'OFFICE',
    (SELECT id FROM governorates WHERE name = 'الجيزة'),
    (SELECT id FROM cities WHERE name = 'الجيزة'),
    'OF-001', 1
);

-- الأدوار الفعلية للنظام (مطابقة لـ permissions.ts)
INSERT INTO roles (code, name_ar, description) VALUES
    ('PROGRAM_MANAGER', 'مدير البرنامج', 'جميع الصلاحيات: التسجيل والاعتماد والترحيل والإعدادات'),
    ('JOURNAL_ACCOUNTANT', 'محاسب يومية', 'التسجيل بشاشة اليومية فقط، مع الاطلاع على جميع الشاشات والبحث وطباعة التقارير'),
    ('HEAD_OF_ACCOUNTS', 'رئيس الحسابات', 'الاطلاع على جميع الشاشات والبحث وطباعة أي تقارير'),
    ('PRESIDENT', 'رئيس النقابة العامة', 'الاطلاع على جميع الشاشات والبحث وطباعة جميع التقارير'),
    ('SYSTEM_ADMIN', 'مدير النظام', 'جميع الصلاحيات (تجريبي)'),
    ('CHIEF_FINANCIAL_OFFICER', 'المدير المالي', 'جميع الصلاحيات المالية (تجريبي)'),
    ('GENERAL_ACCOUNTANT', 'محاسب عام', 'التسجيل اليومي (تجريبي)'),
    ('COLLECTION_OFFICER', 'مسؤول التحصيل', 'إصدار السندات (تجريبي)'),
    ('INTERNAL_AUDITOR', 'مدقق داخلي', 'الاطلاع والتدقيق (تجريبي)');

-- الصلاحيات الفعلية للنظام (مطابقة لـ permissions.ts)
INSERT INTO permissions (code, name_ar, module) VALUES
    ('view:all', 'عرض جميع البيانات', 'DATA'),
    ('search:all', 'بحث في جميع البيانات', 'DATA'),
    ('print:all', 'طباعة جميع التقارير', 'DATA'),
    ('journal:create', 'إنشاء قيود يومية', 'JOURNAL'),
    ('journal:workflow', 'اعتماد وترحيل القيود', 'JOURNAL'),
    ('accounts:manage', 'إدارة دليل الحسابات', 'ACCOUNTS'),
    ('subledger:manage', 'إدارة الأطراف الدفترية', 'ACCOUNTS'),
    ('members:manage', 'إدارة الأعضاء', 'MEMBERS'),
    ('hr:manage', 'إدارة شؤون الموظفين', 'HR'),
    ('receipts:issue', 'إصدار سندات القبض', 'RECEIPTS'),
    ('documents:manage', 'إدارة المستندات', 'DOCUMENTS'),
    ('periods:manage', 'إدارة الفترات المالية', 'PERIODS'),
    ('import:execute', 'استيراد البيانات', 'IMPORT'),
    ('system:admin', 'إدارة النظام', 'SYSTEM');

-- تعيين الصلاحيات للأدوار
-- PROGRAM_MANAGER: جميع الصلاحيات
INSERT INTO role_permissions (role_id, permission_id)
SELECT (SELECT id FROM roles WHERE code = 'PROGRAM_MANAGER'), id FROM permissions;

-- JOURNAL_ACCOUNTANT: عرض + بحث + طباعة + إنشاء قيود
INSERT INTO role_permissions (role_id, permission_id)
SELECT (SELECT id FROM roles WHERE code = 'JOURNAL_ACCOUNTANT'), id FROM permissions
WHERE code IN ('view:all', 'search:all', 'print:all', 'journal:create');

-- HEAD_OF_ACCOUNTS: عرض + بحث + طباعة فقط
INSERT INTO role_permissions (role_id, permission_id)
SELECT (SELECT id FROM roles WHERE code = 'HEAD_OF_ACCOUNTS'), id FROM permissions
WHERE code IN ('view:all', 'search:all', 'print:all');

-- PRESIDENT: عرض + بحث + طباعة فقط
INSERT INTO role_permissions (role_id, permission_id)
SELECT (SELECT id FROM roles WHERE code = 'PRESIDENT'), id FROM permissions
WHERE code IN ('view:all', 'search:all', 'print:all');

-- SYSTEM_ADMIN: جميع الصلاحيات
INSERT INTO role_permissions (role_id, permission_id)
SELECT (SELECT id FROM roles WHERE code = 'SYSTEM_ADMIN'), id FROM permissions;

-- CHIEF_FINANCIAL_OFFICER: جميع الصلاحيات المالية
INSERT INTO role_permissions (role_id, permission_id)
SELECT (SELECT id FROM roles WHERE code = 'CHIEF_FINANCIAL_OFFICER'), id FROM permissions;

-- GENERAL_ACCOUNTANT: عرض + بحث + طباعة + إنشاء قيود
INSERT INTO role_permissions (role_id, permission_id)
SELECT (SELECT id FROM roles WHERE code = 'GENERAL_ACCOUNTANT'), id FROM permissions
WHERE code IN ('view:all', 'search:all', 'print:all', 'journal:create');

-- COLLECTION_OFFICER: عرض + بحث + طباعة + إصدار سندات
INSERT INTO role_permissions (role_id, permission_id)
SELECT (SELECT id FROM roles WHERE code = 'COLLECTION_OFFICER'), id FROM permissions
WHERE code IN ('view:all', 'search:all', 'print:all', 'receipts:issue');

-- INTERNAL_AUDITOR: عرض + بحث + طباعة فقط
INSERT INTO role_permissions (role_id, permission_id)
SELECT (SELECT id FROM roles WHERE code = 'INTERNAL_AUDITOR'), id FROM permissions
WHERE code IN ('view:all', 'search:all', 'print:all');

-- المرجعيات القانونية الأساسية
INSERT INTO legal_documents (document_name, number, year, type, source_file) VALUES
    ('قانون النقابات العمالية', '213', 2017, 'LAW', NULL),
    ('تعديل قانون النقابات العمالية', '142', 2019, 'AMENDMENT', NULL),
    ('قرار وزير القوى العاملة بشأن اللائحة التنفيذية', '35', 2018, 'MINISTERIAL_DECREE', NULL);

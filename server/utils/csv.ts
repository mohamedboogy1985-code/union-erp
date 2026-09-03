/**
 * محلل CSV عربي مرن (IMPROVEMENTS: استيراد بيانات حقيقية)
 * - كشف تلقائي للمحدد (, أو ; أو \t)
 * - دعم BOM وفواصل أسطر Windows (\r\n) وعلامات التنصيص
 */
export function parseCsv(csvText: string): string[][] {
  if (!csvText) return [];

  // إزالة BOM وتوحيد الأسطر
  let text = csvText.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // كشف المحدد الأكثر تكراراً في السطر الأول غير الفارغ
  const firstLine = text.split('\n').find((l) => l.trim().length > 0) || '';
  const candidates = [',', ';', '\t'];
  let delimiter = ',';
  let maxCount = 0;
  for (const d of candidates) {
    const count = firstLine.split(d).length - 1;
    if (count > maxCount) {
      maxCount = count;
      delimiter = d;
    }
  }

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field.trim());
      field = '';
    } else if (ch === '\n') {
      row.push(field.trim());
      if (row.some((c) => c.length > 0)) rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }

  // آخر حقل/سطر
  row.push(field.trim());
  if (row.some((c) => c.length > 0)) rows.push(row);

  return rows;
}

/** تحويل الصفوف إلى كائنات باستخدام صف الرؤوس */
export function parseCsvToObjects(csvText: string): Record<string, string>[] {
  const rows = parseCsv(csvText);
  if (rows.length < 2) return [];

  const headers = rows[0].map((h) => h.trim());
  const objects: Record<string, string>[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = (row[idx] ?? '').trim();
    });
    objects.push(obj);
  }

  return objects;
}

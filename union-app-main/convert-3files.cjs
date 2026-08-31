const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

const ROOT = 'C:/Users/HP/Downloads/union-app-main/union-app-main/';
const DATA = ROOT + 'server/data/';

function esc(v) {
  const s = v == null ? '' : String(v);
  return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function toDateStr(v) {
  if (v instanceof Date) {
    const d = v.toISOString().slice(0, 10);
    return d;
  }
  return v == null ? '' : String(v);
}

async function convertForms() {
  // ============ 1) بيانات.xlsx → 3 ملفات (لجان الشركات / اللجان المهنية / مكاتب العضوية) ============
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(ROOT + 'بيانات.xlsx');
  const ws = wb.getWorksheet('بيانات');

  const company = new Set();
  const professional = new Set();
  const offices = new Set();

  let section = null; // 'company' | 'professional' | 'offices' | null
  ws.eachRow((row) => {
    const name = (row.getCell(2).value || '').toString().trim();
    const num = (row.getCell(1).value || '').toString().trim();
    if (/اللجان\s*النقابية\s*المهنية/i.test(name)) { section = 'professional'; return; }
    if (/مكاتب\s*شئون\s*العضوية|بيان\s*مكاتب/i.test(name)) { section = 'offices'; return; }
    if (!/^\d+$/.test(num)) return;
    if (!name || name.length < 6) return;
    if (section === 'professional') professional.add(name);
    else if (section === 'offices') offices.add(name);
    else company.add(name);
  });

  const wCompany = 'م;اسم اللجنة\n' + [...company].map((n, i) => `${i + 1};${esc(n)}`).join('\n') + '\n';
  const wProfessional = 'م;اسم اللجنة\n' + [...professional].map((n, i) => `${i + 1};${esc(n)}`).join('\n') + '\n';
  const wOffices = 'م;اسم المكتب\n' + [...offices].map((n, i) => `${i + 1};${esc(n)}`).join('\n') + '\n';

  fs.writeFileSync(DATA + 'لجان_الشركات.csv', '\uFEFF' + wCompany, 'utf-8');
  fs.writeFileSync(DATA + 'لجان_مهنية.csv', '\uFEFF' + wProfessional, 'utf-8');
  fs.writeFileSync(DATA + 'مكاتب_العضوية.csv', '\uFEFF' + wOffices, 'utf-8');

  console.log('بيانات.xlsx → لجان الشركات:', company.size, '| اللجان المهنية:', professional.size, '| مكاتب العضوية:', offices.size);

  // ============ 2) قيود اليومية_2024.xlsx → قيود اليومية 2024 (رأس + صفوف) ============
  const wb2 = new ExcelJS.Workbook();
  await wb2.xlsx.readFile(ROOT + 'قيود اليومية_2024.xlsx');
  const ws2 = wb2.getWorksheet('قيود اليومية_2024');
  const lines = [];
  ws2.eachRow((row) => {
    const v = row.getCell(1).value;
    if (v == null) return;
    const s = String(v).trim();
    if (s) lines.push(s);
  });
  // السطر الأول هو الرأس نفسه (CSV داخل خلية واحدة)
  const header = lines[0];
  const body = lines.slice(1).filter((l) => l.trim().length > 0);
  fs.writeFileSync(DATA + 'قيود_اليومية_2024_c.csv', '\uFEFF' + [header, ...body].join('\n') + '\n', 'utf-8');
  console.log('قيود اليومية_2024.xlsx → ' + body.length + ' قيداً');

  // ============ 3) Insured List.xlsx → insured-list.csv ============
  const wb3 = new ExcelJS.Workbook();
  await wb3.xlsx.readFile(ROOT + 'Insured List - النقابة العامة للعاملين بصناعات البناء والأخشاب.xlsx');
  const ws3 = wb3.getWorksheet('Insured List');
  const rows = [];
  ws3.eachRow((row, rn) => {
    if (rn < 4) return; // الرأس الفعلي في السطر 4
    const ser = row.getCell(2).value;
    if (ser == null) return;
    const name = (row.getCell(3).value || '').toString().trim();
    const occupation = (row.getCell(4).value || '').toString().trim();
    const dob = toDateStr(row.getCell(5).value);
    const maturity = toDateStr(row.getCell(6).value);
    const age = row.getCell(7).value;
    const prem = row.getCell(8).value;
    const si = row.getCell(9).value;
    if (!name) return;
    rows.push([ser, name, occupation, dob, maturity, age, prem, si]);
  });
  const header3 = 'الرقم;الاسم;المهنة;تاريخ الميلاد;تاريخ الاستحقاق;العمر;القسط الشهري المتفق عليه;مبلغ التأمين عند الاستحقاق';
  const csv3 = [header3, ...rows.map((r) => r.map((c) => (c instanceof Date ? c.toISOString().slice(0, 10) : esc(c))).join(';'))].join('\n');
  fs.writeFileSync(DATA + 'insured-list.csv', '\uFEFF' + csv3 + '\n', 'utf-8');
  console.log('Insured List.xlsx → ' + rows.length + ' مؤمَّن عليه');
}

convertForms().catch((e) => { console.error(e); process.exit(1); });

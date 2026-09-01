const ExcelJS = require('exceljs');
const path = require('path');

const ROOT = 'C:/Users/HP/Downloads/union-app-main/union-app-main/';

async function inspect(file, maxRows = 12) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(ROOT + file);
  console.log('\n\n========== FILE: ' + file + ' ==========');
  console.log('Sheets (' + wb.worksheets.length + '):');
  wb.eachSheet((ws) => {
    console.log('  - "' + ws.name + '"  rows=' + ws.rowCount + '  cols=' + ws.columnCount);
  });

  for (const ws of wb.worksheets) {
    console.log('\n--- Sheet: "' + ws.name + '" (first ' + maxRows + ' rows) ---');
    const rows = [];
    ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      if (rowNumber <= maxRows) {
        rows.push(Array.from({ length: ws.columnCount }, (_, i) => row.getCell(i + 1).value).map((v) => (v && v.text !== undefined ? v.text : v)));
      }
    });
    rows.forEach((r, i) => console.log('r' + (i + 1) + ': ' + JSON.stringify(r)));
  }
}

(async () => {
  await inspect('بيانات.xlsx');
  await inspect('قيود اليومية_2024.xlsx');
  await inspect('Insured List - النقابة العامة للعاملين بصناعات البناء والأخشاب.xlsx');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

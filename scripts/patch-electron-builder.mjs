// إصلاح دائم لمشكلة electron-builder مع npm >= 11:
// `npm list -a --long` ينهار صامتاً (exit 1 بلا مخرجات) في npm الجديدة،
// فيفشل البناء بـ "No JSON content found in output".
// الحل: إزالة العلم `-a` (العُمق الكامل هو الافتراضي في npm >= 11).
import { existsSync, globSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const targetFile = join(
  process.cwd(),
  "node_modules",
  "app-builder-lib",
  "out",
  "node-module-collector",
  "npmNodeModulesCollector.js",
);

const files = existsSync(targetFile)
  ? [targetFile]
  : globSync("node_modules/app-builder-lib/out/**/npmNodeModulesCollector.js", {
      cwd: process.cwd(),
    });

const needle = '["list", "-a", "--include", "prod"';
const desired = '["list", "--include", "prod"';

if (files.length === 0) {
  console.warn(
    "[patch-electron-builder] npmNodeModulesCollector.js غير موجود — تم التخطي (نسخة electron-builder مختلفة).",
  );
  process.exit(0);
}

for (const file of files) {
  let source = readFileSync(file, "utf8");
  if (!source.includes(needle)) {
    const already = source.includes(desired);
    console.log(
      `[patch-electron-builder] ${already ? "ملغى مسبقاً (بلا -a)" : "نمط غير متوقع"} — ${file}`,
    );
    continue;
  }
  source = source.replace(needle, desired);
  writeFileSync(file, source, "utf8");
  console.log(`[patch-electron-builder] تم الإصلاح: إزالة "-a" من getArgs — ${file}`);
}
import fs from 'fs';
import path from 'path';

/** مسح لائحة النظام الأساسي المرفق مع المستودع (20 صفحة). */
export const BASIC_STATUTE_RELATIVE = path.join('docs', 'laiha', 'Laiha-Regulation.pdf');

export function resolveBasicStatutePath(cwd = process.cwd()): string | null {
  const candidates = [
    path.join(cwd, BASIC_STATUTE_RELATIVE),
    path.resolve(cwd, BASIC_STATUTE_RELATIVE),
  ];
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).size > 1000) return candidate;
    } catch {
      // جرّب المسار التالي
    }
  }
  return null;
}

export function bundledBasicStatuteMeta(filePath: string) {
  const stat = fs.statSync(filePath);
  return {
    id: 'bundled-basic-statute',
    fileName: 'لائحة-النظام-الأساسي.pdf',
    fileType: 'application/pdf',
    fileSize: stat.size,
    fileUrl: '/api/regulation/files/basic-statute',
    source: 'bundled',
    title: 'لائحة النظام الأساسي للنقابة العامة للعاملين بصناعات البناء والأخشاب وصنع مواد البناء',
    isSealed: false,
    sealedBy: null,
    sealTimestamp: null,
    sha256: null,
  };
}

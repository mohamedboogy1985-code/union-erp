/**
 * تطبيق مولد أكواد الاستجابة السريعة الحقيقية (QR Code) بدون أي اعتماديات خارجية.
 *
 * يقوم بترميز النص (Byte Mode) مع تصحيح أخطاء Reed-Solomon وتطبيق أقنعة (Masking)
 * وفق مواصفة ISO/IEC 18004 بحيث يكون الناتج كوداً حقيقياً قابلاً للمسح بالهاتف.
 *
 * يعتمد على منهجية "الوحدات المحجوزة" (reserved modules) كما في المكتبات المختبرة
 * لضمان عدم تلويث بيانات/الأقنعة للنماذج الوظيفية.
 */

// ---------------------------------------------------------------------------
// 1) حسابات حقل غالوا GF(256) بمعامل اختزال 0x11d
// ---------------------------------------------------------------------------
const EXP_TABLE = new Array(512);
const LOG_TABLE = new Array(256);

(function initGalois() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP_TABLE[i] = x;
    LOG_TABLE[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP_TABLE[i] = EXP_TABLE[i - 255];
})();

function gfExp(i: number): number {
  return EXP_TABLE[i % 255];
}

function gfLog(n: number): number {
  if (n < 1) throw new Error('لاغاريتم غير معرّف للصفر');
  return LOG_TABLE[n];
}

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP_TABLE[LOG_TABLE[a] + LOG_TABLE[b]];
}

// ---------------------------------------------------------------------------
// 2) متعدد حدود المولد و Reed-Solomon (محسّن)
// ---------------------------------------------------------------------------
function polyMul(p1: number[], p2: number[]): number[] {
  const coeff = new Array(p1.length + p2.length - 1).fill(0);
  for (let i = 0; i < p1.length; i++) {
    for (let j = 0; j < p2.length; j++) {
      coeff[i + j] ^= gfMul(p1[i], p2[j]);
    }
  }
  return coeff;
}

/** تخزين مسبق لكثير حدود المولد بحسب الدرجة لتجنب إعادة الحساب الكثيفة */
const GEN_POLY_CACHE: Record<number, number[]> = {};

function getGeneratorPoly(degree: number): number[] {
  let gen = GEN_POLY_CACHE[degree];
  if (gen) return gen;
  gen = [1];
  for (let i = 0; i < degree; i++) {
    gen = polyMul(gen, [1, gfExp(i)]);
  }
  GEN_POLY_CACHE[degree] = gen;
  return gen;
}

/**
 * حساب أكواد تصحيح الخطأ بطريقة Reed-Solomon.
 * تحسين الأداء:
 * 1) استخدام كثير حدود المولد المخزن مسبقاً (GEN_POLY_CACHE).
 * 2) القسمة التركيبية في نفس الموضع على ذاكرة مؤقتة ثابتة (Int32Array)
 *    بدون عمليات slicing وتقطيع المصفوقات في كل تكرار.
 */
function reedSolomonCompute(data: number[], degree: number): number[] {
  const gen = getGeneratorPoly(degree);
  const dataLen = data.length;

  // ذاكرة ممتدة تحوي البيانات متبوعة بدرجة المولد (الأصفار الملحقة)
  const buffer = new Int32Array(dataLen + degree);
  for (let i = 0; i < dataLen; i++) buffer[i] = data[i];

  // قسمة تركيبية في الموضع (In-place synthetic division)
  for (let i = 0; i < dataLen; i++) {
    const coeff = buffer[i];
    if (coeff !== 0) {
      for (let j = 0; j < gen.length; j++) {
        buffer[i + j] ^= gfMul(gen[j], coeff);
      }
    }
  }

  // باقي القسمة يمثل أكواد تصحيح الخطأ المطلوبة
  const remainder = new Array(degree);
  for (let i = 0; i < degree; i++) {
    remainder[i] = buffer[dataLen + i];
  }
  return remainder;
}

// ---------------------------------------------------------------------------
// 3) جداول القدرات وتصحيح الخطأ (ISO/IEC 18004، الإصدارات 1-7)
// ---------------------------------------------------------------------------
type QrLevel = 'L' | 'M' | 'Q' | 'H';

// عدد بايتات البيانات القصوى في وضع Byte mode
const BYTE_CAPACITY: Record<string, number> = {
  '1-L': 17, '1-M': 14, '1-Q': 11, '1-H': 7,
  '2-L': 32, '2-M': 26, '2-Q': 20, '2-H': 14,
  '3-L': 53, '3-M': 42, '3-Q': 32, '3-H': 24,
  '4-L': 78, '4-M': 62, '4-Q': 46, '4-H': 34,
  '5-L': 106, '5-M': 84, '5-Q': 60, '5-H': 44,
  '6-L': 134, '6-M': 106, '6-Q': 74, '6-H': 58,
  '7-L': 154, '7-M': 122, '7-Q': 86, '7-H': 64,
};

// إجمالي أكواد البيانات (data codewords)
const TOTAL_DATA: Record<string, number> = {
  '1-L': 19, '1-M': 16, '1-Q': 13, '1-H': 9,
  '2-L': 34, '2-M': 28, '2-Q': 22, '2-H': 16,
  '3-L': 55, '3-M': 44, '3-Q': 34, '3-H': 26,
  '4-L': 80, '4-M': 64, '4-Q': 48, '4-H': 36,
  '5-L': 108, '5-M': 86, '5-Q': 62, '5-H': 46,
  '6-L': 136, '6-M': 108, '6-Q': 76, '6-H': 60,
  '7-L': 156, '7-M': 124, '7-Q': 88, '7-H': 66,
};

// مخططات تصحيح الخطأ: عدد الأكواد لكل كتلة + مجموعات الكتل
// البنية: ecPerBlock + كتل { data (حجم بيانات), total (حجم أولي مع التصحيح), count }
const ECC_SCHEMES: Record<string, { ecPerBlock: number; groups: { count: number; data: number; total: number }[] }> = {
  '1-L': { ecPerBlock: 7, groups: [{ count: 1, data: 19, total: 26 }] },
  '1-M': { ecPerBlock: 10, groups: [{ count: 1, data: 16, total: 26 }] },
  '1-Q': { ecPerBlock: 13, groups: [{ count: 1, data: 13, total: 26 }] },
  '1-H': { ecPerBlock: 17, groups: [{ count: 1, data: 9, total: 26 }] },
  '2-L': { ecPerBlock: 10, groups: [{ count: 1, data: 34, total: 44 }] },
  '2-M': { ecPerBlock: 16, groups: [{ count: 1, data: 28, total: 44 }] },
  '2-Q': { ecPerBlock: 22, groups: [{ count: 1, data: 22, total: 44 }] },
  '2-H': { ecPerBlock: 28, groups: [{ count: 1, data: 16, total: 44 }] },
  '3-L': { ecPerBlock: 15, groups: [{ count: 1, data: 55, total: 70 }] },
  '3-M': { ecPerBlock: 26, groups: [{ count: 1, data: 44, total: 70 }] },
  '3-Q': { ecPerBlock: 18, groups: [{ count: 2, data: 17, total: 35 }] },
  '3-H': { ecPerBlock: 22, groups: [{ count: 2, data: 13, total: 35 }] },
  '4-L': { ecPerBlock: 20, groups: [{ count: 1, data: 80, total: 100 }] },
  '4-M': { ecPerBlock: 18, groups: [{ count: 2, data: 32, total: 50 }] },
  '4-Q': { ecPerBlock: 26, groups: [{ count: 2, data: 24, total: 50 }] },
  '4-H': { ecPerBlock: 16, groups: [{ count: 4, data: 9, total: 25 }] },
  '5-L': { ecPerBlock: 26, groups: [{ count: 1, data: 108, total: 134 }] },
  '5-M': { ecPerBlock: 24, groups: [{ count: 2, data: 43, total: 67 }] },
  '5-Q': { ecPerBlock: 18, groups: [{ count: 2, data: 15, total: 33 }, { count: 2, data: 16, total: 34 }] },
  '5-H': { ecPerBlock: 22, groups: [{ count: 2, data: 11, total: 33 }, { count: 2, data: 12, total: 34 }] },
  '6-L': { ecPerBlock: 18, groups: [{ count: 2, data: 68, total: 86 }] },
  '6-M': { ecPerBlock: 16, groups: [{ count: 4, data: 27, total: 43 }] },
  '6-Q': { ecPerBlock: 24, groups: [{ count: 4, data: 19, total: 43 }] },
  '6-H': { ecPerBlock: 28, groups: [{ count: 4, data: 15, total: 43 }] },
  '7-L': { ecPerBlock: 20, groups: [{ count: 2, data: 78, total: 98 }] },
  '7-M': { ecPerBlock: 18, groups: [{ count: 4, data: 31, total: 49 }] },
  '7-Q': { ecPerBlock: 18, groups: [{ count: 2, data: 14, total: 32 }, { count: 4, data: 15, total: 33 }] },
  '7-H': { ecPerBlock: 26, groups: [{ count: 4, data: 13, total: 39 }, { count: 1, data: 14, total: 40 }] },
};

const ALIGNMENT_POSITIONS: Record<number, number[]> = {
  1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34], 7: [6, 22, 38],
};

function selectVersion(dataLength: number, level: QrLevel): number {
  for (let v = 1; v <= 7; v++) {
    if (dataLength <= BYTE_CAPACITY[`${v}-${level}`]) return v;
  }
  throw new Error('النص طويل جداً ليتجاوز قدرة كود QR المدعومة (الإصدار 7).');
}

// ---------------------------------------------------------------------------
// 4) ترميز وضع البايت وبناء تيار البتات (مع التعبئة)
// ---------------------------------------------------------------------------
function encodeUtf8(text: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i++) {
    let cp = text.charCodeAt(i);
    // دمج الزوج البديل (surrogate pair) للحصول على نقطه رابعة (4-بايت)
    if (cp >= 0xd800 && cp <= 0xdbff && i + 1 < text.length) {
      const lo = text.charCodeAt(i + 1);
      if (lo >= 0xdc00 && lo <= 0xdfff) {
        cp = 0x10000 + ((cp - 0xd800) << 10) + (lo - 0xdc00);
        i++;
      }
    }
    if (cp < 0x80) bytes.push(cp);
    else if (cp < 0x800) bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    else if (cp < 0x10000) bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    else bytes.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
  }
  return bytes;
}

function buildDataCodewords(text: string, version: number, level: QrLevel): number[] {
  const bytes = encodeUtf8(text);
  const totalData = TOTAL_DATA[`${version}-${level}`];
  const charCountBits = version <= 9 ? 8 : 16;

  const bits: number[] = [];
  const pushInt = (val: number, count: number) => {
    for (let i = count - 1; i >= 0; i--) bits.push((val >> i) & 1);
  };

  pushInt(0b0100, 4); // Byte mode
  pushInt(bytes.length, charCountBits);
  for (const b of bytes) pushInt(b, 8);

  // فاصل نهاية الترميز (حتى 4 أصفار)
  const remaining = totalData * 8 - bits.length;
  for (let i = 0; i < Math.min(4, remaining); i++) bits.push(0);

  // تعبئة لحدود 8-بت
  while (bits.length % 8 !== 0) bits.push(0);

  // تعبئة أكواد الحشو 0xEC / 0x11
  let padIdx = 0;
  while (bits.length < totalData * 8) {
    pushInt(padIdx % 2 === 0 ? 0xec : 0x11, 8);
    padIdx++;
  }

  const out: number[] = [];
  for (let i = 0; i < totalData * 8; i += 8) {
    let byte = 0;
    for (let b = 0; b < 8; b++) byte = (byte << 1) | bits[i + b];
    out.push(byte);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 5) تقسيم إلى كتل + حساب التصحيح + التناوب
// ---------------------------------------------------------------------------
function interleaveWithEcData(dataCodewords: number[], version: number, level: QrLevel): Uint8Array {
  const scheme = ECC_SCHEMES[`${version}-${level}`];
  const genEcPerBlock = scheme.ecPerBlock;

  // توزيع أكواد البيانات على الكتل حسب مخطط الحجم
  const blockCount = scheme.groups.reduce((acc, g) => acc + g.count, 0);
  const blockSizes: number[] = [];
  for (const g of scheme.groups) {
    for (let i = 0; i < g.count; i++) blockSizes.push(g.data);
  }

  // توزيع أكواد البيانات على الكتل (شرائح متتالية، كما في المواصفة)
  const dataBlocks: number[][] = [];
  let pos = 0;
  for (const n of blockSizes) {
    dataBlocks.push(dataCodewords.slice(pos, pos + n));
    pos += n;
  }

  // حساب أكواد التصحيح لكل كتلة
  const ecBlocks = dataBlocks.map((d) => reedSolomonCompute(d, genEcPerBlock));

  const result: number[] = [];
  const maxDataLen = Math.max(...blockSizes);
  for (let i = 0; i < maxDataLen; i++) {
    for (let b = 0; b < blockCount; b++) {
      if (i < dataBlocks[b].length) result.push(dataBlocks[b][i]);
    }
  }
  for (let j = 0; j < genEcPerBlock; j++) {
    for (let b = 0; b < blockCount; b++) {
      result.push(ecBlocks[b][j]);
    }
  }
  return new Uint8Array(result);
}

// ---------------------------------------------------------------------------
// 6) بناء المصفوفة مع الوحدات المحجوزة
// ---------------------------------------------------------------------------
interface QrMatrix {
  /** قيم الوحدات: 1 = داكن، 0 = فاتح */
  matrix: number[][];
  /** وحدات محجوزة (نماذج وظيفية) لا تُمس بالبيانات أو الأقنعة */
  reserved: boolean[][];
  size: number;
}

function setupFunctionPatterns(version: number): QrMatrix {
  const size = version * 4 + 17;
  const matrix = Array.from({ length: size }, () => new Array(size).fill(0));
  const reserved = Array.from({ length: size }, () => new Array(size).fill(false));

  const set = (r: number, c: number) => {
    if (r < 0 || c < 0 || r >= size || c >= size) return;
    matrix[r][c] = 1;
    reserved[r][c] = true;
  };
  const setRing = (r: number, c: number) => {
    // نمط العثور 7x7 مع الفاصل (separator) المحيط
    for (let rr = -4; rr <= 4; rr++) {
      for (let cc = -4; cc <= 4; cc++) {
        const ar = r + rr;
        const ac = c + cc;
        if (ar < 0 || ac < 0 || ar >= size || ac >= size) continue;
        if (rr < -3 || rr > 3 || cc < -3 || cc > 3) {
          // الفاصل: فاتح
          matrix[ar][ac] = 0;
          reserved[ar][ac] = true;
          continue;
        }
        // النمط 7x7
        if (rr === -3 || rr === 3 || cc === -3 || cc === 3) {
          matrix[ar][ac] = 1; // الحدود
        } else if (rr === -2 || rr === 2 || cc === -2 || cc === 2) {
          matrix[ar][ac] = 0; // الحلقة الداخلية
        } else {
          matrix[ar][ac] = 1; // المركز 3x3
        }
        reserved[ar][ac] = true;
      }
    }
  };

  // أنماط العثور الثلاثة
  setRing(3, 3);
  setRing(3, size - 4);
  setRing(size - 4, 3);

  // أنماط التزامن (الصف 6 والعمود 6)
  for (let i = 8; i <= size - 9; i++) {
    const v = i % 2 === 0 ? 1 : 0;
    matrix[6][i] = v;
    reserved[6][i] = true;
    matrix[i][6] = v;
    reserved[i][6] = true;
  }

  // أنماط التصحيح (Alignment)
  const positions = ALIGNMENT_POSITIONS[version] || [];
  for (const r of positions) {
    for (const c of positions) {
      if ((r === 6 && c === 6) || (r === 6 && c === size - 7) || (r === size - 7 && c === 6)) continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const ar = r + dr;
          const ac = c + dc;
          if (ar < 0 || ac < 0 || ar >= size || ac >= size) continue;
          const isEdge = dr === -2 || dr === 2 || dc === -2 || dc === 2;
          const isCenter = dr === 0 && dc === 0;
          matrix[ar][ac] = isEdge || isCenter ? 1 : 0;
          reserved[ar][ac] = true;
        }
      }
    }
  }

  // معلومات الإصدار (Version Info) — تُوضع فقط للإصدارات 7 فأعلى (ISO/IEC 18004)
  if (version >= 7) {
    // BCH(18,6) بمولد 0x1f25 ثم إلحاق 12 بت للباقي: bits = (version << 12) | remainder
    const d = version << 12;
    let rem = d;
    const bitLen = (n: number) => { let i = 0; while (n !== 0) { i++; n >>>= 1; } return i; };
    while (bitLen(rem) - bitLen(0x1f25) >= 0) {
      rem ^= 0x1f25 << (bitLen(rem) - bitLen(0x1f25));
    }
    const bits = (d | rem) & 0x3ffff;
    // النسختان: الأولى صفوف 0-5/Aعمدة size-11..size-9، الثانية معكوسة، البت 0 = LSB
    for (let i = 0; i < 18; i++) {
      const bVal = (bits >> i) & 1;
      const row = Math.floor(i / 3);
      const col = (i % 3) + size - 11;
      matrix[row][col] = bVal;
      reserved[row][col] = true;
      matrix[col][row] = bVal;
      reserved[col][row] = true;
    }
  }

  // حجز منطقة معلومات التنسيق والوحدة الداكنة حتى لا تُلوَّث بالبيانات
  // النسخة الأولى حول أعلى اليسار (صف 8 وعمود 8)
  for (let i = 0; i <= 5; i++) {
    reserved[8][i] = true;
    reserved[i][8] = true;
  }
  reserved[8][7] = true;
  reserved[8][8] = true;
  reserved[7][8] = true;
  // النسخة الثانية (أعلى يمين أفقياً + أسفل يسار عمودياً)
  for (let i = 0; i < 7; i++) {
    reserved[8][size - 1 - i] = true;
    reserved[size - 1 - i][8] = true;
  }
  // الوحدة الداكنة الثابتة (نسختان معكوستان عبر صف/عمود التزامن)
  reserved[size - 8][8] = true;
  reserved[8][size - 8] = true;
  matrix[size - 8][8] = 1;
  matrix[8][size - 8] = 1;

  return { matrix, reserved, size };
}

// ---------------------------------------------------------------------------
// 7) وضع البيانات (تعرج من الأسفل يميناً) + الأقنعة + معلومات التنسيق
// ---------------------------------------------------------------------------
function placeDataBits(qm: QrMatrix, codewords: Uint8Array) {
  const size = qm.size;
  const m = qm.matrix;
  const reserved = qm.reserved;
  let bitIdx = 0;
  const totalBits = codewords.length * 8;
  let upward = true;

  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col = 5; // تجاوز عمود التزامن العمودي
    for (let vIdx = 0; vIdx < size; vIdx++) {
      const row = upward ? size - 1 - vIdx : vIdx;
      for (let j = 0; j < 2; j++) {
        const c = col - j;
        if (reserved[row][c]) continue;
        if (bitIdx < totalBits) {
          const byte = codewords[bitIdx >> 3];
          m[row][c] = (byte >> (7 - (bitIdx & 7))) & 1;
        } else {
          m[row][c] = 0;
        }
        bitIdx++;
      }
    }
    upward = !upward;
  }
}

// معلومات التنسيق: حساب BCH (15,5) مع ثابت 0x5412
function formatBits(level: QrLevel, mask: number): number {
  const ecBits = level === 'L' ? 1 : level === 'M' ? 0 : level === 'Q' ? 3 : 2;
  const data = (ecBits << 3) | mask;
  let rem = data << 10;
  for (let i = 14; i >= 10; i--) {
    if (rem & (1 << i)) rem ^= 0x537 << (i - 10);
  }
  return (((data << 10) | rem) ^ 0x5412) & 0x7fff;
}

function placeFormatInfo(qm: QrMatrix, level: QrLevel, mask: number) {
  const size = qm.size;
  const m = qm.matrix;
  const bits = formatBits(level, mask);
  const b = (i: number) => (bits >> i) & 1;

  // النسخة الأولى (أفقي في صف 8 وجهة اليسار، وعمودي في عمود 8)
  m[8][0] = b(14); m[8][1] = b(13); m[8][2] = b(12);
  m[8][3] = b(11); m[8][4] = b(10); m[8][5] = b(9);
  m[8][7] = b(8); m[8][8] = b(7);
  m[7][8] = b(6);
  m[5][8] = b(5); m[4][8] = b(4); m[3][8] = b(3); m[2][8] = b(2); m[1][8] = b(1); m[0][8] = b(0);

  // النسخة الثانية (أعلى يمين أفقياً، وأسفل يسار عمودياً)
  for (let i = 0; i < 7; i++) m[8][size - 1 - i] = b(14 - i);
  for (let i = 0; i < 7; i++) m[size - 1 - i][8] = b(7 - i);

  // الوحدة الداكنة الثابتة (إصدار 1-7): عند (size-8, 8)
  m[size - 8][8] = 1;
}

function applyMask(mask: number, qm: QrMatrix) {
  const size = qm.size;
  const m = qm.matrix;
  const reserved = qm.reserved;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (reserved[y][x]) continue;
      let cond = false;
      const row = y;
      const col = x;
      switch (mask) {
        case 0: cond = (row + col) % 2 === 0; break;
        case 1: cond = row % 2 === 0; break;
        case 2: cond = col % 3 === 0; break;
        case 3: cond = (row + col) % 3 === 0; break;
        case 4: cond = (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0; break;
        case 5: cond = (row * col) % 2 + (row * col) % 3 === 0; break;
        case 6: cond = ((row * col) % 2 + (row * col) % 3) % 2 === 0; break;
        case 7: cond = ((row + col) % 2 + (row * col) % 3) % 2 === 0; break;
      }
      if (cond) m[y][x] = m[y][x] === 1 ? 0 : 1;
    }
  }
}

// ---------------------------------------------------------------------------
// 8) عقوبة الأقنعة (محسّنة بدون تخصيص كائنات متكررة)
// ---------------------------------------------------------------------------
/**
 * حساب النتيجة التفاضلية للعقوبة في الأقنعة (Penalty Score).
 * تحسين الأداء:
 * 1) قراءة الأعمدة مباشرة بدون إنشاء مصفوفات مؤقتة (No array allocations for columns).
 * 2) حساب نسبة الداكن أثناء التدقيق بدلاً من الحلقات المزدوجة المكررة.
 */
function maskPenalty(qm: QrMatrix): number {
  const size = qm.size;
  const m = qm.matrix;
  let penalty = 0;

  // القاعدة 1: تشغيل 5 وحدات متتالية بنفس اللون (صفوف وأعمدة)
  for (let r = 0; r < size; r++) {
    const row = m[r];
    let count = 1;
    for (let c = 1; c <= size; c++) {
      if (c < size && row[c] === row[c - 1]) {
        count++;
      } else {
        if (count >= 5) penalty += 3 + (count - 5);
        count = 1;
      }
    }
  }

  for (let c = 0; c < size; c++) {
    let count = 1;
    for (let r = 1; r <= size; r++) {
      if (r < size && m[r][c] === m[r - 1][c]) {
        count++;
      } else {
        if (count >= 5) penalty += 3 + (count - 5);
        count = 1;
      }
    }
  }

  // القاعدة 2: مربعات 2x2 متجانسة اللون
  let dark = 0;
  for (let r = 0; r < size; r++) {
    const row = m[r];
    const nextRow = r < size - 1 ? m[r + 1] : null;
    for (let c = 0; c < size; c++) {
      if (row[c] === 1) dark++;
      if (nextRow && c < size - 1) {
        const v = row[c];
        if (row[c + 1] === v && nextRow[c] === v && nextRow[c + 1] === v) {
          penalty += 3;
        }
      }
    }
  }

  // القاعدة 3: نمط 10111010000 / 00001011101 (صفوف وأعمدة)
  const pat1 = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
  const pat2 = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];

  for (let r = 0; r < size; r++) {
    const row = m[r];
    for (let c = 0; c + 11 <= size; c++) {
      let match1 = true;
      let match2 = true;
      for (let j = 0; j < 11; j++) {
        const v = row[c + j];
        if (v !== pat1[j]) match1 = false;
        if (v !== pat2[j]) match2 = false;
        if (!match1 && !match2) break;
      }
      if (match1 || match2) penalty += 40;
    }
  }

  for (let c = 0; c < size; c++) {
    for (let r = 0; r + 11 <= size; r++) {
      let match1 = true;
      let match2 = true;
      for (let j = 0; j < 11; j++) {
        const v = m[r + j][c];
        if (v !== pat1[j]) match1 = false;
        if (v !== pat2[j]) match2 = false;
        if (!match1 && !match2) break;
      }
      if (match1 || match2) penalty += 40;
    }
  }

  // القاعدة 4: نسبة المربعات الداكنة الإجمالية
  const pct = (dark * 100) / (size * size);
  const prev = Math.floor(pct / 5) * 5;
  const next = prev + 5;
  penalty += (Math.min(Math.abs(prev - 50), Math.abs(next - 50)) / 5) * 10;

  return penalty;
}

// ---------------------------------------------------------------------------
// 9) الواجهة العامة
// ---------------------------------------------------------------------------
export interface QrResult {
  version: number;
  level: QrLevel;
  mask: number;
  size: number;
  /** مصفوفة 0/1 تمثل الوحدات الداكنة/الفاتحة */
  matrix: number[][];
}

export function generateQr(text: string, opts: { level?: QrLevel; maxVersion?: number } = {}): QrResult {
  const level = opts.level || 'M';
  const version = selectVersion(encodeUtf8(text).length, level);
  if (opts.maxVersion && version > opts.maxVersion) {
    throw new Error(`النص يفوق الإصدار الأقصى ${opts.maxVersion}.`);
  }

  const dataCodewords = buildDataCodewords(text, version, level);
  const codewords = interleaveWithEcData(dataCodewords, version, level);

  let bestQm: QrMatrix | null = null;
  let bestMask = 0;
  let bestPenalty = Infinity;

  for (let mask = 0; mask < 8; mask++) {
    const qm = setupFunctionPatterns(version);
    placeDataBits(qm, codewords);
    applyMask(mask, qm);
    placeFormatInfo(qm, level, mask);
    const p = maskPenalty(qm);
    if (p < bestPenalty) {
      bestPenalty = p;
      bestMask = mask;
      bestQm = qm;
    }
  }

  return {
    version,
    level,
    mask: bestMask,
    size: bestQm!.size,
    matrix: bestQm!.matrix,
  };
}

/** توليد shading لـ SVG: يُرجع مساراً (path d) لوحدات داكنة */
export function qrToPathD(matrix: number[][], cell = 1): string {
  const size = matrix.length;
  let d = '';
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (matrix[y][x] === 1) {
        d += `M${x * cell} ${y * cell}h${cell}v${cell}h-${cell}z`;
      }
    }
  }
  return d;
}

// ป้ายชื่อคอลัมน์แบบ Excel: 0->A, 25->Z, 26->AA
export function columnLetter(index: number): string {
  let i = index;
  let s = "";
  do {
    s = String.fromCharCode(65 + (i % 26)) + s;
    i = Math.floor(i / 26) - 1;
  } while (i >= 0);
  return s;
}

// ป้ายคอลัมน์สำหรับ dropdown: ใช้ชื่อหัวตารางถ้ามี ไม่งั้น fallback เป็นตัวอักษร
export function columnOptionLabel(header: unknown, index: number): string {
  const h = header === null || header === undefined ? "" : String(header).trim();
  const letter = columnLetter(index);
  return h ? `${letter} · ${h}` : `${letter} · (ว่าง)`;
}

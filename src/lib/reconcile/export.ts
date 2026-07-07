// ส่งออกผลเทียบเป็น CSV / JSON ให้ภูมเอาไปใช้ต่อ (เช่นอัปโหลดเข้า Pacred เอง)
import Papa from "papaparse";
import type { Cell, DiffResult } from "./types";

const STATUS_LABEL: Record<string, string> = {
  match: "ตรงกัน",
  mismatch: "ไม่ตรง",
  "only-a": "มีเฉพาะ A",
  "only-b": "มีเฉพาะ B",
};

function cellStr(v: Cell): string {
  return v === null || v === undefined ? "" : String(v);
}

export function diffToCsv(result: DiffResult): string {
  const header: string[] = [result.keyFieldLabel || "key", "สถานะ"];
  for (const f of result.compareFields) {
    header.push(`${f.label} (A)`, `${f.label} (B)`, `${f.label} ผล`);
  }
  const rows: string[][] = result.rows.map((r) => {
    const line: string[] = [r.key, STATUS_LABEL[r.status] ?? r.status];
    for (const f of result.compareFields) {
      const cc = r.fields[f.id];
      line.push(cellStr(cc?.a ?? null), cellStr(cc?.b ?? null), STATUS_LABEL[cc?.status ?? ""] ?? cc?.status ?? "");
    }
    return line;
  });
  return Papa.unparse({ fields: header, data: rows });
}

export function diffToJson(result: DiffResult): string {
  return JSON.stringify(result, null, 2);
}

export function downloadText(filename: string, text: string, mime = "text/plain") {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  triggerDownload(filename, blob);
}

// ดาวน์โหลดไฟล์ binary (เช่น .xlsx จาก SheetJS ที่เป็น Uint8Array)
// normalize เป็น Uint8Array<ArrayBuffer> ก่อน (เลี่ยง ArrayBufferLike strictness ของ TS 5.7)
export function downloadBlob(filename: string, data: Uint8Array | ArrayBuffer | string, mime: string) {
  const part: BlobPart = typeof data === "string" ? data : new Uint8Array(data);
  const blob = new Blob([part], { type: mime });
  triggerDownload(filename, blob);
}

function triggerDownload(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

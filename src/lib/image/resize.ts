// คำนวณขนาดเป้าหมาย + helper รูปแบบไฟล์ — pure ล้วน (ไม่พึ่ง Canvas/DOM)
// use-case: ย่อ/ขยาย/แปลง/บีบอัดรูป (เช่น รูปเอกสาร/สลิป/หน้าจอ) ก่อนแนบเข้า Pacred หรือส่งต่อ
// แยกส่วน "คณิตของขนาด" ออกมาเป็น pure เพื่อเทสได้แน่น (การวาด canvas จริงไป verify ใน browser)

export type ResizeMode = "none" | "fit" | "scale";
export type ImageFormat = "png" | "jpeg" | "webp";

export interface ResizeOptions {
  mode: ResizeMode;
  maxW?: number; // ใช้กับ mode "fit"
  maxH?: number; // ใช้กับ mode "fit"
  scale?: number; // ใช้กับ mode "scale" (เช่น 0.5 = ครึ่งหนึ่ง)
  allowUpscale?: boolean; // fit: ยอมให้ขยายใหญ่กว่าเดิมไหม (default false — ย่อได้อย่างเดียว)
}

export interface Size {
  w: number;
  h: number;
}

// ปัดเป็นจำนวนเต็ม + อย่างน้อย 1 px (กันขนาด 0 ที่ canvas วาดไม่ได้)
function clampInt(v: number): number {
  const r = Math.round(v);
  return r < 1 ? 1 : r;
}

// คำนวณขนาดปลายทางจากขนาดต้นฉบับ + ตัวเลือก — คงอัตราส่วน (aspect ratio) เสมอ
export function computeTargetSize(srcW: number, srcH: number, opts: ResizeOptions): Size {
  const w0 = Math.max(1, Math.floor(srcW || 0));
  const h0 = Math.max(1, Math.floor(srcH || 0));

  if (opts.mode === "scale") {
    const s = opts.scale && opts.scale > 0 ? opts.scale : 1;
    return { w: clampInt(w0 * s), h: clampInt(h0 * s) };
  }

  if (opts.mode === "fit") {
    const maxW = opts.maxW && opts.maxW > 0 ? opts.maxW : Infinity;
    const maxH = opts.maxH && opts.maxH > 0 ? opts.maxH : Infinity;
    if (maxW === Infinity && maxH === Infinity) return { w: w0, h: h0 };
    // อัตราส่วนย่อ = ด้านไหนเกินกว่ากันมากใช้ตัวนั้น (ให้พอดีกรอบทั้งคู่)
    let ratio = Math.min(maxW / w0, maxH / h0);
    if (!opts.allowUpscale && ratio > 1) ratio = 1; // ไม่ขยายใหญ่กว่าเดิม
    return { w: clampInt(w0 * ratio), h: clampInt(h0 * ratio) };
  }

  // mode "none"
  return { w: w0, h: h0 };
}

const MIME: Record<ImageFormat, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

export function formatMime(fmt: ImageFormat): string {
  return MIME[fmt];
}

// รูปแบบที่รองรับ quality (มีการบีบอัดแบบ lossy) — png ไม่สน quality
export function supportsQuality(fmt: ImageFormat): boolean {
  return fmt === "jpeg" || fmt === "webp";
}

// เปลี่ยนนามสกุลไฟล์ตามรูปแบบใหม่ (jpeg → .jpg) — คงชื่อเดิม
export function changeImageExt(name: string, fmt: ImageFormat): string {
  const ext = fmt === "jpeg" ? "jpg" : fmt;
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  return `${base}.${ext}`;
}

// จัดขนาดไฟล์ให้อ่านง่าย (B/KB/MB)
export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

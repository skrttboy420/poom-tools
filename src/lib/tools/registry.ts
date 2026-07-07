// ทะเบียนเครื่องมือกลาง — หน้าแรกอ่านจากที่นี่ (data-driven)
// เพิ่มเครื่องมือใหม่ = เติม object ใน TOOLS + สร้างหน้า route ให้ตรง href
// แนวคิดหน้าแรก (ตามบรีฟภูม): แบ่งตาม "สิ่งที่ผู้ใช้อยากทำ" ไม่ใช่ตามชนิดไฟล์

export type ToolStatus = "ready" | "soon";

export interface ToolCategory {
  id: string;
  name: string;
  icon: string; // emoji
}

export interface Tool {
  id: string;
  name: string;
  desc: string;
  icon: string; // emoji
  category: string; // category id
  href?: string; // มีเมื่อ status = ready
  status: ToolStatus;
  keywords: string[]; // สำหรับช่องค้นหา (ไทย/อังกฤษ)
}

// เรียงตามความสำคัญกับงานจริงของภูม (โลจิสติกส์/ข้อมูล มาก่อน)
export const CATEGORIES: ToolCategory[] = [
  { id: "compare", name: "เปรียบเทียบไฟล์", icon: "🔍" },
  { id: "clean", name: "จัดระเบียบ & ตรวจข้อมูล", icon: "🧹" },
  { id: "logistics", name: "โลจิสติกส์", icon: "📦" },
  { id: "excel", name: "Excel & ข้อมูล", icon: "📊" },
  { id: "docs", name: "งานเอกสาร", icon: "📄" },
  { id: "image", name: "งานรูปภาพ", icon: "🖼️" },
  { id: "ai", name: "เครื่องมือ AI", icon: "🤖" },
  { id: "office", name: "งานออฟฟิศ", icon: "💼" },
  { id: "dev", name: "สำหรับโปรแกรมเมอร์", icon: "💻" },
  { id: "calc", name: "เครื่องคำนวณ", icon: "🧮" },
];

export const TOOLS: Tool[] = [
  // ---- พร้อมใช้แล้ว ----
  {
    id: "reconcile",
    name: "Reconciler — เทียบข้อมูล 2 ไฟล์",
    desc: "อัปโหลด 2 ไฟล์ (Excel/CSV) แล้วจับคู่คอลัมน์เทียบว่าตรง/ไม่ตรง/หายไป",
    icon: "🔍",
    category: "compare",
    href: "/reconcile",
    status: "ready",
    keywords: ["เทียบ", "เปรียบเทียบ", "reconcile", "excel", "csv", "diff", "packing list", "แพ็คกิ้ง"],
  },
  {
    id: "gap",
    name: "Gap Finder — จับข้อมูลหาย/เป็น 0",
    desc: "ตรวจไฟล์เดียว หาแถวที่ tracking หาย / น้ำหนัก-คิว เป็น 0 / ค่าว่าง",
    icon: "🧹",
    category: "clean",
    href: "/gap",
    status: "ready",
    keywords: ["หาย", "ตรวจ", "gap", "missing", "zero", "ศูนย์", "ว่าง", "clean", "momo", "ข้อมูลหาย"],
  },

  // ---- เปรียบเทียบไฟล์ (soon) ----
  { id: "compare-pdf", name: "เปรียบเทียบ PDF", desc: "หาความต่างระหว่าง PDF 2 ไฟล์", icon: "📄", category: "compare", status: "soon", keywords: ["pdf", "เทียบ", "diff"] },
  { id: "compare-word", name: "เปรียบเทียบ Word", desc: "หาความต่างของเอกสาร Word", icon: "📝", category: "compare", status: "soon", keywords: ["word", "docx", "เทียบ"] },
  { id: "compare-json", name: "เปรียบเทียบ JSON", desc: "diff โครงสร้าง JSON 2 ชุด", icon: "🧬", category: "compare", status: "soon", keywords: ["json", "เทียบ", "diff"] },

  // ---- จัดระเบียบ & ตรวจข้อมูล (soon) ----
  { id: "dedup", name: "ลบข้อมูลซ้ำ", desc: "หากลุ่มแถวซ้ำ (ทั้งแถว หรือตามคอลัมน์) โชว์ให้ดูก่อนลบ แล้วดาวน์โหลดผลไม่มีซ้ำ", icon: "♻️", category: "clean", href: "/dedup", status: "ready", keywords: ["ซ้ำ", "duplicate", "dedup", "unique", "ลบซ้ำ", "แถวซ้ำ", "tracking ซ้ำ"] },
  { id: "cleaner", name: "Data Cleaner / normalizer", desc: "จัดรูปข้อมูลก่อนเข้า Pacred: trim ช่องว่าง, จัดรูปตัวเลข, normalize tracking, ลบแถวว่าง", icon: "🪥", category: "clean", href: "/clean", status: "ready", keywords: ["clean", "normalize", "จัดรูป", "trim", "cleaner", "จัดระเบียบ", "ล้างข้อมูล"] },
  { id: "smart-filter", name: "ค้นหา & กรองข้อมูลอัจฉริยะ", desc: "กรอง/ค้นหาข้อมูลในไฟล์ใหญ่แบบเร็ว", icon: "🔎", category: "clean", status: "soon", keywords: ["filter", "search", "กรอง", "ค้นหา"] },

  // ---- โลจิสติกส์ (soon) ----
  { id: "invoice-vs-packing", name: "เทียบ Invoice กับ Packing List", desc: "เช็คว่า Invoice ตรงกับ Packing List ไหม", icon: "🧾", category: "logistics", status: "soon", keywords: ["invoice", "packing", "เทียบ", "ใบแจ้งหนี้"] },
  { id: "cbm-calc", name: "คำนวณ CBM", desc: "คำนวณปริมาตร (คิว) จากกว้าง×ยาว×สูง × จำนวนกล่อง + น้ำหนักเชิงปริมาตร", icon: "📐", category: "logistics", href: "/cbm", status: "ready", keywords: ["cbm", "คิว", "ปริมาตร", "volume", "freight", "ค่าระวาง", "คำนวณ"] },
  { id: "container-load", name: "จัดเรียงสินค้าในตู้", desc: "ประเมินการโหลดตู้คอนเทนเนอร์", icon: "🚛", category: "logistics", status: "soon", keywords: ["container", "ตู้", "load", "โหลด"] },
  { id: "unit-convert", name: "แปลงหน่วย", desc: "น้ำหนัก/ความยาว/ปริมาตร — พิมพ์ครั้งเดียวเห็นทุกหน่วย (inch↔cm, lb↔kg, ft³↔CBM)", icon: "⚖️", category: "logistics", href: "/convert", status: "ready", keywords: ["unit", "แปลงหน่วย", "kg", "lb", "cm", "inch", "convert", "ปอนด์", "นิ้ว", "ฟุต", "cbm"] },
  { id: "fx-rate", name: "คำนวณอัตราแลกเปลี่ยน", desc: "แปลงสกุลเงินตามเรตล่าสุด", icon: "💱", category: "logistics", status: "soon", keywords: ["fx", "exchange", "อัตราแลกเปลี่ยน", "เรต"] },

  // ---- Excel & ข้อมูล (soon) ----
  { id: "merge-excel", name: "รวมหลายไฟล์ Excel", desc: "รวมหลายชีต/ไฟล์เป็นไฟล์เดียว", icon: "🧷", category: "excel", status: "soon", keywords: ["merge", "รวม", "excel"] },
  { id: "split-excel", name: "แยกไฟล์ Excel", desc: "แยกไฟล์ตามคอลัมน์/จำนวนแถว", icon: "✂️", category: "excel", status: "soon", keywords: ["split", "แยก", "excel"] },
  { id: "csv-excel", name: "แปลง CSV ↔ Excel", desc: "อัปไฟล์แล้วดาวน์โหลดเป็นอีกนามสกุล · อ่านไฟล์ Excel เพี้ยน (MOMO) แล้ว export กลับเป็น .xlsx มาตรฐานได้", icon: "🔄", category: "excel", href: "/csv-excel", status: "ready", keywords: ["csv", "excel", "xlsx", "แปลง", "convert", "แปลงไฟล์", "momo", "ซ่อมไฟล์"] },
  { id: "random-name", name: "สุ่มรายชื่อ", desc: "สุ่มเลือกรายชื่อจากลิสต์", icon: "🎲", category: "excel", status: "soon", keywords: ["random", "สุ่ม", "รายชื่อ"] },

  // ---- งานเอกสาร (soon) ----
  { id: "merge-pdf", name: "รวม PDF", desc: "รวมหลาย PDF เป็นไฟล์เดียว", icon: "📄", category: "docs", status: "soon", keywords: ["pdf", "รวม", "merge"] },
  { id: "split-pdf", name: "แยก PDF", desc: "แยกหน้า PDF ออกจากกัน", icon: "✂️", category: "docs", status: "soon", keywords: ["pdf", "แยก", "split"] },
  { id: "ocr", name: "ดึงข้อความจากรูป/PDF (OCR)", desc: "อ่านตัวอักษรจากภาพหรือ PDF", icon: "🔠", category: "docs", status: "soon", keywords: ["ocr", "ดึงข้อความ", "text"] },
  { id: "pdf-to-excel", name: "ดึงตารางจาก PDF เป็น Excel", desc: "แปลงตารางใน PDF เป็นสเปรดชีต", icon: "📊", category: "docs", status: "soon", keywords: ["pdf", "excel", "table", "ตาราง"] },
  { id: "ai-summarize-doc", name: "AI สรุปเอกสาร", desc: "ย่อเอกสารยาวให้เหลือใจความ", icon: "🤖", category: "docs", status: "soon", keywords: ["ai", "สรุป", "summary"] },

  // ---- งานรูปภาพ (soon) ----
  { id: "remove-bg", name: "ลบพื้นหลัง", desc: "ลบพื้นหลังรูปอัตโนมัติ", icon: "🪄", category: "image", status: "soon", keywords: ["background", "พื้นหลัง", "remove"] },
  { id: "resize-image", name: "ย่อ/ขยายรูปหลายรูป", desc: "ปรับขนาดรูปทีละหลายไฟล์", icon: "🖼️", category: "image", status: "soon", keywords: ["resize", "ย่อ", "ขยาย", "รูป"] },
  { id: "compress-image", name: "บีบอัดรูปภาพ", desc: "ลดขนาดไฟล์รูปโดยคงคุณภาพ", icon: "🗜️", category: "image", status: "soon", keywords: ["compress", "บีบอัด", "รูป"] },
  { id: "convert-image", name: "แปลง PNG / JPG / WEBP", desc: "แปลงชนิดไฟล์รูปภาพ", icon: "🔄", category: "image", status: "soon", keywords: ["png", "jpg", "webp", "แปลง"] },

  // ---- เครื่องมือ AI (soon) ----
  { id: "ai-translate", name: "AI แปลภาษา", desc: "แปลข้อความหลายภาษา", icon: "🌍", category: "ai", status: "soon", keywords: ["translate", "แปล", "ภาษา"] },
  { id: "ai-email", name: "AI เขียน/ตอบอีเมล", desc: "ร่างและตอบอีเมลให้", icon: "✉️", category: "ai", status: "soon", keywords: ["email", "อีเมล", "เขียน"] },
  { id: "ai-prompt", name: "AI ปรับ Prompt ให้ดีขึ้น", desc: "ปรับ/แปล prompt ให้ได้ผลดีขึ้น", icon: "✨", category: "ai", status: "soon", keywords: ["prompt", "ai"] },
  { id: "ai-meeting", name: "AI สรุปการประชุม", desc: "ย่อบันทึกการประชุมเป็นสรุป", icon: "📝", category: "ai", status: "soon", keywords: ["meeting", "ประชุม", "สรุป"] },

  // ---- งานออฟฟิศ (soon) ----
  { id: "quotation", name: "สร้างใบเสนอราคา", desc: "ออกใบเสนอราคาแบบเร็ว", icon: "🧾", category: "office", status: "soon", keywords: ["quotation", "ใบเสนอราคา"] },
  { id: "invoice", name: "สร้างใบแจ้งหนี้", desc: "ออกใบแจ้งหนี้พร้อมพิมพ์", icon: "🧾", category: "office", status: "soon", keywords: ["invoice", "ใบแจ้งหนี้"] },
  { id: "qr", name: "สร้าง QR Code", desc: "สร้าง QR จากข้อความ/ลิงก์", icon: "🔳", category: "office", status: "soon", keywords: ["qr", "qrcode"] },
  { id: "barcode", name: "สร้างบาร์โค้ด", desc: "สร้างบาร์โค้ดจากรหัส", icon: "▮", category: "office", status: "soon", keywords: ["barcode", "บาร์โค้ด"] },

  // ---- สำหรับโปรแกรมเมอร์ (soon) ----
  { id: "json-format", name: "จัดรูปแบบ JSON", desc: "วาง JSON → beautify/minify + เรียง key + จับ JSON เสียบอกบรรทัด (เช็ค payload MOMO/Supabase)", icon: "🧬", category: "dev", href: "/json", status: "ready", keywords: ["json", "format", "beautify", "minify", "จัดรูป", "ย่อ", "pretty", "api", "payload", "momo", "supabase"] },
  { id: "sql-format", name: "จัดรูปแบบ SQL", desc: "จัด SQL ให้อ่านง่าย", icon: "🗃️", category: "dev", status: "soon", keywords: ["sql", "format"] },
  { id: "regex-test", name: "ทดสอบ Regex", desc: "ลองรูปแบบการค้นหาข้อความ", icon: "🔤", category: "dev", status: "soon", keywords: ["regex", "pattern"] },
  { id: "base64", name: "แปลง Base64", desc: "เข้ารหัส/ถอดรหัส Base64", icon: "🔡", category: "dev", status: "soon", keywords: ["base64", "encode", "decode"] },
  { id: "url-encode", name: "เข้ารหัส / ถอดรหัส URL", desc: "encode/decode URL", icon: "🔗", category: "dev", status: "soon", keywords: ["url", "encode", "decode"] },

  // ---- เครื่องคำนวณ (soon) ----
  { id: "vat", name: "คำนวณ VAT", desc: "คิดภาษีมูลค่าเพิ่ม 7%", icon: "🧮", category: "calc", status: "soon", keywords: ["vat", "ภาษี", "7%"] },
  { id: "profit", name: "คำนวณกำไร", desc: "คิดกำไร/มาร์จิ้นจากต้นทุน-ราคาขาย", icon: "💰", category: "calc", status: "soon", keywords: ["profit", "กำไร", "margin"] },
];

export function toolsByCategory(catId: string): Tool[] {
  return TOOLS.filter((t) => t.category === catId);
}

export function readyTools(): Tool[] {
  return TOOLS.filter((t) => t.status === "ready");
}

// ค้นหาแบบง่าย: match ชื่อ/คำอธิบาย/keywords (ไม่สนตัวพิมพ์)
export function searchTools(query: string): Tool[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const terms = q.split(/\s+/);
  return TOOLS.filter((t) => {
    const hay = [t.name, t.desc, ...t.keywords].join(" ").toLowerCase();
    return terms.every((term) => hay.includes(term));
  });
}

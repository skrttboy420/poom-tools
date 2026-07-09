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
  { id: "compare-json", name: "เปรียบเทียบ JSON", desc: "วาง JSON 2 ชุด → ไล่ลึกทุกชั้น เห็นว่าอะไรเปลี่ยน/เพิ่ม/หาย ตรง path ไหน + export ความต่าง", icon: "🧬", category: "compare", href: "/compare-json", status: "ready", keywords: ["json", "เทียบ", "diff", "compare", "payload", "momo", "api", "เปรียบเทียบ", "ความต่าง"] },
  { id: "compare-text", name: "เทียบข้อความ", desc: "วางข้อความ 2 ชุด → เทียบทีละบรรทัด (LCS) เห็นบรรทัดเพิ่ม/หาย เช่น list tracking 2 รอบ, config เก่า↔ใหม่", icon: "🔀", category: "compare", href: "/compare-text", status: "ready", keywords: ["text", "diff", "เทียบ", "ข้อความ", "บรรทัด", "compare", "list", "tracking", "เปรียบเทียบ"] },
  { id: "list-compare", name: "เทียบ 2 รายการ", desc: "วาง 2 ลิสต์ (ทีละบรรทัด) เช่น tracking จาก packing list ↔ Pacred → บอกทันทีว่าตัวไหนเฉพาะ A / เฉพาะ B / มีทั้งคู่ (reconcile เบา ๆ ไม่ต้องอัปไฟล์)", icon: "🔁", category: "compare", href: "/list-compare", status: "ready", keywords: ["list", "เทียบ", "compare", "set", "tracking", "รายการ", "diff", "เฉพาะ", "ทั้งคู่", "หาย", "reconcile", "เปรียบเทียบ"] },

  // ---- จัดระเบียบ & ตรวจข้อมูล (soon) ----
  { id: "dedup", name: "ลบข้อมูลซ้ำ", desc: "หากลุ่มแถวซ้ำ (ทั้งแถว หรือตามคอลัมน์) โชว์ให้ดูก่อนลบ แล้วดาวน์โหลดผลไม่มีซ้ำ", icon: "♻️", category: "clean", href: "/dedup", status: "ready", keywords: ["ซ้ำ", "duplicate", "dedup", "unique", "ลบซ้ำ", "แถวซ้ำ", "tracking ซ้ำ"] },
  { id: "cleaner", name: "Data Cleaner / normalizer", desc: "จัดรูปข้อมูลก่อนเข้า Pacred: trim ช่องว่าง, จัดรูปตัวเลข, normalize tracking, ลบแถวว่าง", icon: "🪥", category: "clean", href: "/clean", status: "ready", keywords: ["clean", "normalize", "จัดรูป", "trim", "cleaner", "จัดระเบียบ", "ล้างข้อมูล"] },
  { id: "smart-filter", name: "ค้นหา & กรองข้อมูล", desc: "หา/กรองแถวในไฟล์ใหญ่ — ค้นเร็วทุกคอลัมน์ หรือตั้งเงื่อนไขหลายชั้น (AND/OR) แล้ว export ผลกรอง", icon: "🔎", category: "clean", href: "/filter", status: "ready", keywords: ["filter", "search", "กรอง", "ค้นหา", "หา", "เงื่อนไข", "tracking", "ตู้", "น้ำหนัก"] },

  // ---- โลจิสติกส์ (soon) ----
  { id: "invoice-vs-packing", name: "เทียบ Invoice กับ Packing List", desc: "เช็คว่า Invoice ตรงกับ Packing List ไหม", icon: "🧾", category: "logistics", status: "soon", keywords: ["invoice", "packing", "เทียบ", "ใบแจ้งหนี้"] },
  { id: "cbm-calc", name: "คำนวณ CBM", desc: "คำนวณปริมาตร (คิว) จากกว้าง×ยาว×สูง × จำนวนกล่อง + น้ำหนักเชิงปริมาตร", icon: "📐", category: "logistics", href: "/cbm", status: "ready", keywords: ["cbm", "คิว", "ปริมาตร", "volume", "freight", "ค่าระวาง", "คำนวณ"] },
  { id: "container-load", name: "จัดเรียงสินค้าในตู้", desc: "ประเมินการโหลดตู้คอนเทนเนอร์", icon: "🚛", category: "logistics", status: "soon", keywords: ["container", "ตู้", "load", "โหลด"] },
  { id: "unit-convert", name: "แปลงหน่วย", desc: "น้ำหนัก/ความยาว/ปริมาตร — พิมพ์ครั้งเดียวเห็นทุกหน่วย (inch↔cm, lb↔kg, ft³↔CBM)", icon: "⚖️", category: "logistics", href: "/convert", status: "ready", keywords: ["unit", "แปลงหน่วย", "kg", "lb", "cm", "inch", "convert", "ปอนด์", "นิ้ว", "ฟุต", "cbm"] },
  { id: "fx-rate", name: "คำนวณอัตราแลกเปลี่ยน", desc: "แปลงสกุลเงินตามเรตล่าสุด", icon: "💱", category: "logistics", status: "soon", keywords: ["fx", "exchange", "อัตราแลกเปลี่ยน", "เรต"] },

  // ---- Excel & ข้อมูล (soon) ----
  { id: "merge-excel", name: "รวมหลายไฟล์ Excel", desc: "ลากหลายไฟล์มาวางพร้อมกัน → รวมเป็นไฟล์เดียว จับคอลัมน์ตามชื่อหัวตาราง (กันสลับ) เพิ่มคอลัมน์ต้นทางได้ · ทุกแถวไม่หาย", icon: "🧩", category: "excel", href: "/merge", status: "ready", keywords: ["merge", "รวม", "excel", "รวมไฟล์", "รวมชีต", "consolidate", "packing", "ตู้", "หลายไฟล์"] },
  { id: "split-excel", name: "แยกไฟล์ Excel", desc: "แยกไฟล์เดียวเป็นหลายกลุ่ม ตามค่าคอลัมน์ (เช่น แยกตามตู้) หรือจำนวนแถว → ดาวน์โหลดเป็น Excel ชีตละกลุ่ม/CSV แยกกลุ่ม", icon: "✂️", category: "excel", href: "/split", status: "ready", keywords: ["split", "แยก", "excel", "แยกไฟล์", "container", "ตู้", "แยกตามคอลัมน์", "chunk"] },
  { id: "csv-excel", name: "แปลง CSV ↔ Excel", desc: "อัปไฟล์แล้วดาวน์โหลดเป็นอีกนามสกุล · อ่านไฟล์ Excel เพี้ยน (MOMO) แล้ว export กลับเป็น .xlsx มาตรฐานได้", icon: "🔄", category: "excel", href: "/csv-excel", status: "ready", keywords: ["csv", "excel", "xlsx", "แปลง", "convert", "แปลงไฟล์", "momo", "ซ่อมไฟล์"] },
  { id: "random-name", name: "สุ่มรายชื่อ", desc: "สุ่มผู้โชคดี / สลับลำดับ / แบ่งกลุ่มเท่า ๆ กัน (ใส่ seed ทำซ้ำได้)", icon: "🎲", category: "excel", href: "/random", status: "ready", keywords: ["random", "สุ่ม", "รายชื่อ", "shuffle", "สลับ", "กลุ่ม", "group", "จับฉลาก"] },
  { id: "column-stats", name: "สรุปยอด & สถิติคอลัมน์", desc: "อัปโหลดไฟล์ → รู้ยอดรวม/เฉลี่ย/ต่ำสุด/สูงสุด ของทุกคอลัมน์ทันที (น้ำหนัก/CBM/กล่อง) + นับช่องว่าง/ศูนย์/ค่าไม่ซ้ำ", icon: "📊", category: "excel", href: "/stats", status: "ready", keywords: ["stats", "สถิติ", "สรุป", "ยอดรวม", "sum", "total", "เฉลี่ย", "average", "น้ำหนัก", "cbm", "กล่อง", "รวม", "summary"] },
  { id: "pluck-columns", name: "เลือก/จัดเรียงคอลัมน์", desc: "ตัดตารางให้เหลือเฉพาะคอลัมน์ที่ต้องการ + สลับลำดับ + เปลี่ยนชื่อหัว + เพิ่มคอลัมน์ค่าคงที่ (เช่น ติดเลขตู้ทุกแถว) ก่อน export เข้า Pacred", icon: "🧲", category: "excel", href: "/columns", status: "ready", keywords: ["column", "คอลัมน์", "เลือกคอลัมน์", "จัดเรียง", "reorder", "rename", "เปลี่ยนชื่อ", "ตัดคอลัมน์", "pluck", "reshape", "map", "ค่าคงที่", "ตู้"] },
  { id: "group-by", name: "สรุปยอดแบบจัดกลุ่ม", desc: "จัดกลุ่มแถวตามคอลัมน์ (เช่น เลขตู้/forwarder) แล้วรวม/เฉลี่ย/นับ ยอดน้ำหนัก/CBM/กล่อง ต่อกลุ่ม + แถวรวมทั้งหมด (pivot เบา ๆ)", icon: "🧮", category: "excel", href: "/group", status: "ready", keywords: ["group", "จัดกลุ่ม", "สรุป", "pivot", "รวมต่อกลุ่ม", "ต่อตู้", "container", "ตู้", "sum", "aggregate", "group by", "สรุปยอด", "รวมน้ำหนัก"] },
  { id: "sort-table", name: "เรียงลำดับตาราง", desc: "เรียงแถวตามหลายคอลัมน์ (เช่น ตู้ แล้วน้ำหนักมาก→น้อย) · รู้จักตัวเลข (เรียงเลขจริง ไม่ใช่ string) · ช่องว่างไปท้าย · แถวไม่หาย", icon: "↕️", category: "excel", href: "/sort", status: "ready", keywords: ["sort", "เรียง", "เรียงลำดับ", "จัดเรียง", "order", "sort by", "มากไปน้อย", "น้อยไปมาก", "asc", "desc", "เรียงน้ำหนัก", "เรียงตู้"] },
  { id: "fill-down", name: "เติมค่าลงล่าง", desc: "เติมช่องว่างด้วยค่าล่าสุดด้านบน (เช่น เลขตู้ที่มีแค่แถวแรกของกลุ่มแบบ iTAM → เติมให้ครบทุกแถว) · เติมเฉพาะช่องว่าง ไม่ทับค่าเดิม · แถวไม่หาย", icon: "⬇️", category: "excel", href: "/fill", status: "ready", keywords: ["fill", "เติม", "เติมค่า", "fill down", "เติมลงล่าง", "ช่องว่าง", "blank", "container", "ตู้", "merge cell", "เซลล์รวม", "forward fill", "iTAM"] },
  { id: "lookup", name: "ดึงข้อมูลข้ามไฟล์ (VLOOKUP)", desc: "ไฟล์หลัก (A) ดึงคอลัมน์จากไฟล์อ้างอิง (B) โดย match ตาม key เช่น เติมน้ำหนัก/เลขตู้จาก export อีกไฟล์เข้า packing list · ทุกแถว A อยู่ครบ ไม่หาย", icon: "🔗", category: "excel", href: "/lookup", status: "ready", keywords: ["vlookup", "lookup", "ดึงข้อมูล", "join", "เชื่อม", "key", "match", "เทียบ", "merge", "รวมคอลัมน์", "enrich", "เติมคอลัมน์", "tracking", "ตู้", "น้ำหนัก", "ข้ามไฟล์"] },

  // ---- งานเอกสาร (soon) ----
  { id: "merge-pdf", name: "รวม PDF", desc: "รวมหลาย PDF เป็นไฟล์เดียว", icon: "📄", category: "docs", status: "soon", keywords: ["pdf", "รวม", "merge"] },
  { id: "split-pdf", name: "แยก PDF", desc: "แยกหน้า PDF ออกจากกัน", icon: "✂️", category: "docs", status: "soon", keywords: ["pdf", "แยก", "split"] },
  { id: "ocr", name: "ดึงข้อความจากรูป/PDF (OCR)", desc: "อ่านตัวอักษรจากภาพหรือ PDF", icon: "🔠", category: "docs", status: "soon", keywords: ["ocr", "ดึงข้อความ", "text"] },
  { id: "pdf-to-excel", name: "ดึงตารางจาก PDF เป็น Excel", desc: "แปลงตารางใน PDF เป็นสเปรดชีต", icon: "📊", category: "docs", status: "soon", keywords: ["pdf", "excel", "table", "ตาราง"] },
  { id: "ai-summarize-doc", name: "AI สรุปเอกสาร", desc: "ย่อเอกสารยาวให้เหลือใจความ", icon: "🤖", category: "docs", status: "soon", keywords: ["ai", "สรุป", "summary"] },

  // ---- งานรูปภาพ (soon) ----
  { id: "remove-bg", name: "ลบพื้นหลัง", desc: "ลบพื้นหลังรูปอัตโนมัติ", icon: "🪄", category: "image", status: "soon", keywords: ["background", "พื้นหลัง", "remove"] },
  { id: "resize-image", name: "ย่อ/ขยายรูป", desc: "ปรับขนาดรูป (คงอัตราส่วน · ทำในเครื่องล้วน)", icon: "🖼️", category: "image", href: "/image", status: "ready", keywords: ["resize", "ย่อ", "ขยาย", "รูป", "ขนาด", "scale"] },
  { id: "compress-image", name: "บีบอัดรูปภาพ", desc: "ลดขนาดไฟล์รูป (ปรับคุณภาพ JPG/WEBP)", icon: "🗜️", category: "image", href: "/image", status: "ready", keywords: ["compress", "บีบอัด", "รูป", "ลดขนาด", "quality"] },
  { id: "convert-image", name: "แปลง PNG / JPG / WEBP", desc: "แปลงชนิดไฟล์รูป + ย่อ + บีบอัด (ทำในเครื่องล้วน)", icon: "🔄", category: "image", href: "/image", status: "ready", keywords: ["png", "jpg", "jpeg", "webp", "แปลง", "convert", "รูป", "image"] },

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
  { id: "json-csv", name: "แปลง JSON ↔ ตาราง/CSV", desc: "เปลี่ยน response JSON (MOMO API/Supabase) เป็นตาราง/CSV ดูง่าย · หรือ CSV → JSON array of objects · แผ่ object ซ้อนได้ · คงเลข 0 นำหน้า", icon: "🔧", category: "dev", href: "/json-csv", status: "ready", keywords: ["json", "csv", "แปลง", "convert", "table", "ตาราง", "api", "momo", "supabase", "flatten", "array", "object"] },
  { id: "sql-format", name: "จัดรูปแบบ SQL", desc: "จัด SQL ให้อ่านง่าย (ปลอดภัยเชิงความหมาย — ไม่แตะ operator/string/comment)", icon: "🗃️", category: "dev", href: "/sql", status: "ready", keywords: ["sql", "format", "query", "beautify", "pretty", "จัดรูป", "supabase", "pacred"] },
  { id: "regex-test", name: "ทดสอบ Regex", desc: "ลอง pattern กับข้อความจริง เห็น match/capture group + ไฮไลต์ + ลอง replace ($1 $<name>) ก่อนเอาไป clean ข้อมูล", icon: "🔤", category: "dev", href: "/regex", status: "ready", keywords: ["regex", "pattern", "match", "แทนที่", "replace", "ดึงข้อมูล", "capture", "ทดสอบ"] },
  { id: "base64", name: "แปลง Base64", desc: "เข้ารหัส/ถอดรหัส Base64 (รองรับ UTF-8/ไทย + Base64URL) — เช็ค payload/token ของ MOMO/Supabase", icon: "🔡", category: "dev", href: "/encode", status: "ready", keywords: ["base64", "encode", "decode", "เข้ารหัส", "ถอดรหัส", "token", "payload", "base64url"] },
  { id: "url-encode", name: "เข้ารหัส / ถอดรหัส URL", desc: "encode/decode URL — escape ค่าใส่ query string หรืออ่าน URL ที่ถูก encode", icon: "🔗", category: "dev", href: "/encode", status: "ready", keywords: ["url", "encode", "decode", "escape", "query", "uri", "เข้ารหัส", "ถอดรหัส"] },

  // ---- เครื่องคำนวณ (soon) ----
  { id: "vat", name: "คำนวณ VAT", desc: "บวก/ถอด VAT 7% แยกฐาน-ภาษี-ยอดรวม", icon: "🧮", category: "calc", status: "ready", href: "/calc", keywords: ["vat", "ภาษี", "7%", "มูลค่าเพิ่ม", "ถอดภาษี", "tax"] },
  { id: "profit", name: "คำนวณกำไร / ตั้งราคา", desc: "กำไร/มาร์จิ้น/มาร์กอัป + หาราคาขายจาก % ที่อยากได้", icon: "💰", category: "calc", status: "ready", href: "/calc", keywords: ["profit", "กำไร", "margin", "markup", "มาร์จิ้น", "ตั้งราคา", "quote", "ราคาขาย"] },
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

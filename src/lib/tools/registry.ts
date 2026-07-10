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
  {
    id: "seq-gap",
    name: "ตรวจเลขขาดช่วง (Sequence Gap)",
    desc: "หาเลขที่หายในลำดับที่ควรต่อเนื่อง เช่น เลขกล่อง/เลขใบ 1-500 แต่บางเลขหาย + จับเลขซ้ำ",
    icon: "🕳️",
    category: "clean",
    href: "/seq-gap",
    status: "ready",
    keywords: ["เลขขาด", "เลขหาย", "ลำดับ", "sequence", "gap", "missing number", "เลขกล่อง", "box", "running", "เลขใบ", "invoice", "ต่อเนื่อง", "ขาดช่วง", "ซ้ำ", "เลขที่หาย", "consecutive", "ครบไหม"],
  },
  {
    id: "near-dup",
    name: "หาค่าที่คล้ายกัน (Near-duplicate)",
    desc: "หาคู่ค่าที่คล้ายกันแต่ไม่เหมือนเป๊ะ (พิมพ์ผิด O↔0, สลับตัวอักษร, ช่องว่างเกิน) ในคอลัมน์เดียว เช่น tracking/เลขตู้ ที่ทำให้ reconcile จับคู่ไม่ติด/นับซ้ำ · ใช้ระยะแก้ไข (edit distance) · โชว์คู่น่าสงสัยให้ดูก่อน ไม่แก้ให้อัตโนมัติ",
    icon: "🫧",
    category: "clean",
    href: "/near-dup",
    status: "ready",
    keywords: ["near duplicate", "คล้ายกัน", "ใกล้เคียง", "fuzzy", "fuzzy match", "พิมพ์ผิด", "typo", "edit distance", "levenshtein", "ระยะแก้ไข", "similarity", "ความคล้าย", "tracking", "ตู้", "container", "reconcile", "จับคู่ไม่ติด", "นับซ้ำ", "O แทน 0", "สลับตัวอักษร", "เกือบซ้ำ"],
  },
  {
    id: "outlier",
    name: "จับค่าตัวเลขผิดปกติ (Outlier)",
    desc: "หาค่าน้ำหนัก/CBM/จำนวนที่สูง-ต่ำผิดปกติเทียบกับเพื่อน ๆ (น่าจะกรอกผิด เกินศูนย์/จุดทศนิยมเลื่อน) — /gap จับแค่ 0/ว่าง อันนี้จับค่าที่มีอยู่แต่ผิดปกติ · IQR/z-score · โชว์ให้ดูก่อน ไม่แก้ให้",
    icon: "🚩",
    category: "clean",
    href: "/outlier",
    status: "ready",
    keywords: ["outlier", "ผิดปกติ", "anomaly", "ค่าผิด", "กรอกผิด", "เกินศูนย์", "จุดทศนิยม", "iqr", "z-score", "zscore", "น้ำหนัก", "weight", "kg", "cbm", "ปริมาตร", "สูงผิดปกติ", "ต่ำผิดปกติ", "สถิติ", "quartile", "ค่าเบี่ยงเบน", "outliers", "detect", "แปลกปลอม", "เพี้ยน"],
  },
  {
    id: "validate",
    name: "ตรวจความถูกต้องตามกฎ (Data Validation)",
    desc: "ตั้งกฎที่ข้อมูลควรเป็น (ต้องมีค่า/เป็นตัวเลข/อยู่ในช่วง/ตรง pattern/อยู่ในรายการ/ห้ามซ้ำ) → บอกว่าแถวไหนช่องไหนผิดกฎอะไร ก่อนเอาเข้า Pacred · /gap จับแค่ 0/ว่าง · /outlier จับค่าเพี้ยนสถิติ · อันนี้ rule-based · โชว์ให้ดูก่อน ไม่แก้ให้",
    icon: "🛡️",
    category: "clean",
    href: "/validate",
    status: "ready",
    keywords: ["validate", "validation", "ตรวจสอบ", "ตรวจความถูกต้อง", "กฎ", "rule", "required", "ต้องมีค่า", "pattern", "regex", "รูปแบบ", "allowed", "รายการ", "unique", "ห้ามซ้ำ", "min", "max", "ช่วง", "range", "integer", "จำนวนเต็ม", "ตัวเลข", "number", "ตรวจก่อนเข้า", "pacred", "data quality", "คุณภาพข้อมูล", "ผิดกฎ"],
  },
  {
    id: "extract",
    name: "ดึงข้อความด้วย pattern",
    desc: "ดึงส่วนที่ตรง regex ออกจากช่องเดียว (เช่น เลขตู้ในช่อง note/รายละเอียด) มาเป็นคอลัมน์ใหม่ · capture group → 1 คอลัมน์/กลุ่ม · /split-col แยกตามตัวคั่น · /replace แทนที่ในที่เดิม · อันนี้ดึงออกมา · ไม่แก้ค่าเดิม",
    icon: "🎯",
    category: "clean",
    href: "/extract",
    status: "ready",
    keywords: ["extract", "ดึง", "regex", "pattern", "capture", "container", "เลขตู้", "tracking", "ดึงเลข", "ดึงรหัส", "note", "รายละเอียด", "กลุ่ม", "group", "match", "แยกออกมา", "regexp"],
  },
  {
    id: "row-number",
    name: "ออกเลขลำดับ",
    desc: "เติมคอลัมน์เลขรัน (No. 1..N) ให้ทุกแถว — ตั้งจุดเริ่ม/ก้าว/เติม 0 นำหน้า/prefix · นับแยกต่อกลุ่ม (เลขกล่องต่อตู้) ได้ · /seq-gap หาเลขที่หาย · อันนี้สร้างเลขลำดับใหม่ · ไม่แตะข้อมูลเดิม",
    icon: "#️⃣",
    category: "clean",
    href: "/row-number",
    status: "ready",
    keywords: ["row number", "เลขลำดับ", "เลขรัน", "running number", "numbering", "ลำดับ", "index", "no.", "sequence", "auto number", "เลขที่", "เลขกล่อง", "line item", "prefix", "zero pad", "เติมศูนย์", "ต่อกลุ่ม", "ต่อตู้", "container"],
  },
  {
    id: "baht-text",
    name: "อ่านเลขเป็นบาทถ้วน",
    desc: "แปลงจำนวนเงินเป็นข้อความไทย (บาทถ้วน/สตางค์) — ไว้ใส่บรรทัด \"จำนวนเงินตัวอักษร\" ในใบแจ้งหนี้/ใบกำกับ/ใบเสร็จ · รองรับคอมมา + ค่าติดลบ · ปัดเศษเป็นสตางค์",
    icon: "💰",
    category: "office",
    href: "/baht-text",
    status: "ready",
    keywords: ["baht text", "บาทถ้วน", "อ่านเลข", "ตัวอักษร", "จำนวนเงิน", "เงิน", "สตางค์", "thai", "number to words", "spell", "invoice", "ใบแจ้งหนี้", "ใบกำกับ", "ใบเสร็จ", "ใบเสนอราคา", "ตัวเลขเป็นคำ", "อ่านจำนวนเงิน"],
  },
  {
    id: "value-map",
    name: "แมปค่าตามพจนานุกรม",
    desc: "แทนค่าทั้งคอลัมน์ทีเดียวตามพจนานุกรมที่พิมพ์เอง (รหัส forwarder → ชื่อเต็ม, รหัสสถานะ/ประเทศ → ข้อความ) · /replace แทนทีละคู่ · /lookup ดึงจากไฟล์ · อันนี้ใส่หลายคู่แล้วแทนทีเดียว · ค่าที่ไม่มี → เก็บของเดิม โชว์ก่อน",
    icon: "🗺️",
    category: "excel",
    href: "/map",
    status: "ready",
    keywords: ["value map", "แมปค่า", "แมปปิ้ง", "mapping", "พจนานุกรม", "dictionary", "แทนค่า", "รหัส", "code", "แปลงรหัส", "รหัสเป็นชื่อ", "forwarder", "สถานะ", "status", "ประเทศ", "country", "ท่าเรือ", "port", "lookup table", "translate", "recode", "แทนที่ทั้งคอลัมน์"],
  },
  {
    id: "container-check",
    name: "ตรวจเลขตู้คอนเทนเนอร์",
    desc: "ตรวจเช็คดิจิต (check digit) ตามมาตรฐาน ISO 6346 — จับเลขตู้พิมพ์ผิดในไฟล์ก่อนเอาเข้า Pacred · ไม่แก้เลขเดิม แค่เพิ่มคอลัมน์ 'ผลตรวจ' แล้วโชว์ตัวที่ผิดให้เช็คก่อน",
    icon: "📦",
    category: "logistics",
    href: "/container-check",
    status: "ready",
    keywords: ["container", "เลขตู้", "ตู้", "คอนเทนเนอร์", "iso 6346", "check digit", "เช็คดิจิต", "ตรวจเลขตู้", "validate", "typo", "พิมพ์ผิด", "container number", "cntr", "ตรวจตู้", "หลักตรวจสอบ", "container check"],
  },
  {
    id: "thai-id",
    name: "ตรวจเลขบัตร ปชช. / ผู้เสียภาษี",
    desc: "ตรวจเช็คดิจิต (หลักที่ 13) ของเลขบัตรประชาชน/เลขประจำตัวผู้เสียภาษี 13 หลัก — จับเลขพิมพ์ผิดในไฟล์ก่อนเอาเข้า Pacred · ไม่แก้เลขเดิม แค่เพิ่มคอลัมน์ 'ผลตรวจ' แล้วโชว์ตัวที่ผิดให้เช็คก่อน",
    icon: "🪪",
    category: "office",
    href: "/thai-id",
    status: "ready",
    keywords: ["บัตรประชาชน", "เลขบัตรประชาชน", "ประชาชน", "เลขผู้เสียภาษี", "ผู้เสียภาษี", "ภาษี", "tax id", "national id", "nid", "citizen id", "juristic", "นิติบุคคล", "13 หลัก", "check digit", "เช็คดิจิต", "ตรวจเลข", "validate", "typo", "พิมพ์ผิด", "เลขประจำตัว", "หลักตรวจสอบ"],
  },
  {
    id: "pad",
    name: "เติมเลข 0 นำหน้า / จัดความกว้างรหัส",
    desc: "แก้ปัญหา '007' กลายเป็น '7' (Excel/CSV ตัดเลข 0 นำหน้า) — เติมให้ครบความกว้างเดียวกันก่อนเทียบ/เข้า Pacred · เติมอย่างเดียว = ปลอดภัย ไม่ลบของเดิม",
    icon: "🔢",
    category: "excel",
    href: "/pad",
    status: "ready",
    keywords: ["pad", "เติมศูนย์", "เติม 0", "เลข 0 นำหน้า", "leading zero", "จัดความกว้าง", "จัดรูปรหัส", "รหัส", "code", "zero pad", "ความยาว", "width", "truncate", "ตัดความยาว", "normalize", "เลขกล่อง", "007", "align", "จัดคอลัมน์", "format code"],
  },
  {
    id: "case",
    name: "แปลงตัวพิมพ์ใหญ่/เล็ก",
    desc: "normalize ตัวพิมพ์ในคอลัมน์ (เช่น 'ky001' ↔ 'KY001') ให้เป็นแบบเดียวก่อนเทียบ/เข้า Pacred — ตัวใหญ่/ตัวเล็ก/ขึ้นต้นคำ/ขึ้นต้นประโยค · แค่เปลี่ยนตัวพิมพ์ ไม่ลบ/เพิ่มตัวอักษร · ภาษาไทยไม่กระทบ",
    icon: "🔠",
    category: "excel",
    href: "/case",
    status: "ready",
    keywords: ["case", "ตัวพิมพ์", "ตัวใหญ่", "ตัวเล็ก", "uppercase", "lowercase", "title case", "sentence case", "แปลงตัวพิมพ์", "พิมพ์ใหญ่", "พิมพ์เล็ก", "capitalize", "normalize", "รหัส", "tracking", "forwarder", "ขึ้นต้นคำ", "ขึ้นต้นประโยค", "upper", "lower"],
  },
  {
    id: "schema",
    name: "ส่องชนิดข้อมูลแต่ละคอลัมน์",
    desc: "รู้จักไฟล์ก่อนลงมือ — เดาชนิดข้อมูลทุกคอลัมน์ (จำนวนเต็ม/ทศนิยม/วันที่/ข้อความ) + ชี้ 'ค่าที่ไม่เข้าพวก' จับ typo/ข้อมูลปน + เตือนคอลัมน์เลข 0 นำหน้า (Excel อาจตัดหาย) · อ่านอย่างเดียว ไม่แก้ข้อมูล",
    icon: "🔬",
    category: "clean",
    href: "/schema",
    status: "ready",
    keywords: ["schema", "ชนิดข้อมูล", "ชนิด", "type", "profiler", "profile", "ส่อง", "ตรวจไฟล์", "inspect", "รู้จักไฟล์", "data type", "column type", "typo", "ค่าแปลก", "ค่าไม่เข้าพวก", "เลข 0 นำหน้า", "leading zero", "distinct", "ตรวจคอลัมน์", "วิเคราะห์", "รู้จักข้อมูล", "integer", "decimal", "date"],
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
  { id: "hidden-chars", name: "ตรวจอักขระซ่อน & ช่องว่างแปลก", desc: "ส่องหาตัวที่ตาไม่เห็น — NBSP (U+00A0), zero-width, ช่องว่างหัว-ท้าย, Tab ที่ทำให้ tracking \"ดูเหมือนกัน\" แต่ match ไม่ได้ · แสดงก่อนแล้วค่อยล้าง ไม่ทำแถวหาย · แก้ปัญหา reconcile ที่หาสาเหตุไม่เจอ", icon: "👻", category: "clean", href: "/whitespace", status: "ready", keywords: ["whitespace", "ช่องว่าง", "nbsp", "zero-width", "อักขระซ่อน", "invisible", "hidden", "trim", "control char", "tab", "unicode", "match ไม่ได้", "เหมือนกันแต่ไม่ตรง", "tracking", "ล่องหน", "อักขระแปลก", "encoding"] },
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
  { id: "value-frequency", name: "นับความถี่ค่า (Value Frequency)", desc: "เลือก 1 คอลัมน์ → รู้ทันทีว่าค่าไหนโผล่กี่ครั้ง + สัดส่วน % + % สะสม (Pareto) เช่น มีกี่รายการต่อ forwarder / ต่อเลขตู้ / ต่อสถานะ · เร็วกว่าจัดกลุ่ม อ่านอย่างเดียวไม่แก้ข้อมูล", icon: "🔢", category: "excel", href: "/frequency", status: "ready", keywords: ["frequency", "ความถี่", "นับ", "count", "countif", "value counts", "tally", "pareto", "สัดส่วน", "distinct", "ค่าซ้ำ", "histogram", "กี่ครั้ง", "forwarder", "ตู้", "สถานะ", "จำนวนต่อ"] },
  { id: "pluck-columns", name: "เลือก/จัดเรียงคอลัมน์", desc: "ตัดตารางให้เหลือเฉพาะคอลัมน์ที่ต้องการ + สลับลำดับ + เปลี่ยนชื่อหัว + เพิ่มคอลัมน์ค่าคงที่ (เช่น ติดเลขตู้ทุกแถว) ก่อน export เข้า Pacred", icon: "🧲", category: "excel", href: "/columns", status: "ready", keywords: ["column", "คอลัมน์", "เลือกคอลัมน์", "จัดเรียง", "reorder", "rename", "เปลี่ยนชื่อ", "ตัดคอลัมน์", "pluck", "reshape", "map", "ค่าคงที่", "ตู้"] },
  { id: "group-by", name: "สรุปยอดแบบจัดกลุ่ม", desc: "จัดกลุ่มแถวตามคอลัมน์ (เช่น เลขตู้/forwarder) แล้วรวม/เฉลี่ย/นับ ยอดน้ำหนัก/CBM/กล่อง ต่อกลุ่ม + แถวรวมทั้งหมด (pivot เบา ๆ)", icon: "🧮", category: "excel", href: "/group", status: "ready", keywords: ["group", "จัดกลุ่ม", "สรุป", "pivot", "รวมต่อกลุ่ม", "ต่อตู้", "container", "ตู้", "sum", "aggregate", "group by", "สรุปยอด", "รวมน้ำหนัก"] },
  { id: "rollup", name: "รวมแถวซ้ำ (Rollup)", desc: "ยุบหลายแถวที่ key เดียวกัน (เช่น 1 tracking แตกหลายกล่อง) เป็นแถวเดียว — คอลัมน์ตัวเลขรวมยอด (kg/CBM/กล่อง), คอลัมน์อื่นเก็บค่าตัวแทน · ต่างจาก /group ที่เก็บ **ทุกคอลัมน์เดิม** ไม่ใช่แค่ key+ยอด · คีย์ว่างไม่ยุบมั่ว ไม่ทำข้อมูลหาย", icon: "🗜️", category: "excel", href: "/rollup", status: "ready", keywords: ["rollup", "รวมแถว", "ยุบแถว", "รวมแถวซ้ำ", "collapse", "aggregate", "sum", "รวมยอด", "1 tracking หลายกล่อง", "packing", "tracking", "kg", "cbm", "กล่อง", "consolidate", "ยุบ", "merge rows", "รวมตาม key"] },
  { id: "pivot-table", name: "ตารางสรุปไขว้ (Pivot)", desc: "สรุป 2 มิติในตารางเดียว — เช่น แถว = เลขตู้, คอลัมน์ = forwarder, ช่อง = รวมน้ำหนัก/นับกล่อง · มียอดรวมต่อแถว/ต่อคอลัมน์/รวมทั้งหมด · รวม/นับ/เฉลี่ย/ต่ำสุด/สูงสุด/นับไม่ซ้ำ", icon: "🔲", category: "excel", href: "/pivot", status: "ready", keywords: ["pivot", "crosstab", "ตารางไขว้", "สรุปไขว้", "2 มิติ", "ไขว้", "matrix", "summary", "container", "forwarder", "ตู้", "น้ำหนัก", "cbm", "สรุป", "pivot table", "ตารางสรุป", "cross tabulation"] },
  { id: "unpivot-table", name: "คลี่ตารางกว้าง → แนวยาว (Unpivot)", desc: "ตรงข้ามกับ Pivot — ตารางที่มีคอลัมน์ค่ากระจายหลายหัว (เช่น น้ำหนักแยกตาม forwarder เจ้าละคอลัมน์ หรือแยกตามเดือน) → คลี่เป็น 1 แถวต่อ 1 ค่า พร้อมคอลัมน์บอกว่ามาจากหัวไหน · normalize ก่อนเทียบ/จัดกลุ่ม · ไม่ทิ้งข้อมูล", icon: "🔃", category: "excel", href: "/unpivot", status: "ready", keywords: ["unpivot", "melt", "คลี่", "แนวยาว", "wide to long", "long format", "normalize", "reshape", "แปลงตาราง", "กว้างเป็นยาว", "forwarder", "เดือน", "cross tab", "matrix", "flatten"] },
  { id: "transpose-table", name: "สลับแถว ↔ คอลัมน์ (Transpose)", desc: "พลิกตาราง — แถวกลายเป็นคอลัมน์ คอลัมน์กลายเป็นแถว (เช่น report ที่หัวตารางอยู่แนวตั้ง แต่ละแถว = 1 ฟิลด์ → พลิกให้ 1 แถว = 1 record) · แค่ย้ายตำแหน่งเซลล์ ไม่แก้ค่า/ไม่ทิ้งข้อมูล", icon: "↔️", category: "excel", href: "/transpose", status: "ready", keywords: ["transpose", "สลับ", "สลับแถวคอลัมน์", "พลิกตาราง", "rows to columns", "แถวเป็นคอลัมน์", "คอลัมน์เป็นแถว", "flip", "rotate", "reshape", "แนวตั้งแนวนอน", "pivot"] },
  { id: "table-to-text", name: "ตาราง → ข้อความ (Markdown/TSV)", desc: "แปลงตารางเป็นข้อความพร้อม paste — Markdown (ลง PR/README/แชท), จัดคอลัมน์ monospace อ่านง่าย, หรือ TSV (วางเข้า Excel/Sheets แตกคอลัมน์เอง) · ชิดขวาคอลัมน์ตัวเลขให้อัตโนมัติ · แค่จัดรูป ไม่แก้ค่า", icon: "📋", category: "excel", href: "/table-text", status: "ready", keywords: ["markdown", "table", "ตาราง", "ข้อความ", "text", "tsv", "paste", "github", "readme", "pr", "monospace", "จัดคอลัมน์", "aligned", "แปลงตาราง", "code block", "แชท", "docs"] },
  { id: "sort-table", name: "เรียงลำดับตาราง", desc: "เรียงแถวตามหลายคอลัมน์ (เช่น ตู้ แล้วน้ำหนักมาก→น้อย) · รู้จักตัวเลข (เรียงเลขจริง ไม่ใช่ string) · ช่องว่างไปท้าย · แถวไม่หาย", icon: "↕️", category: "excel", href: "/sort", status: "ready", keywords: ["sort", "เรียง", "เรียงลำดับ", "จัดเรียง", "order", "sort by", "มากไปน้อย", "น้อยไปมาก", "asc", "desc", "เรียงน้ำหนัก", "เรียงตู้"] },
  { id: "fill-down", name: "เติมค่าลงล่าง", desc: "เติมช่องว่างด้วยค่าล่าสุดด้านบน (เช่น เลขตู้ที่มีแค่แถวแรกของกลุ่มแบบ iTAM → เติมให้ครบทุกแถว) · เติมเฉพาะช่องว่าง ไม่ทับค่าเดิม · แถวไม่หาย", icon: "⬇️", category: "excel", href: "/fill", status: "ready", keywords: ["fill", "เติม", "เติมค่า", "fill down", "เติมลงล่าง", "ช่องว่าง", "blank", "container", "ตู้", "merge cell", "เซลล์รวม", "forward fill", "iTAM"] },
  { id: "lookup", name: "ดึงข้อมูลข้ามไฟล์ (VLOOKUP)", desc: "ไฟล์หลัก (A) ดึงคอลัมน์จากไฟล์อ้างอิง (B) โดย match ตาม key เช่น เติมน้ำหนัก/เลขตู้จาก export อีกไฟล์เข้า packing list · ทุกแถว A อยู่ครบ ไม่หาย", icon: "🔗", category: "excel", href: "/lookup", status: "ready", keywords: ["vlookup", "lookup", "ดึงข้อมูล", "join", "เชื่อม", "key", "match", "เทียบ", "merge", "รวมคอลัมน์", "enrich", "เติมคอลัมน์", "tracking", "ตู้", "น้ำหนัก", "ข้ามไฟล์"] },
  { id: "split-column", name: "แยกคอลัมน์", desc: "แยกช่องเดียวที่มีค่าปนกัน (เช่น \"TU-A/123\", \"KY001-1\") ออกเป็นหลายคอลัมน์ตามตัวคั่น · ชิ้นเกินรวมกลับไม่ทิ้ง · ทุกแถวอยู่ครบ", icon: "✂️➡️", category: "excel", href: "/split-col", status: "ready", keywords: ["split column", "แยกคอลัมน์", "แยกช่อง", "delimiter", "ตัวคั่น", "split", "แยก", "text to columns", "tracking", "ตู้", "container", "แยกข้อความ", "parse"] },
  { id: "combine-column", name: "รวมคอลัมน์", desc: "ต่อหลายคอลัมน์เป็นคอลัมน์เดียว (เช่น ตู้+เลข → รหัสเดียว, tracking+กล่อง → key ผสม) เลือกตัวเชื่อม/ลำดับได้ · ทุกแถวอยู่ครบ", icon: "🔗➡️", category: "excel", href: "/combine-col", status: "ready", keywords: ["combine column", "รวมคอลัมน์", "ต่อคอลัมน์", "concat", "merge column", "join column", "key ผสม", "composite key", "ตัวเชื่อม", "รวมช่อง", "tracking", "ตู้", "container"] },
  { id: "replace-cell", name: "ค้นหา-แทนที่", desc: "แก้ค่าซ้ำ ๆ ทั้งไฟล์ (เช่น ตู้พิมพ์ผิด TU-A → TU-01, ลบ \"-\"/\"N/A\" เป็นว่าง, normalize ค่า) 3 โหมด: มีคำนี้/ตรงทั้งช่อง/regex · โชว์จำนวน+ตัวอย่างก่อน ไม่แก้เงียบ · แถวไม่หาย", icon: "🔁", category: "excel", href: "/replace", status: "ready", keywords: ["replace", "แทนที่", "ค้นหาแทนที่", "find replace", "หาแล้วแทน", "แก้ค่า", "regex", "normalize", "แก้พิมพ์ผิด", "ลบข้อความ", "tracking", "ตู้", "container", "bulk edit"] },
  { id: "template-text", name: "สร้างข้อความจากตาราง", desc: "แต่ละแถว → 1 บรรทัดข้อความตามรูปแบบที่วาง {ชื่อคอลัมน์} (เช่น สร้างบรรทัด paste เข้า Pacred, ข้อความแจ้งรายกล่อง, SQL VALUES) · ทุกแถวออกครบ ไม่หาย", icon: "📝", category: "excel", href: "/template", status: "ready", keywords: ["template", "เทมเพลต", "สร้างข้อความ", "mail merge", "merge", "generate", "paste", "pacred", "รูปแบบ", "format text", "message", "ข้อความ", "sql values", "tracking", "แปลงเป็นข้อความ"] },
  { id: "explode-rows", name: "แตกแถว", desc: "ช่องเดียวที่มีหลายค่าปนกัน (เช่น \"KY001, KY002, KY003\") → แตกเป็น 1 ค่าต่อ 1 แถว (คอลัมน์อื่นคัดลอกซ้ำ) เพื่อ normalize ให้เอาไปเทียบ/dedup ต่อ · ทุกแถวอยู่ครบ ไม่หาย", icon: "↕️➡️", category: "excel", href: "/explode", status: "ready", keywords: ["explode", "แตกแถว", "split rows", "แยกเป็นแถว", "text to rows", "unpivot", "1 ต่อแถว", "normalize", "tracking", "หลายค่า", "ตัวคั่น", "delimiter", "แตกเป็นแถว"] },
  { id: "date-format", name: "แปลงรูปแบบวันที่", desc: "วันที่คนละรูปแบบปนกัน (10/07/2025, 2025-7-1, ปี พ.ศ. 68, Excel serial) → รูปแบบเดียวทั้งคอลัมน์ · เลือกวันมาก่อน/เดือนมาก่อนเอง (ไม่เดามั่ว) · แปลง พ.ศ.↔ค.ศ. · ช่องอ่านไม่ออกคงค่าเดิม ไม่หาย", icon: "📅", category: "excel", href: "/date", status: "ready", keywords: ["date", "วันที่", "แปลงวันที่", "date format", "normalize date", "พ.ศ.", "ค.ศ.", "buddhist", "iso", "dd/mm/yyyy", "รูปแบบวันที่", "จัดรูปวันที่", "eta", "etd", "excel serial", "วันเดือนปี"] },
  { id: "calc-column", name: "คอลัมน์คำนวณ", desc: "สร้างคอลัมน์ใหม่จากการคำนวณ 2 ค่า (คอลัมน์/ค่าคงที่) + − × ÷ เช่น น้ำหนัก × เรต = ค่าขนส่ง, CBM × 7000, จำนวนกล่อง × ราคา · เติมท้ายตาราง ไม่แตะข้อมูลเดิม · ช่องไม่ใช่ตัวเลข = เว้นว่าง ไม่เดามั่ว", icon: "➗", category: "excel", href: "/calc-col", status: "ready", keywords: ["calc column", "คอลัมน์คำนวณ", "computed column", "formula", "สูตร", "คำนวณ", "คูณ", "หาร", "บวก", "ลบ", "ค่าขนส่ง", "cost", "rate", "เรต", "น้ำหนัก", "cbm", "volumetric", "multiply", "คิดเงิน", "ราคา"] },
  { id: "percent-share", name: "% สัดส่วน & ยอดสะสม", desc: "เติมคอลัมน์วิเคราะห์ต่อแถว — % สัดส่วนของยอดรวม (ตู้นี้กี่ % ของน้ำหนักรวม), ยอดสะสม, % สะสม, อันดับ · เติมท้ายตาราง ไม่แตะข้อมูลเดิม · ช่องไม่ใช่ตัวเลข = เว้นว่าง ไม่นับเข้ารวม", icon: "📈", category: "excel", href: "/percent", status: "ready", keywords: ["percent", "เปอร์เซ็นต์", "สัดส่วน", "share", "percentage", "% of total", "ยอดสะสม", "running total", "cumulative", "สะสม", "อันดับ", "rank", "จัดอันดับ", "วิเคราะห์", "proportion", "น้ำหนัก", "cbm", "ตู้", "ratio"] },

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
  { id: "timestamp", name: "แปลงเวลา Unix", desc: "แปลง epoch (วินาที/มิลลิ/ไมโคร) ↔ วันเวลาจริง — เช็ค timestamp ใน payload MOMO API / แถว Supabase (created_at/updated_at) · เดาหน่วยจากจำนวนหลัก หรือเลือกเอง · โชว์ UTC + local + วันในสัปดาห์ + เวลาสัมพัทธ์ · parse ไม่ได้ = บอกชัด ไม่เดามั่ว", icon: "⏱️", category: "dev", href: "/timestamp", status: "ready", keywords: ["timestamp", "unix", "epoch", "เวลา", "แปลงเวลา", "วันที่", "iso", "created_at", "updated_at", "supabase", "api", "momo", "มิลลิวินาที", "millisecond", "วินาที", "second", "date", "time", "utc", "epoch converter"] },

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

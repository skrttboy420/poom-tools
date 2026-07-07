// เข้ารหัส/ถอดรหัส Base64 + URL — pure ล้วน (ไม่พึ่ง DOM/DB)
// dev quick-win: เช็ค payload MOMO/Supabase, decode token, escape ค่าใส่ URL
// Base64 เขียนเองด้วย byte table (รองรับ UTF-8/ไทยครบ ไม่พึ่ง btoa/atob ที่พังกับ non-ASCII)
export type EncMode = "base64" | "url";
export type EncDir = "encode" | "decode";

export const ENC_MODE_LABEL: Record<EncMode, string> = {
  base64: "Base64",
  url: "URL",
};

export interface EncOptions {
  urlSafe?: boolean; // base64: ใช้ - _ แทน + / และตัด padding (Base64URL — ใช้ใน JWT/URL)
  component?: boolean; // url: encodeURIComponent (ทั้งค่า) vs encodeURI (คงโครง URL)
}

export interface EncResult {
  ok: boolean;
  output: string;
  error?: string;
  bytesIn: number;
  bytesOut: number;
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function byteLen(s: string): number {
  return new TextEncoder().encode(s).length;
}

function bytesToBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += B64[b0 >> 2];
    out += B64[((b0 & 3) << 4) | (b1 >> 4)];
    out += i + 1 < bytes.length ? B64[((b1 & 15) << 2) | (b2 >> 6)] : "=";
    out += i + 2 < bytes.length ? B64[b2 & 63] : "=";
  }
  return out;
}

function base64ToBytes(str: string): Uint8Array {
  // รับได้ทั้ง standard + url-safe: แปลง - _ → + / แล้วตัด whitespace/padding
  const s = str
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .replace(/\s+/g, "")
    .replace(/=+$/, "");
  const lookup = new Int16Array(256).fill(-1);
  for (let i = 0; i < B64.length; i++) lookup[B64.charCodeAt(i)] = i;
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < s.length; i++) {
    const v = lookup[s.charCodeAt(i)];
    if (v < 0) throw new Error(`มีอักขระที่ไม่ใช่ Base64: "${s[i]}"`);
    buffer = (buffer << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
    }
  }
  return new Uint8Array(out);
}

export function base64Encode(text: string, urlSafe = false): string {
  const b = bytesToBase64(new TextEncoder().encode(text));
  if (urlSafe) return b.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return b;
}

export function base64Decode(text: string): string {
  const bytes = base64ToBytes(text);
  // fatal: true → เจอ UTF-8 พังจะ throw บอกชัด ไม่คืนขยะเงียบ ๆ
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

export function urlEncode(text: string, component = true): string {
  return component ? encodeURIComponent(text) : encodeURI(text);
}

export function urlDecode(text: string, component = true): string {
  return component ? decodeURIComponent(text) : decodeURI(text);
}

// รวม wrapper — จับ error เป็นข้อความไทย ไม่ให้ throw หลุดขึ้น UI
export function runEncode(input: string, mode: EncMode, dir: EncDir, opts: EncOptions = {}): EncResult {
  if (input === "") return { ok: true, output: "", bytesIn: 0, bytesOut: 0 };
  try {
    let output: string;
    if (mode === "base64") {
      output = dir === "encode" ? base64Encode(input, opts.urlSafe) : base64Decode(input);
    } else {
      const component = opts.component ?? true;
      output = dir === "encode" ? urlEncode(input, component) : urlDecode(input, component);
    }
    return { ok: true, output, bytesIn: byteLen(input), bytesOut: byteLen(output) };
  } catch (e) {
    const msg = (e as Error).message;
    return {
      ok: false,
      output: "",
      error: dir === "decode" ? `ถอดรหัสไม่สำเร็จ: ${msg}` : `เข้ารหัสไม่สำเร็จ: ${msg}`,
      bytesIn: byteLen(input),
      bytesOut: 0,
    };
  }
}

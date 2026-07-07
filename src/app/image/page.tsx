"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import FileDropzone from "@/components/FileDropzone";
import {
  computeTargetSize,
  formatMime,
  supportsQuality,
  changeImageExt,
  humanSize,
  type ImageFormat,
  type ResizeMode,
  type Size,
} from "@/lib/image/resize";

interface Loaded {
  file: File;
  url: string; // object URL ของต้นฉบับ (โชว์ preview)
  w: number;
  h: number;
}

interface Output {
  url: string;
  blob: Blob;
  w: number;
  h: number;
  name: string;
}

const FORMATS: { id: ImageFormat; label: string }[] = [
  { id: "jpeg", label: "JPG" },
  { id: "png", label: "PNG" },
  { id: "webp", label: "WEBP" },
];

const MODES: { id: ResizeMode; label: string }[] = [
  { id: "none", label: "ขนาดเดิม" },
  { id: "fit", label: "ย่อให้พอดีกรอบ" },
  { id: "scale", label: "ย่อ/ขยายเป็น %" },
];

export default function ImagePage() {
  const [src, setSrc] = useState<Loaded | null>(null);
  const [fmt, setFmt] = useState<ImageFormat>("jpeg");
  const [mode, setMode] = useState<ResizeMode>("none");
  const [maxW, setMaxW] = useState("1600");
  const [maxH, setMaxH] = useState("1600");
  const [scalePct, setScalePct] = useState("50");
  const [quality, setQuality] = useState(0.85);
  const [out, setOut] = useState<Output | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // โหลดไฟล์รูป → อ่านขนาดจริง
  const loadFile = useCallback((file: File | undefined) => {
    setErr("");
    setOut(null);
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setErr("ไฟล์นี้ไม่ใช่รูปภาพ");
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setSrc((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return { file, url, w: img.naturalWidth, h: img.naturalHeight };
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setErr("เปิดรูปไม่ได้ (ไฟล์อาจเสีย)");
    };
    img.src = url;
  }, []);

  // แปลง/ย่อ → วาดลง canvas → toBlob
  const run = useCallback(() => {
    if (!src) return;
    setBusy(true);
    setErr("");
    const opts = {
      mode,
      maxW: Number(maxW) || undefined,
      maxH: Number(maxH) || undefined,
      scale: (Number(scalePct) || 0) / 100,
    };
    const target: Size = computeTargetSize(src.w, src.h, opts);
    const img = new Image();
    img.onload = () => {
      const canvas = canvasRef.current ?? document.createElement("canvas");
      canvas.width = target.w;
      canvas.height = target.h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        setErr("เบราว์เซอร์ไม่รองรับ canvas");
        setBusy(false);
        return;
      }
      // พื้นขาวสำหรับ jpeg (ไม่มี alpha) กันพื้นดำ
      if (fmt === "jpeg") {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, target.w, target.h);
      }
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, target.w, target.h);
      const q = supportsQuality(fmt) ? quality : undefined;
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            setErr("แปลงรูปไม่สำเร็จ");
            setBusy(false);
            return;
          }
          setOut((prev) => {
            if (prev) URL.revokeObjectURL(prev.url);
            return {
              url: URL.createObjectURL(blob),
              blob,
              w: target.w,
              h: target.h,
              name: changeImageExt(src.file.name, fmt),
            };
          });
          setBusy(false);
        },
        formatMime(fmt),
        q,
      );
    };
    img.onerror = () => {
      setErr("โหลดรูปเพื่อแปลงไม่ได้");
      setBusy(false);
    };
    img.src = src.url;
  }, [src, mode, maxW, maxH, scalePct, fmt, quality]);

  const download = () => {
    if (!out) return;
    const a = document.createElement("a");
    a.href = out.url;
    a.download = out.name;
    a.click();
  };

  // เคลียร์ object URL ตอน unmount
  useEffect(() => {
    return () => {
      if (src) URL.revokeObjectURL(src.url);
      if (out) URL.revokeObjectURL(out.url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reduction =
    out && src ? 1 - out.blob.size / Math.max(1, src.file.size) : 0;

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-black/10 px-6 py-4 dark:border-white/10">
        <div>
          <h1 className="text-lg font-semibold">แปลง / ย่อ / บีบอัดรูป 🖼️</h1>
          <p className="text-xs text-neutral-500">
            แปลงชนิดไฟล์ (PNG/JPG/WEBP) · ย่อขนาด · บีบอัด — ทำในเครื่องล้วน (รูปไม่ถูกอัปโหลดไปไหน)
          </p>
        </div>
        <Link href="/" className="text-sm text-neutral-500 hover:underline">
          ← กลับหน้าหลัก
        </Link>
      </header>

      <section className="mx-auto w-full max-w-5xl flex-1 space-y-4 p-6">
        <FileDropzone
          onFile={loadFile}
          accept="image/*"
          label={src ? `📷 ${src.file.name} — เปลี่ยนรูป` : "ลากรูปมาวาง หรือคลิกเลือก (PNG/JPG/WEBP/GIF...)"}
        />

        {err && (
          <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300">
            {err}
          </p>
        )}

        {src && (
          <>
            {/* ตัวเลือก */}
            <div className="space-y-3 rounded-xl border border-black/10 p-4 dark:border-white/10">
              <Row label="รูปแบบไฟล์">
                <div className="flex overflow-hidden rounded-lg border border-black/15 dark:border-white/15">
                  {FORMATS.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setFmt(f.id)}
                      className={`px-4 py-1.5 text-sm transition ${
                        fmt === f.id
                          ? "bg-neutral-900 text-white dark:bg-white dark:text-black"
                          : "hover:bg-black/5 dark:hover:bg-white/5"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </Row>

              <Row label="ขนาด">
                <div className="flex flex-wrap items-center gap-3">
                  {MODES.map((m) => (
                    <label key={m.id} className="flex cursor-pointer items-center gap-1.5 text-sm">
                      <input
                        type="radio"
                        name="mode"
                        checked={mode === m.id}
                        onChange={() => setMode(m.id)}
                      />
                      {m.label}
                    </label>
                  ))}
                </div>
              </Row>

              {mode === "fit" && (
                <Row label="กรอบสูงสุด (px)">
                  <div className="flex items-center gap-2 text-sm">
                    <NumBox value={maxW} onChange={setMaxW} placeholder="กว้าง" />
                    <span className="text-neutral-400">×</span>
                    <NumBox value={maxH} onChange={setMaxH} placeholder="สูง" />
                    <span className="text-xs text-neutral-400">(คงอัตราส่วน · ไม่ขยายเกินต้นฉบับ)</span>
                  </div>
                </Row>
              )}

              {mode === "scale" && (
                <Row label="สเกล (%)">
                  <div className="flex items-center gap-2 text-sm">
                    <NumBox value={scalePct} onChange={setScalePct} placeholder="50" />
                    <span className="text-neutral-400">%</span>
                  </div>
                </Row>
              )}

              {supportsQuality(fmt) && (
                <Row label={`คุณภาพ (${Math.round(quality * 100)}%)`}>
                  <input
                    type="range"
                    min={0.1}
                    max={1}
                    step={0.05}
                    value={quality}
                    onChange={(e) => setQuality(Number(e.target.value))}
                    className="w-56"
                  />
                </Row>
              )}

              <button
                type="button"
                onClick={run}
                disabled={busy}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
              >
                {busy ? "กำลังแปลง..." : "แปลงรูป"}
              </button>
            </div>

            {/* ก่อน → หลัง */}
            <div className="grid gap-4 md:grid-cols-2">
              <Preview title="ต้นฉบับ" imgUrl={src.url} w={src.w} h={src.h} size={src.file.size} />
              {out ? (
                <div className="space-y-2 rounded-xl border border-emerald-500/30 bg-emerald-50/40 p-4 dark:bg-emerald-950/15">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">ผลลัพธ์</span>
                    <button
                      type="button"
                      onClick={download}
                      className="rounded-md border border-emerald-500/40 px-3 py-1 text-xs text-emerald-700 hover:bg-emerald-100 dark:text-emerald-300 dark:hover:bg-emerald-900/30"
                    >
                      ดาวน์โหลด
                    </button>
                  </div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={out.url} alt="ผลลัพธ์" className="max-h-56 w-auto rounded-lg border border-black/10 dark:border-white/10" />
                  <div className="text-xs text-neutral-600 dark:text-neutral-400">
                    <div>{out.name}</div>
                    <div>
                      {out.w}×{out.h} px · {humanSize(out.blob.size)}
                      {reduction > 0.01 && (
                        <span className="ml-1 font-medium text-emerald-600">
                          (เล็กลง {Math.round(reduction * 100)}%)
                        </span>
                      )}
                      {reduction < -0.01 && (
                        <span className="ml-1 text-amber-600">(ใหญ่ขึ้น {Math.round(-reduction * 100)}%)</span>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center rounded-xl border border-dashed border-black/15 p-4 text-sm text-neutral-400 dark:border-white/15">
                  กด &quot;แปลงรูป&quot; เพื่อดูผลลัพธ์
                </div>
              )}
            </div>
          </>
        )}

        <canvas ref={canvasRef} className="hidden" />
      </section>
    </main>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="w-32 shrink-0 text-xs text-neutral-500">{label}</span>
      {children}
    </div>
  );
}

function NumBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      type="number"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-24 rounded-md border border-black/15 bg-transparent px-2 py-1 text-sm outline-none focus:border-black/40 dark:border-white/15 dark:focus:border-white/40"
    />
  );
}

function Preview({ title, imgUrl, w, h, size }: { title: string; imgUrl: string; w: number; h: number; size: number }) {
  return (
    <div className="space-y-2 rounded-xl border border-black/10 p-4 dark:border-white/10">
      <span className="text-sm font-medium text-neutral-600 dark:text-neutral-300">{title}</span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imgUrl} alt={title} className="max-h-56 w-auto rounded-lg border border-black/10 dark:border-white/10" />
      <div className="text-xs text-neutral-600 dark:text-neutral-400">
        {w}×{h} px · {humanSize(size)}
      </div>
    </div>
  );
}

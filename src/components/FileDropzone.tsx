"use client";

import { useRef, useState } from "react";

// พื้นที่อัปโหลดไฟล์แบบลากวางได้ (drag-drop) + คลิกเลือก — ใช้ร่วมทุกเครื่องมือไฟล์
// ลดขั้นตอน: ลากไฟล์จาก Explorer มาวางได้เลย ไม่ต้องกดเปิด dialog
export default function FileDropzone({
  onFile,
  accept,
  busy = false,
  label,
  className = "",
}: {
  onFile: (file: File | undefined) => void;
  accept?: string;
  busy?: boolean;
  label: string;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const pick = () => inputRef.current?.click();

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={label}
      onClick={pick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          pick();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!over) setOver(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
      className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-3 py-6 text-center text-sm transition ${
        over
          ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
          : "border-black/20 text-neutral-500 hover:border-black/40 dark:border-white/20 dark:hover:border-white/40"
      } ${className}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.target.value = ""; // เคลียร์เพื่อให้เลือกไฟล์เดิมซ้ำแล้ว onChange ยิงอีกครั้ง
        }}
      />
      <span className="text-xl" aria-hidden>
        {over ? "📥" : "📄"}
      </span>
      <span>{busy ? "กำลังอ่าน..." : label}</span>
    </div>
  );
}

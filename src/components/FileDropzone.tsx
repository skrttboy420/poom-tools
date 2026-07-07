"use client";

import { useRef, useState } from "react";

// พื้นที่อัปโหลดไฟล์แบบลากวางได้ (drag-drop) + คลิกเลือก — ใช้ร่วมทุกเครื่องมือไฟล์
// ลดขั้นตอน: ลากไฟล์จาก Explorer มาวางได้เลย ไม่ต้องกดเปิด dialog
export default function FileDropzone({
  onFile,
  onFiles,
  multiple = false,
  accept,
  busy = false,
  label,
  className = "",
}: {
  onFile?: (file: File | undefined) => void;
  onFiles?: (files: File[]) => void; // ใช้คู่กับ multiple — รับหลายไฟล์พร้อมกัน
  multiple?: boolean;
  accept?: string;
  busy?: boolean;
  label: string;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const pick = () => inputRef.current?.click();

  // แจกไฟล์ที่ได้ (จาก drop หรือ input) ไปตามโหมด single/multiple
  const emit = (list: FileList | null) => {
    const files = list ? Array.from(list) : [];
    if (multiple) onFiles?.(files);
    else onFile?.(files[0]);
  };

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
        emit(e.dataTransfer.files);
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
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          emit(e.target.files);
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

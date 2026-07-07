"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  UNIT_CATEGORIES,
  convertToAll,
  formatResult,
  type UnitCategory,
} from "@/lib/convert/units";

export default function ConvertPage() {
  const [catId, setCatId] = useState<string>(UNIT_CATEGORIES[0].id);
  const cat: UnitCategory = useMemo(
    () => UNIT_CATEGORIES.find((c) => c.id === catId) ?? UNIT_CATEGORIES[0],
    [catId],
  );
  const [fromId, setFromId] = useState<string>(cat.units[0].id);
  const [raw, setRaw] = useState<string>("1");

  const value = useMemo(() => {
    const n = Number(raw.replace(/,/g, "").trim());
    return Number.isFinite(n) ? n : null;
  }, [raw]);

  const results = useMemo(
    () => (value === null ? [] : convertToAll(value, cat, fromId)),
    [value, cat, fromId],
  );

  const switchCat = (id: string) => {
    const next = UNIT_CATEGORIES.find((c) => c.id === id) ?? UNIT_CATEGORIES[0];
    setCatId(id);
    setFromId(next.units[0].id);
  };

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-black/10 px-6 py-4 dark:border-white/10">
        <div>
          <h1 className="text-lg font-semibold">แปลงหน่วย</h1>
          <p className="text-xs text-neutral-500">
            น้ำหนัก / ความยาว / ปริมาตร — พิมพ์ค่าเดียว เห็นทุกหน่วยพร้อมกัน (inch↔cm, lb↔kg, ft³↔CBM)
          </p>
        </div>
        <Link href="/" className="text-sm text-neutral-500 hover:underline">
          ← กลับหน้าหลัก
        </Link>
      </header>

      <section className="mx-auto w-full max-w-2xl flex-1 space-y-6 p-6">
        {/* เลือกหมวด */}
        <div className="flex flex-wrap gap-2">
          {UNIT_CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => switchCat(c.id)}
              className={`rounded-full border px-4 py-1.5 text-sm transition ${
                c.id === catId
                  ? "border-transparent bg-neutral-900 text-white dark:bg-white dark:text-black"
                  : "border-black/15 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
              }`}
            >
              <span className="mr-1" aria-hidden>
                {c.icon}
              </span>
              {c.name}
            </button>
          ))}
        </div>

        {/* input + หน่วยต้นทาง */}
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-black/10 p-4 dark:border-white/10">
          <label className="flex-1">
            <span className="mb-1 block text-xs text-neutral-500">ค่าที่จะแปลง</span>
            <input
              inputMode="decimal"
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              autoFocus
              className="w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-lg outline-none focus:border-black/40 dark:border-white/15 dark:focus:border-white/40"
            />
          </label>
          <label>
            <span className="mb-1 block text-xs text-neutral-500">จากหน่วย</span>
            <select
              value={fromId}
              onChange={(e) => setFromId(e.target.value)}
              className="rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm outline-none dark:border-white/15"
            >
              {cat.units.map((u) => (
                <option key={u.id} value={u.id} className="text-black">
                  {u.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* ผลลัพธ์ทุกหน่วย */}
        <div className="overflow-hidden rounded-xl border border-black/10 dark:border-white/10">
          {value === null ? (
            <p className="px-4 py-6 text-center text-sm text-neutral-500">พิมพ์ตัวเลขที่ถูกต้องเพื่อดูผลลัพธ์</p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <tbody>
                {results.map(({ unit, value: v }) => {
                  const isFrom = unit.id === fromId;
                  return (
                    <tr
                      key={unit.id}
                      className={`border-t border-black/5 first:border-t-0 dark:border-white/5 ${
                        isFrom ? "bg-emerald-50 dark:bg-emerald-950/20" : ""
                      }`}
                    >
                      <td className="px-4 py-2.5 text-neutral-500">{unit.label}</td>
                      <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{formatResult(v)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <p className="text-center text-xs text-neutral-400">แถวไฮไลต์เขียว = หน่วยต้นทางที่คุณกรอก</p>
      </section>
    </main>
  );
}

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LogoutButton from "@/components/LogoutButton";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // proxy.ts กันไว้อีกชั้นแล้ว แต่กันเหนียวไว้ตรงนี้ด้วย
  if (!user) {
    redirect("/login");
  }

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-black/10 px-6 py-4 dark:border-white/10">
        <div>
          <h1 className="text-lg font-semibold">poom-tools</h1>
          <p className="text-xs text-neutral-500">{user.email}</p>
        </div>
        <LogoutButton />
      </header>

      <section className="flex-1 p-6">
        <div className="mx-auto max-w-2xl space-y-4">
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
            ✅ เชื่อม Supabase + auth สำเร็จ — พร้อมทำ STEP 3 (Reconciler)
          </div>

          <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
            <h2 className="text-sm font-semibold">เครื่องมือ</h2>
            <ul className="mt-2 space-y-1 text-sm text-neutral-500">
              <li>• Reconciler — เทียบข้อมูล (กำลังจะทำ · STEP 3)</li>
              <li>• DB probe / table-health / migration tracker (roadmap)</li>
            </ul>
          </div>
        </div>
      </section>
    </main>
  );
}

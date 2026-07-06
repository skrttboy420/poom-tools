import Link from "next/link";
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
          <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
            <h2 className="text-sm font-semibold">เครื่องมือ</h2>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <Link
                  href="/reconcile"
                  className="flex items-center justify-between rounded-lg border border-black/10 px-3 py-2 transition hover:border-black/30 dark:border-white/10 dark:hover:border-white/30"
                >
                  <span>
                    <span className="font-medium">Reconciler</span>
                    <span className="ml-2 text-neutral-500">เทียบข้อมูล 2 ไฟล์ (Excel/CSV)</span>
                  </span>
                  <span className="text-neutral-400">→</span>
                </Link>
              </li>
              <li className="px-3 text-xs text-neutral-400">
                • DB probe / table-health / migration tracker (roadmap)
              </li>
            </ul>
          </div>
        </div>
      </section>
    </main>
  );
}

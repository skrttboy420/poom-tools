import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LogoutButton from "@/components/LogoutButton";
import ToolHub from "@/components/ToolHub";

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
        <ToolHub />
      </section>
    </main>
  );
}

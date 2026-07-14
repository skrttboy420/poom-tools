import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Dashboard from "@/components/Dashboard";

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
      <Dashboard email={user.email ?? ""} />
    </main>
  );
}

import "server-only";
import { createClient } from "@supabase/supabase-js";

// Supabase client แบบ service-role — บายพาส RLS · ใช้ฝั่ง server เท่านั้น
// "server-only" กันเผลอ import เข้า client bundle (ห้าม service key หลุดไป browser)
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}

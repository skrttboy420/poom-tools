import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Supabase client สำหรับฝั่ง server (Server Component / Route Handler / Server Action)
// ใช้ anon key + อ่าน session ผ่าน cookie · Next 16: cookies() เป็น async
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // ถูกเรียกจาก Server Component ที่ set cookie ไม่ได้ —
            // ปล่อยผ่านได้ เพราะ proxy.ts เป็นตัว refresh session ให้อยู่แล้ว
          }
        },
      },
    },
  );
}

// smoke test: ลองล็อกอินด้วย anon key + seed creds เพื่อยืนยันว่า account ใช้ได้จริง
// รัน: node --env-file=.env.local scripts/smoke-auth.mjs
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const email = process.env.SEED_USER_EMAIL;
const password = process.env.SEED_USER_PASSWORD;

const supabase = createClient(url, anon, {
  auth: { persistSession: false },
});

const { data, error } = await supabase.auth.signInWithPassword({
  email,
  password,
});

if (error) {
  console.error("LOGIN FAILED:", error.message);
  process.exit(1);
}

console.log("LOGIN OK");
console.log("  user:", data.user.email);
console.log("  session token length:", data.session.access_token.length);

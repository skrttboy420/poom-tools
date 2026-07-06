// สร้าง/ยืนยัน auth account ของภูมใน Supabase (idempotent)
// รัน: node --env-file=.env.local scripts/create-user.mjs
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.SEED_USER_EMAIL;
const password = process.env.SEED_USER_PASSWORD;

if (!url || !serviceKey) {
  console.error("ขาด NEXT_PUBLIC_SUPABASE_URL หรือ SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
if (!email || !password) {
  console.error("ขาด SEED_USER_EMAIL หรือ SEED_USER_PASSWORD");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: list, error: listErr } = await admin.auth.admin.listUsers();
if (listErr) {
  console.error("listUsers error:", listErr.message);
  process.exit(1);
}

const existing = list.users.find((u) => u.email === email);
if (existing) {
  console.log(`มีอยู่แล้ว: ${email} (id=${existing.id}) — ไม่ทำอะไร`);
  process.exit(0);
}

const { data, error } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
});
if (error) {
  console.error("createUser error:", error.message);
  process.exit(1);
}

console.log(`สร้างสำเร็จ: ${data.user.email} (id=${data.user.id})`);

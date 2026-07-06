import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next 16 บล็อก dev resources (HMR/chunks) ถ้า host ไม่ตรง origin ของ dev server
  // ทำให้เปิดผ่าน 127.0.0.1 หรือ IP วง LAN แล้ว "หน้า render ได้แต่ hydrate ไม่ได้"
  // (ฟอร์มกดไม่ติด) — allow host พวกนี้ให้โหลด chunk ได้ครบ
  allowedDevOrigins: ["127.0.0.1", "192.168.1.38"],
};

export default nextConfig;

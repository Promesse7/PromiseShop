"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function useLogout(): { logout: () => Promise<void>; loggingOut: boolean } {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function logout() {
    setLoggingOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return { logout, loggingOut };
}

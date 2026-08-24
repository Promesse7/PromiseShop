"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { SegmentedToggle } from "@/components/ui/SegmentedToggle";
import type { EmployeeRole } from "@/lib/types";

const ADMIN_ROLES: EmployeeRole[] = ["admin", "manager"];

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [language, setLanguage] = useState("en");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    setSubmitting(false);

    if (!response.ok) {
      const data = await response.json();
      setError(data.error ?? "Invalid username or password");
      return;
    }

    const data = (await response.json()) as { role: EmployeeRole; username: string };
    router.push(ADMIN_ROLES.includes(data.role) ? "/dashboard" : "/checkout");
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-[900px] grid grid-cols-[1fr_380px] min-h-[520px] rounded-lg overflow-hidden">
        <div className="bg-gradient-to-br from-section to-neutral-900 p-8 flex flex-col justify-between">
          <span className="font-sans font-medium text-lg">Promise Electronic Shop</span>
          <div>
            <h3 className="max-w-[320px]">Inventory & Sales System</h3>
            <p className="text-sm max-w-[300px] opacity-70">
              Purchasing, sales, stock and equipment tracking for the whole shop.
            </p>
          </div>
          <span className="text-xs opacity-50">[Shop Address] · [Phone] · [Email]</span>
        </div>
        <div className="p-8 flex flex-col justify-center gap-4 bg-surface">
          <div className="flex justify-end">
            <SegmentedToggle
              name="lang"
              options={[
                { value: "en", label: "EN" },
                { value: "rw", label: "RW" },
              ]}
              value={language}
              onChange={setLanguage}
            />
          </div>
          <h4 className="m-0">Sign in</h4>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Field label="Username" name="username" value={username} onChange={setUsername} />
            <Field
              label="Password"
              name="password"
              type="password"
              value={password}
              onChange={setPassword}
            />
            {error && <p className="text-xs text-red-400">{error}</p>}
            <Button type="submit" block disabled={submitting}>
              Sign in
            </Button>
          </form>
          <p className="text-xs opacity-50 m-0">
            Sales Staff &amp; Technicians land on Checkout. Admins land on the Dashboard.
            Passwords are stored hashed.
          </p>
        </div>
      </div>
    </div>
  );
}

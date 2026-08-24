# Frontend Phase 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the Next.js frontend, port the mockup's Nocturne design system into Tailwind, build the core reusable UI components, and implement the auth flow (login screen + BFF proxy) with role-gated navigation — everything every later domain phase mounts into.

**Architecture:** Next.js 15 (App Router) + TypeScript in a new `frontend/` directory. Tailwind v3 (pinned explicitly, not whatever `create-next-app` defaults to) themed with the mockup's exact Nocturne tokens. A Next.js BFF (route handlers) holds JWTs in httpOnly cookies and proxies every API call to Django — the browser never sees a raw token. TanStack Query for server state.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS 3.4, TanStack Query 5, Vitest + React Testing Library (component tests), Playwright (E2E smoke tests). Backend: existing Django REST API (Phases 1-6, unchanged — no backend modifications anywhere in this plan).

**Spec:** `docs/superpowers/specs/2026-08-24-frontend-phase1-foundation-design.md`

## Global Constraints

- No backend changes anywhere in this plan — the frontend consumes the existing Django API surface exactly as it is. Login response shape is `{"access": <jwt>, "refresh": <jwt>, "role": <one of "admin"|"manager"|"sales_staff"|"technician">}` (confirmed: `EmployeeTokenObtainPairSerializer` adds `role` to SimpleJWT's standard `access`/`refresh` pair). No `full_name` is returned by login — the nav displays the submitted `username`, not the employee's full name, since fetching full name would require either a backend change or a call to `/api/employees/{id}/`, which is `IsAdmin`-only and would 403 for non-admin roles. This is a deliberate simplification, not an oversight.
- The BFF never exposes a raw JWT to browser JavaScript. `access_token`, `refresh_token`, `employee_role`, `employee_username` are all httpOnly cookies. Only a session-check route (`GET /api/auth/session`) returns a plain, non-sensitive `{role, username}` JSON body for client-side rendering.
- Every design token (color, spacing, radius, shadow, font) copied into Tailwind's theme must use the exact literal value from the mockup's `styles.css` `:root` block — never approximated or rounded.
- Tests: Vitest + React Testing Library for components and BFF route handlers; Playwright for E2E smoke tests only (login → correct role redirect, failed login, session expiry) — not a full E2E suite.
- File layout matches the spec's `frontend/` tree exactly: `app/`, `components/ui/`, `components/layout/`, `lib/`. No `src/` directory.
- Money/currency formatting, i18n translation, and responsive/tablet breakpoints are explicitly out of scope for this phase (spec Decisions 5-6) — do not add them.

---

### Task 1: Project scaffold, Nocturne design tokens, testing tooling

**Files:**
- Create: `frontend/` (via `create-next-app`, then modified)
- Create: `frontend/tailwind.config.ts`
- Create: `frontend/app/globals.css`
- Create: `frontend/app/layout.tsx`
- Create: `frontend/vitest.config.ts`
- Create: `frontend/vitest.setup.ts`
- Create: `frontend/playwright.config.ts`
- Create: `frontend/.env.local.example`
- Create: `frontend/lib/types.ts`
- Modify: `frontend/package.json` (add test scripts, testing dependencies)

**Interfaces:**
- Consumes: nothing (first task).
- Produces: the Tailwind theme (`colors.bg`, `colors.text`, `colors.accent`, `colors.neutral.{100-900}`, `colors.accent.{100-900}`, `colors.accent2.{100-900}`, `colors.section`, `colors.sectionGlow`, `colors.sectionGhost`, `spacing.1` through `spacing.8`, `borderRadius.sm/md/lg`, `boxShadow.sm/md/lg`), the `Inter` font loaded via `next/font/google`, and `lib/types.ts`'s `EmployeeRole` type (`"admin" | "manager" | "sales_staff" | "technician"`) and `Session` type (`{ role: EmployeeRole; username: string }`) — consumed by every later task.

- [ ] **Step 1: Scaffold the Next.js project**

Run from the repo root:
```bash
npx create-next-app@latest frontend --typescript --app --no-src-dir --import-alias "@/*" --eslint --no-tailwind
```
Answer any remaining prompts with defaults. This creates `frontend/` with App Router, TypeScript, ESLint, no `src/` directory, and explicitly WITHOUT Tailwind (installed manually in the next step, so the plan can pin an exact version and config format rather than depending on whatever `create-next-app` defaults to).

- [ ] **Step 2: Install Tailwind v3 and testing dependencies**

```bash
cd frontend
npm install -D tailwindcss@^3.4 postcss@^8 autoprefixer@^10
npm install @tanstack/react-query@^5
npm install -D vitest@^2 @testing-library/react@^16 @testing-library/jest-dom@^6 @testing-library/user-event@^14 jsdom@^25 @vitejs/plugin-react@^4
npm install -D @playwright/test@^1
npx playwright install --with-deps chromium
npx tailwindcss init -p
```
The last command generates a default `tailwind.config.js`/`postcss.config.js` — Step 4 replaces the Tailwind config with a TypeScript version carrying the Nocturne tokens; delete the generated `tailwind.config.js` once `tailwind.config.ts` exists (Next.js resolves `.ts` config files).

- [ ] **Step 3: Write `frontend/lib/types.ts`**

```typescript
export type EmployeeRole = "admin" | "manager" | "sales_staff" | "technician";

export interface Session {
  role: EmployeeRole;
  username: string;
}

export interface LoginResponse {
  access: string;
  refresh: string;
  role: EmployeeRole;
}
```

- [ ] **Step 4: Write `frontend/tailwind.config.ts`**

Every value below is copied verbatim from the mockup's `styles.css` `:root` block — do not round or approximate any of them.

```typescript
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#161826",
        surface: "#232532",
        text: "#e9e9ed",
        accent: {
          DEFAULT: "#9184d9",
          100: "#f5f4ff",
          200: "#e7e5fe",
          300: "#d2cefd",
          400: "#b5abfc",
          500: "#968ae0",
          600: "#796cbf",
          700: "#5d5294",
          800: "#423a6a",
          900: "#2b2741",
        },
        accent2: {
          DEFAULT: "#a7a1db",
          100: "#f5f4ff",
          200: "#e7e5fe",
          300: "#d2cefd",
          400: "#b5afe8",
          500: "#9690c9",
          600: "#7972a9",
          700: "#5c5783",
          800: "#423e5d",
          900: "#2b293a",
        },
        neutral: {
          100: "#f3f5fe",
          200: "#e4e7f5",
          300: "#cfd3e5",
          400: "#b2b6ca",
          500: "#9397ab",
          600: "#75798c",
          700: "#595d6c",
          800: "#3f424d",
          900: "#292b31",
        },
        section: "#262a60",
        sectionGlow: "#353b80",
        sectionGhost: "#4c5397",
        divider: "rgba(233, 233, 237, 0.16)",
      },
      spacing: {
        "1": "2.8px",
        "2": "5.6px",
        "3": "8.4px",
        "4": "11.2px",
        "6": "16.8px",
        "8": "22.4px",
      },
      borderRadius: {
        sm: "4px",
        md: "8px",
        lg: "14px",
      },
      boxShadow: {
        sm: "0 0 0 1px #3f424d",
        md: "0 0 0 1px #595d6c, 0 6px 18px rgba(0,0,0,0.55)",
        lg: "0 0 0 1px #9397ab, 0 16px 40px rgba(0,0,0,0.65)",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
```

(`--color-divider` in the mockup is `color-mix(in srgb, #e9e9ed 16%, transparent)` — expressed here as the equivalent `rgba(233, 233, 237, 0.16)`, since `#e9e9ed` at 16% opacity over transparent is exactly that RGBA value; Tailwind's `theme.extend.colors` doesn't evaluate `color-mix()`, so this is the correct literal translation, not an approximation.)

- [ ] **Step 5: Write `frontend/app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  body {
    @apply bg-bg text-text font-sans;
    font-size: 15px;
    line-height: 1.55;
    font-weight: 400;
  }

  h1 { font-size: 42px; }
  h2 { font-size: 32px; }
  h3 { font-size: 25px; }
  h4 { font-size: 20px; }
  h5 { font-size: 16px; }
  h6 {
    font-size: 13px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  h1, h2, h3, h4, h5, h6 {
    line-height: 1.12;
    letter-spacing: -0.015em;
    font-weight: 500;
  }

  :focus-visible {
    outline: 2px solid theme("colors.accent.DEFAULT");
    outline-offset: 2px;
  }
}
```

- [ ] **Step 6: Write `frontend/app/layout.tsx`**

```tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Promise Electronic Shop",
  description: "Inventory & Sales System",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 7: Write `frontend/vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
```

- [ ] **Step 8: Write `frontend/vitest.setup.ts`**

```typescript
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 9: Write `frontend/playwright.config.ts`**

```typescript
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
  },
});
```

- [ ] **Step 10: Write `frontend/.env.local.example`**

```
DJANGO_API_URL=http://localhost:8000/api
```

- [ ] **Step 11: Add test scripts to `frontend/package.json`**

Add to the `"scripts"` section (alongside the existing `dev`/`build`/`start`/`lint` scripts `create-next-app` generated):

```json
"test": "vitest run",
"test:watch": "vitest",
"test:e2e": "playwright test"
```

- [ ] **Step 12: Verify the scaffold builds and lints clean**

```bash
cd frontend
npm run build
npm run lint
```
Expected: both exit 0. This is a scaffold-only checkpoint — no tests exist yet (Task 2 adds the first ones).

- [ ] **Step 13: Commit**

```bash
git add frontend/
git commit -m "Scaffold Next.js frontend with Nocturne design tokens and testing tooling"
```

---

### Task 2: Core UI component library

**Files:**
- Create: `frontend/components/ui/Button.tsx`
- Create: `frontend/components/ui/Button.test.tsx`
- Create: `frontend/components/ui/Tag.tsx`
- Create: `frontend/components/ui/Tag.test.tsx`
- Create: `frontend/components/ui/Field.tsx`
- Create: `frontend/components/ui/Field.test.tsx`
- Create: `frontend/components/ui/SegmentedToggle.tsx`
- Create: `frontend/components/ui/SegmentedToggle.test.tsx`
- Create: `frontend/components/ui/Card.tsx`
- Create: `frontend/components/ui/Card.test.tsx`
- Create: `frontend/components/ui/Table.tsx`
- Create: `frontend/components/ui/Table.test.tsx`
- Create: `frontend/components/ui/Dialog.tsx`
- Create: `frontend/components/ui/Dialog.test.tsx`

**Interfaces:**
- Consumes: `lib/types.ts` (Task 1) is not directly used by these components — they're presentational and take their own local prop types.
- Produces: `Button`, `Tag`, `Field`, `SegmentedToggle`, `Card` (+ `CardKicker`/`CardTitle`/`CardBody`/`CardMeta` subcomponents), `Table`, `Dialog` — all imported by name from `@/components/ui/<Name>` in every later task and every future domain phase.

- [ ] **Step 1: Write the failing test — `frontend/components/ui/Button.test.tsx`**

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./Button";

describe("Button", () => {
  it("renders children", () => {
    render(<Button>Sign in</Button>);
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });

  it("applies primary variant classes by default", () => {
    render(<Button>Save</Button>);
    const button = screen.getByRole("button", { name: "Save" });
    expect(button.className).toContain("text-accent");
    expect(button.className).toContain("border-accent");
  });

  it("applies secondary variant classes", () => {
    render(<Button variant="secondary">Cancel</Button>);
    const button = screen.getByRole("button", { name: "Cancel" });
    expect(button.className).toContain("border-divider");
  });

  it("applies block width class when block prop is set", () => {
    render(<Button block>Sign in</Button>);
    expect(screen.getByRole("button", { name: "Sign in" }).className).toContain("w-full");
  });

  it("calls onClick when clicked", async () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Save</Button>);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(handleClick).toHaveBeenCalledOnce();
  });

  it("is disabled when the disabled prop is set", () => {
    render(<Button disabled>Save</Button>);
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test -- Button`
Expected: FAIL — `Button` component doesn't exist yet.

- [ ] **Step 3: Write `frontend/components/ui/Button.tsx`**

```tsx
import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  block?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "text-accent border-accent hover:bg-accent/10 active:bg-accent/20",
  secondary:
    "border-divider hover:bg-text/[0.07] active:bg-text/[0.14]",
  ghost: "text-accent border-transparent px-1 hover:bg-accent/10 active:bg-accent/20",
};

export function Button({
  variant = "primary",
  block = false,
  className = "",
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={[
        "inline-flex items-center justify-center gap-1.5 cursor-pointer no-underline",
        "font-sans font-medium text-sm leading-tight text-text",
        "bg-transparent border rounded-md py-1.5 px-2.5",
        "disabled:opacity-45 disabled:cursor-not-allowed",
        block ? "w-full mt-1.5" : "",
        variantClasses[variant],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm run test -- Button`
Expected: 6 passed.

- [ ] **Step 5: Write the failing test — `frontend/components/ui/Tag.test.tsx`**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Tag } from "./Tag";

describe("Tag", () => {
  it("renders children", () => {
    render(<Tag>Admin</Tag>);
    expect(screen.getByText("Admin")).toBeInTheDocument();
  });

  it("applies outline variant classes by default", () => {
    render(<Tag>Admin</Tag>);
    expect(screen.getByText("Admin").className).toContain("border-accent");
  });

  it("applies accent variant classes", () => {
    render(<Tag variant="accent">New</Tag>);
    expect(screen.getByText("New").className).toContain("bg-accent-800");
  });

  it("applies neutral variant classes", () => {
    render(<Tag variant="neutral">Draft</Tag>);
    expect(screen.getByText("Draft").className).toContain("bg-neutral-800");
  });
});
```

- [ ] **Step 6: Run test to verify it fails, then write `frontend/components/ui/Tag.tsx`**

```tsx
import type { HTMLAttributes } from "react";

type TagVariant = "outline" | "accent" | "neutral";

interface TagProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: TagVariant;
}

const variantClasses: Record<TagVariant, string> = {
  outline: "border border-accent text-accent",
  accent: "bg-accent-800 text-accent-100",
  neutral: "bg-neutral-800 text-neutral-100",
};

export function Tag({ variant = "outline", className = "", children, ...props }: TagProps) {
  return (
    <span
      className={[
        "inline-flex items-center text-xs tracking-wide py-0.5 px-2.5 rounded-sm",
        variantClasses[variant],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {children}
    </span>
  );
}
```

Run: `cd frontend && npm run test -- Tag` — expected FAIL before this step, 4 passed after.

- [ ] **Step 7: Write the failing test — `frontend/components/ui/Field.test.tsx`**

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Field } from "./Field";

describe("Field", () => {
  it("renders a label associated with its input via htmlFor/id", () => {
    render(<Field label="Username" name="username" />);
    const input = screen.getByLabelText("Username");
    expect(input).toBeInTheDocument();
  });

  it("supports the type prop for password fields", () => {
    render(<Field label="Password" name="password" type="password" />);
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");
  });

  it("forwards value and onChange", async () => {
    let value = "";
    const handleChange = (v: string) => {
      value = v;
    };
    render(<Field label="Username" name="username" value="" onChange={handleChange} />);
    await userEvent.type(screen.getByLabelText("Username"), "e.mugisha");
    expect(value).toBe("a");
  });
});
```

Note on the third test: `userEvent.type` fires one `onChange` per keystroke against a controlled component whose `value` prop the test never updates between keystrokes — so `value` only ever reflects the LAST single-character change event fired against the empty initial value, which is `"a"` (the first character of `"e.mugisha"` is `"e"`... correction: fix this test to assert `handleChange` was called, not assert a specific final string, since a controlled input without a re-render loop can't accumulate typed characters in this test setup. Replace the third test with:

```tsx
  it("calls onChange when typed into", async () => {
    const handleChange = vi.fn();
    render(<Field label="Username" name="username" value="" onChange={handleChange} />);
    await userEvent.type(screen.getByLabelText("Username"), "e");
    expect(handleChange).toHaveBeenCalledWith("e");
  });
```

(Add `import { vi } from "vitest";` to the top of the test file's imports.) Use this corrected version, not the string-accumulation version above.

- [ ] **Step 8: Write `frontend/components/ui/Field.tsx`**

```tsx
"use client";

import { useId } from "react";

interface FieldProps {
  label: string;
  name: string;
  type?: "text" | "password" | "email" | "number" | "date";
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
}

export function Field({
  label,
  name,
  type = "text",
  value,
  onChange,
  placeholder,
  error,
}: FieldProps) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="block text-xs text-text/70">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={[
          "w-full min-h-9 py-1.5 px-2.5 text-sm text-text bg-surface",
          "border rounded-md",
          "hover:border-text/45 focus-visible:border-accent focus-visible:outline-none",
          error ? "border-red-500" : "border-divider",
        ].join(" ")}
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `cd frontend && npm run test -- Field`
Expected: 3 passed.

- [ ] **Step 10: Write the failing test — `frontend/components/ui/SegmentedToggle.test.tsx`**

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SegmentedToggle } from "./SegmentedToggle";

describe("SegmentedToggle", () => {
  const options = [
    { value: "en", label: "EN" },
    { value: "rw", label: "RW" },
  ];

  it("renders all options", () => {
    render(<SegmentedToggle name="lang" options={options} value="en" onChange={() => {}} />);
    expect(screen.getByRole("radio", { name: "EN" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "RW" })).toBeInTheDocument();
  });

  it("marks the current value as checked", () => {
    render(<SegmentedToggle name="lang" options={options} value="rw" onChange={() => {}} />);
    expect(screen.getByRole("radio", { name: "RW" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "EN" })).not.toBeChecked();
  });

  it("calls onChange with the selected value", async () => {
    const handleChange = vi.fn();
    render(<SegmentedToggle name="lang" options={options} value="en" onChange={handleChange} />);
    await userEvent.click(screen.getByRole("radio", { name: "RW" }));
    expect(handleChange).toHaveBeenCalledWith("rw");
  });
});
```

- [ ] **Step 11: Write `frontend/components/ui/SegmentedToggle.tsx`**

```tsx
"use client";

interface SegmentedToggleOption {
  value: string;
  label: string;
}

interface SegmentedToggleProps {
  name: string;
  options: SegmentedToggleOption[];
  value: string;
  onChange: (value: string) => void;
}

export function SegmentedToggle({ name, options, value, onChange }: SegmentedToggleProps) {
  return (
    <div className="inline-flex border border-divider rounded-md overflow-hidden text-xs">
      {options.map((option) => (
        <label
          key={option.value}
          className={[
            "px-2.5 py-1 cursor-pointer",
            value === option.value ? "bg-accent/15 text-accent" : "text-text/70",
          ].join(" ")}
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
            className="sr-only"
          />
          {option.label}
        </label>
      ))}
    </div>
  );
}
```

- [ ] **Step 12: Run tests to verify they pass**

Run: `cd frontend && npm run test -- SegmentedToggle`
Expected: 3 passed.

- [ ] **Step 13: Write the failing test — `frontend/components/ui/Card.test.tsx`**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Card, CardKicker, CardTitle, CardBody, CardMeta } from "./Card";

describe("Card", () => {
  it("renders its subcomponents", () => {
    render(
      <Card>
        <CardKicker>Category</CardKicker>
        <CardTitle>Product Name</CardTitle>
        <CardBody>Description text</CardBody>
        <CardMeta>Meta info</CardMeta>
      </Card>
    );
    expect(screen.getByText("Category")).toBeInTheDocument();
    expect(screen.getByText("Product Name")).toBeInTheDocument();
    expect(screen.getByText("Description text")).toBeInTheDocument();
    expect(screen.getByText("Meta info")).toBeInTheDocument();
  });

  it("applies elevation classes based on the elevation prop", () => {
    const { container } = render(<Card elevation="lg">content</Card>);
    expect(container.firstChild).toHaveClass("shadow-lg");
  });

  it("defaults to no elevation shadow", () => {
    const { container } = render(<Card>content</Card>);
    expect(container.firstChild).not.toHaveClass("shadow-lg");
    expect(container.firstChild).not.toHaveClass("shadow-md");
    expect(container.firstChild).not.toHaveClass("shadow-sm");
  });
});
```

- [ ] **Step 14: Write `frontend/components/ui/Card.tsx`**

```tsx
import type { HTMLAttributes } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  elevation?: "sm" | "md" | "lg";
}

const elevationClasses = {
  sm: "shadow-sm",
  md: "shadow-md",
  lg: "shadow-lg",
};

export function Card({ elevation, className = "", children, ...props }: CardProps) {
  return (
    <div
      className={[
        "flex flex-col gap-1.5 p-3 rounded-md bg-surface",
        elevation ? elevationClasses[elevation] : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardKicker({ children }: { children: React.ReactNode }) {
  return <span className="text-[10px] tracking-wide uppercase text-accent">{children}</span>;
}

export function CardTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="font-sans font-medium text-lg leading-tight">{children}</h3>;
}

export function CardBody({ children }: { children: React.ReactNode }) {
  return <p className="m-0 text-sm opacity-80 flex-1">{children}</p>;
}

export function CardMeta({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-text/50">{children}</div>
  );
}
```

- [ ] **Step 15: Run tests to verify they pass**

Run: `cd frontend && npm run test -- Card`
Expected: 3 passed.

- [ ] **Step 16: Write the failing test — `frontend/components/ui/Table.test.tsx`**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Table } from "./Table";

describe("Table", () => {
  const columns = [
    { key: "name", header: "Name" },
    { key: "price", header: "Price" },
  ];
  const rows = [
    { name: "Speaker", price: "10000" },
    { name: "Cable", price: "2000" },
  ];

  it("renders column headers", () => {
    render(<Table columns={columns} rows={rows} rowKey={(row) => row.name} />);
    expect(screen.getByRole("columnheader", { name: "Name" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Price" })).toBeInTheDocument();
  });

  it("renders one row per data item", () => {
    render(<Table columns={columns} rows={rows} rowKey={(row) => row.name} />);
    expect(screen.getByText("Speaker")).toBeInTheDocument();
    expect(screen.getByText("Cable")).toBeInTheDocument();
  });

  it("renders an empty state when rows is empty", () => {
    render(<Table columns={columns} rows={[]} rowKey={(row) => row.name} emptyMessage="No products" />);
    expect(screen.getByText("No products")).toBeInTheDocument();
  });
});
```

- [ ] **Step 17: Write `frontend/components/ui/Table.tsx`**

```tsx
interface TableColumn<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
}

interface TableProps<T> {
  columns: TableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  emptyMessage?: string;
}

export function Table<T extends Record<string, unknown>>({
  columns,
  rows,
  rowKey,
  emptyMessage = "No data",
}: TableProps<T>) {
  return (
    <table className="w-full text-sm border-collapse">
      <thead>
        <tr className="border-b border-divider">
          {columns.map((col) => (
            <th key={col.key} className="text-left font-medium py-2 px-2 text-text/70">
              {col.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={columns.length} className="py-6 text-center text-text/50">
              {emptyMessage}
            </td>
          </tr>
        ) : (
          rows.map((row) => (
            <tr key={rowKey(row)} className="border-b border-divider">
              {columns.map((col) => (
                <td key={col.key} className="py-2 px-2">
                  {col.render ? col.render(row) : String(row[col.key] ?? "")}
                </td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 18: Run tests to verify they pass**

Run: `cd frontend && npm run test -- Table`
Expected: 3 passed.

- [ ] **Step 19: Write the failing test — `frontend/components/ui/Dialog.test.tsx`**

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Dialog } from "./Dialog";

describe("Dialog", () => {
  it("renders nothing when closed", () => {
    render(
      <Dialog open={false} onClose={() => {}} title="Confirm">
        content
      </Dialog>
    );
    expect(screen.queryByText("Confirm")).not.toBeInTheDocument();
  });

  it("renders title and children when open", () => {
    render(
      <Dialog open onClose={() => {}} title="Confirm">
        Are you sure?
      </Dialog>
    );
    expect(screen.getByText("Confirm")).toBeInTheDocument();
    expect(screen.getByText("Are you sure?")).toBeInTheDocument();
  });

  it("calls onClose when the backdrop is clicked", async () => {
    const handleClose = vi.fn();
    render(
      <Dialog open onClose={handleClose} title="Confirm">
        content
      </Dialog>
    );
    await userEvent.click(screen.getByTestId("dialog-backdrop"));
    expect(handleClose).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 20: Write `frontend/components/ui/Dialog.tsx`**

```tsx
"use client";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export function Dialog({ open, onClose, title, children }: DialogProps) {
  if (!open) return null;

  return (
    <div
      data-testid="dialog-backdrop"
      className="fixed inset-0 bg-bg/70 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-surface rounded-lg shadow-lg p-4 min-w-[320px] max-w-[90vw]"
        onClick={(e) => e.stopPropagation()}
      >
        <h4 className="m-0 mb-2">{title}</h4>
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 21: Run tests to verify they pass**

Run: `cd frontend && npm run test -- Dialog`
Expected: 3 passed.

- [ ] **Step 22: Run the full component test suite**

Run: `cd frontend && npm run test`
Expected: 25 passed (6 Button + 4 Tag + 3 Field + 3 SegmentedToggle + 3 Card + 3 Table + 3 Dialog).

- [ ] **Step 23: Commit**

```bash
git add frontend/components/
git commit -m "Add core UI component library (Button, Tag, Field, SegmentedToggle, Card, Table, Dialog)"
```

---

### Task 3: Auth BFF — login, logout, session, and generic proxy routes

**Files:**
- Create: `frontend/lib/auth.ts`
- Create: `frontend/app/api/auth/login/route.ts`
- Create: `frontend/app/api/auth/login/route.test.ts`
- Create: `frontend/app/api/auth/logout/route.ts`
- Create: `frontend/app/api/auth/logout/route.test.ts`
- Create: `frontend/app/api/auth/session/route.ts`
- Create: `frontend/app/api/auth/session/route.test.ts`
- Create: `frontend/app/api/proxy/[...path]/route.ts`
- Create: `frontend/app/api/proxy/[...path]/route.test.ts`
- Create: `frontend/lib/api-client.ts`
- Create: `frontend/lib/query-client.ts`

**Interfaces:**
- Consumes: `lib/types.ts`'s `EmployeeRole`, `Session`, `LoginResponse` (Task 1).
- Produces: `lib/auth.ts`'s cookie name constants (`ACCESS_TOKEN_COOKIE`, `REFRESH_TOKEN_COOKIE`, `ROLE_COOKIE`, `USERNAME_COOKIE`) and `getSession()` (reads cookies server-side, returns `Session | null`) — consumed by Task 5's protected layout. `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/session` — consumed by Task 4 (login page) and Task 5 (layout). `lib/api-client.ts`'s `apiFetch(path, options)` (calls through the proxy route) and `lib/query-client.ts`'s `queryClient` — consumed by every later domain phase, not directly exercised by this plan beyond being present and correctly configured.

- [ ] **Step 1: Write `frontend/lib/auth.ts`**

```typescript
import { cookies } from "next/headers";
import type { EmployeeRole, Session } from "./types";

export const ACCESS_TOKEN_COOKIE = "access_token";
export const REFRESH_TOKEN_COOKIE = "refresh_token";
export const ROLE_COOKIE = "employee_role";
export const USERNAME_COOKIE = "employee_username";

const isProduction = process.env.NODE_ENV === "production";

export const cookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: "lax" as const,
  path: "/",
};

export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;
  const role = cookieStore.get(ROLE_COOKIE)?.value as EmployeeRole | undefined;
  const username = cookieStore.get(USERNAME_COOKIE)?.value;

  if (!accessToken || !role || !username) {
    return null;
  }

  return { role, username };
}
```

- [ ] **Step 2: Write the failing test — `frontend/app/api/auth/login/route.test.ts`**

```typescript
import { describe, expect, it, vi, beforeEach } from "vitest";
import { POST } from "./route";

describe("POST /api/auth/login", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    process.env.DJANGO_API_URL = "http://localhost:8000/api";
  });

  it("returns 200 and sets cookies on successful login", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ access: "access-jwt", refresh: "refresh-jwt", role: "admin" }),
    });

    const request = new Request("http://localhost:3000/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username: "a.uwase", password: "adminpass" }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ role: "admin", username: "a.uwase" });
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("access_token=access-jwt");
  });

  it("returns 401 when Django rejects the credentials", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ detail: "No active account found with the given credentials" }),
    });

    const request = new Request("http://localhost:3000/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username: "a.uwase", password: "wrong" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(401);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd frontend && npm run test -- app/api/auth/login`
Expected: FAIL — `route.ts` doesn't exist yet.

- [ ] **Step 4: Write `frontend/app/api/auth/login/route.ts`**

```typescript
import { NextResponse } from "next/server";
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  ROLE_COOKIE,
  USERNAME_COOKIE,
  cookieOptions,
} from "@/lib/auth";
import type { LoginResponse } from "@/lib/types";

export async function POST(request: Request) {
  const { username, password } = (await request.json()) as {
    username: string;
    password: string;
  };

  const djangoResponse = await fetch(`${process.env.DJANGO_API_URL}/auth/login/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  if (!djangoResponse.ok) {
    return NextResponse.json(
      { error: "Invalid username or password" },
      { status: djangoResponse.status }
    );
  }

  const data = (await djangoResponse.json()) as LoginResponse;

  const response = NextResponse.json({ role: data.role, username });
  response.cookies.set(ACCESS_TOKEN_COOKIE, data.access, cookieOptions);
  response.cookies.set(REFRESH_TOKEN_COOKIE, data.refresh, cookieOptions);
  response.cookies.set(ROLE_COOKIE, data.role, cookieOptions);
  response.cookies.set(USERNAME_COOKIE, username, cookieOptions);

  return response;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npm run test -- app/api/auth/login`
Expected: 2 passed.

- [ ] **Step 6: Write the failing test — `frontend/app/api/auth/logout/route.test.ts`**

```typescript
import { describe, expect, it } from "vitest";
import { POST } from "./route";

describe("POST /api/auth/logout", () => {
  it("clears all session cookies", async () => {
    const response = await POST();
    const setCookie = response.headers.getSetCookie();

    expect(setCookie.some((c) => c.startsWith("access_token=;"))).toBe(true);
    expect(setCookie.some((c) => c.startsWith("refresh_token=;"))).toBe(true);
    expect(setCookie.some((c) => c.startsWith("employee_role=;"))).toBe(true);
    expect(setCookie.some((c) => c.startsWith("employee_username=;"))).toBe(true);
  });
});
```

- [ ] **Step 7: Write `frontend/app/api/auth/logout/route.ts`**

```typescript
import { NextResponse } from "next/server";
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  ROLE_COOKIE,
  USERNAME_COOKIE,
} from "@/lib/auth";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ACCESS_TOKEN_COOKIE, "", { maxAge: 0, path: "/" });
  response.cookies.set(REFRESH_TOKEN_COOKIE, "", { maxAge: 0, path: "/" });
  response.cookies.set(ROLE_COOKIE, "", { maxAge: 0, path: "/" });
  response.cookies.set(USERNAME_COOKIE, "", { maxAge: 0, path: "/" });
  return response;
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd frontend && npm run test -- app/api/auth/logout`
Expected: 1 passed.

- [ ] **Step 9: Write the failing test — `frontend/app/api/auth/session/route.test.ts`**

```typescript
import { describe, expect, it, vi } from "vitest";
import { GET } from "./route";

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

import { cookies } from "next/headers";

describe("GET /api/auth/session", () => {
  it("returns the session when valid cookies are present", async () => {
    (cookies as ReturnType<typeof vi.fn>).mockResolvedValue({
      get: (name: string) => {
        const values: Record<string, string> = {
          access_token: "jwt",
          employee_role: "sales_staff",
          employee_username: "e.mugisha",
        };
        return values[name] ? { value: values[name] } : undefined;
      },
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ role: "sales_staff", username: "e.mugisha" });
  });

  it("returns 401 when no session cookies are present", async () => {
    (cookies as ReturnType<typeof vi.fn>).mockResolvedValue({
      get: () => undefined,
    });

    const response = await GET();

    expect(response.status).toBe(401);
  });
});
```

- [ ] **Step 10: Write `frontend/app/api/auth/session/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "No active session" }, { status: 401 });
  }

  return NextResponse.json(session);
}
```

- [ ] **Step 11: Run test to verify it passes**

Run: `cd frontend && npm run test -- app/api/auth/session`
Expected: 2 passed.

- [ ] **Step 12: Write the failing test — `frontend/app/api/proxy/[...path]/route.test.ts`**

```typescript
import { describe, expect, it, vi, beforeEach } from "vitest";
import { GET } from "./route";

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

import { cookies } from "next/headers";

describe("GET /api/proxy/[...path]", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    process.env.DJANGO_API_URL = "http://localhost:8000/api";
  });

  it("forwards the request to Django with the access token attached", async () => {
    (cookies as ReturnType<typeof vi.fn>).mockResolvedValue({
      get: (name: string) =>
        name === "access_token" ? { value: "valid-jwt" } : undefined,
    });
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ count: 0, results: [] }),
    });

    const request = new Request("http://localhost:3000/api/proxy/notifications/");
    const response = await GET(request, { params: Promise.resolve({ path: ["notifications"] }) });

    expect(response.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith(
      "http://localhost:8000/api/notifications/",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer valid-jwt" }),
      })
    );
  });

  it("returns 401 when there is no access token cookie", async () => {
    (cookies as ReturnType<typeof vi.fn>).mockResolvedValue({ get: () => undefined });

    const request = new Request("http://localhost:3000/api/proxy/notifications/");
    const response = await GET(request, { params: Promise.resolve({ path: ["notifications"] }) });

    expect(response.status).toBe(401);
  });
});
```

- [ ] **Step 13: Write `frontend/app/api/proxy/[...path]/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  cookieOptions,
} from "@/lib/auth";

type RouteContext = { params: Promise<{ path: string[] }> };

async function forward(request: Request, context: RouteContext, method: string) {
  const { path } = await context.params;
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;

  if (!accessToken) {
    return NextResponse.json({ error: "No active session" }, { status: 401 });
  }

  const url = new URL(request.url);
  const targetUrl = `${process.env.DJANGO_API_URL}/${path.join("/")}/${url.search}`;

  const body =
    method === "GET" || method === "DELETE" ? undefined : await request.text();

  const djangoResponse = await fetch(targetUrl, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body,
  });

  if (djangoResponse.status === 401) {
    const refreshed = await tryRefresh(cookieStore);
    if (refreshed) {
      const retryResponse = await fetch(targetUrl, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${refreshed}`,
        },
        body,
      });
      const retryData = await retryResponse.json().catch(() => null);
      const response = NextResponse.json(retryData, { status: retryResponse.status });
      response.cookies.set(ACCESS_TOKEN_COOKIE, refreshed, cookieOptions);
      return response;
    }

    const response = NextResponse.json({ error: "Session expired" }, { status: 401 });
    response.cookies.set(ACCESS_TOKEN_COOKIE, "", { maxAge: 0, path: "/" });
    response.cookies.set(REFRESH_TOKEN_COOKIE, "", { maxAge: 0, path: "/" });
    return response;
  }

  const data = await djangoResponse.json().catch(() => null);
  return NextResponse.json(data, { status: djangoResponse.status });
}

async function tryRefresh(
  cookieStore: Awaited<ReturnType<typeof cookies>>
): Promise<string | null> {
  const refreshToken = cookieStore.get(REFRESH_TOKEN_COOKIE)?.value;
  if (!refreshToken) return null;

  const refreshResponse = await fetch(`${process.env.DJANGO_API_URL}/auth/refresh/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh: refreshToken }),
  });

  if (!refreshResponse.ok) return null;

  const data = (await refreshResponse.json()) as { access: string };
  return data.access;
}

export async function GET(request: Request, context: RouteContext) {
  return forward(request, context, "GET");
}

export async function POST(request: Request, context: RouteContext) {
  return forward(request, context, "POST");
}

export async function PATCH(request: Request, context: RouteContext) {
  return forward(request, context, "PATCH");
}

export async function PUT(request: Request, context: RouteContext) {
  return forward(request, context, "PUT");
}

export async function DELETE(request: Request, context: RouteContext) {
  return forward(request, context, "DELETE");
}
```

- [ ] **Step 14: Run test to verify it passes**

Run: `cd frontend && npm run test -- app/api/proxy`
Expected: 2 passed.

- [ ] **Step 15: Write `frontend/lib/query-client.ts`**

```typescript
import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});
```

- [ ] **Step 16: Write `frontend/lib/api-client.ts`**

```typescript
export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown) {
    super(`API request failed with status ${status}`);
    this.status = status;
    this.body = body;
  }
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/proxy/${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(response.status, data);
  }

  return data as T;
}
```

- [ ] **Step 17: Run the full BFF test suite**

Run: `cd frontend && npm run test`
Expected: 32 passed (25 from Task 2 + 2 login + 1 logout + 2 session + 2 proxy = 32).

- [ ] **Step 18: Commit**

```bash
git add frontend/lib/ frontend/app/api/
git commit -m "Add auth BFF (login/logout/session/proxy routes) with token-refresh retry"
```

---

### Task 4: Login page

**Files:**
- Create: `frontend/app/login/page.tsx`
- Create: `frontend/app/login/page.test.tsx`

**Interfaces:**
- Consumes: `components/ui/Field`, `components/ui/Button`, `components/ui/SegmentedToggle` (Task 2); `POST /api/auth/login` (Task 3).
- Produces: the `/login` route — consumed by Task 5 (session-expiry redirect target) and Task 6 (E2E tests).

- [ ] **Step 1: Write the failing test — `frontend/app/login/page.test.tsx`**

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import LoginPage from "./page";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

describe("LoginPage", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    pushMock.mockClear();
  });

  it("renders the shop name, sign-in heading, and role-redirect caption", () => {
    render(<LoginPage />);
    expect(screen.getByText("Promise Electronic Shop")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(
      screen.getByText(/Sales Staff & Technicians land on Checkout/)
    ).toBeInTheDocument();
  });

  it("redirects to /checkout on successful login as sales_staff", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ role: "sales_staff", username: "e.mugisha" }),
    });

    render(<LoginPage />);
    await userEvent.type(screen.getByLabelText("Username"), "e.mugisha");
    await userEvent.type(screen.getByLabelText("Password"), "staffpass");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/checkout"));
  });

  it("redirects to /dashboard on successful login as admin", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ role: "admin", username: "a.uwase" }),
    });

    render(<LoginPage />);
    await userEvent.type(screen.getByLabelText("Username"), "a.uwase");
    await userEvent.type(screen.getByLabelText("Password"), "adminpass");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/dashboard"));
  });

  it("shows an error message on failed login", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Invalid username or password" }),
    });

    render(<LoginPage />);
    await userEvent.type(screen.getByLabelText("Username"), "e.mugisha");
    await userEvent.type(screen.getByLabelText("Password"), "wrong");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Invalid username or password")).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test -- app/login`
Expected: FAIL — `page.tsx` doesn't exist yet.

- [ ] **Step 3: Write `frontend/app/login/page.tsx`**

```tsx
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm run test -- app/login`
Expected: 4 passed.

- [ ] **Step 5: Run the full test suite**

Run: `cd frontend && npm run test`
Expected: 36 passed.

- [ ] **Step 6: Commit**

```bash
git add frontend/app/login/
git commit -m "Add login page matching mockup 1a, wired to the auth BFF with role-based redirect"
```

---

### Task 5: Protected layout, role-gated nav, stub landing pages

**Files:**
- Create: `frontend/components/layout/Nav.tsx`
- Create: `frontend/components/layout/Nav.test.tsx`
- Create: `frontend/app/(protected)/layout.tsx`
- Create: `frontend/app/(protected)/checkout/page.tsx`
- Create: `frontend/app/(protected)/dashboard/page.tsx`

**Interfaces:**
- Consumes: `lib/auth.ts`'s `getSession()` (Task 3), `components/ui/Tag`/`SegmentedToggle` (Task 2), `lib/types.ts`'s `EmployeeRole` (Task 1).
- Produces: `Nav`'s exported `getNavLinksForRole(role)` helper — consumed by every later domain phase that adds a real page a nav link should point to (they update this function's return value, not the `Nav` component itself).

- [ ] **Step 1: Write the failing test — `frontend/components/layout/Nav.test.tsx`**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Nav, getNavLinksForRole } from "./Nav";

describe("getNavLinksForRole", () => {
  it("returns the staff link set for sales_staff", () => {
    expect(getNavLinksForRole("sales_staff")).toEqual([
      { href: "/checkout", label: "Checkout" },
      { href: "/products", label: "Products" },
      { href: "/purchases", label: "Purchases" },
      { href: "/stock", label: "Stock" },
    ]);
  });

  it("returns the staff link set for technician", () => {
    expect(getNavLinksForRole("technician")).toEqual(getNavLinksForRole("sales_staff"));
  });

  it("returns the admin link set for admin", () => {
    expect(getNavLinksForRole("admin")).toEqual([
      { href: "/dashboard", label: "Dashboard" },
      { href: "/products", label: "Products" },
      { href: "/sales", label: "Sales" },
      { href: "/purchases", label: "Purchases" },
      { href: "/stock", label: "Stock" },
      { href: "/employees", label: "Employees" },
    ]);
  });

  it("returns the admin link set for manager", () => {
    expect(getNavLinksForRole("manager")).toEqual(getNavLinksForRole("admin"));
  });
});

describe("Nav", () => {
  it("renders the staff link set and username, no role tag, for sales_staff", () => {
    render(<Nav role="sales_staff" username="e.mugisha" />);
    expect(screen.getByRole("link", { name: "Checkout" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Employees" })).not.toBeInTheDocument();
    expect(screen.getByText(/e\.mugisha/)).toBeInTheDocument();
    expect(screen.queryByText("Admin")).not.toBeInTheDocument();
  });

  it("renders the admin link set, username, and an Admin role tag, for admin", () => {
    render(<Nav role="admin" username="a.uwase" />);
    expect(screen.getByRole("link", { name: "Employees" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Checkout" })).not.toBeInTheDocument();
    expect(screen.getByText("Admin")).toBeInTheDocument();
    expect(screen.getByText(/a\.uwase/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test -- components/layout/Nav`
Expected: FAIL — `Nav.tsx` doesn't exist yet.

- [ ] **Step 3: Write `frontend/components/layout/Nav.tsx`**

```tsx
import Link from "next/link";
import { Tag } from "@/components/ui/Tag";
import type { EmployeeRole } from "@/lib/types";

interface NavLink {
  href: string;
  label: string;
}

const STAFF_LINKS: NavLink[] = [
  { href: "/checkout", label: "Checkout" },
  { href: "/products", label: "Products" },
  { href: "/purchases", label: "Purchases" },
  { href: "/stock", label: "Stock" },
];

const ADMIN_LINKS: NavLink[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/products", label: "Products" },
  { href: "/sales", label: "Sales" },
  { href: "/purchases", label: "Purchases" },
  { href: "/stock", label: "Stock" },
  { href: "/employees", label: "Employees" },
];

const ADMIN_ROLES: EmployeeRole[] = ["admin", "manager"];

export function getNavLinksForRole(role: EmployeeRole): NavLink[] {
  return ADMIN_ROLES.includes(role) ? ADMIN_LINKS : STAFF_LINKS;
}

interface NavProps {
  role: EmployeeRole;
  username: string;
}

export function Nav({ role, username }: NavProps) {
  const links = getNavLinksForRole(role);
  const isAdmin = ADMIN_ROLES.includes(role);
  const roleLabel = role === "admin" ? "Admin" : role === "manager" ? "Manager" : role === "sales_staff" ? "Sales Staff" : "Technician";

  return (
    <nav className="flex items-center gap-4 py-2.5 px-4 border-b border-divider">
      <span className="font-sans font-medium text-base mr-auto whitespace-nowrap">
        Promise Electronic Shop
      </span>
      {links.map((link) => (
        <Link key={link.href} href={link.href} className="text-sm hover:text-accent">
          {link.label}
        </Link>
      ))}
      {isAdmin && <Tag>Admin</Tag>}
      <span className="text-sm opacity-60">
        {username} · {roleLabel}
      </span>
    </nav>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm run test -- components/layout/Nav`
Expected: 6 passed.

- [ ] **Step 5: Write `frontend/app/(protected)/layout.tsx`**

```tsx
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Nav } from "@/components/layout/Nav";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  return (
    <div>
      <Nav role={session.role} username={session.username} />
      <main className="p-4">{children}</main>
    </div>
  );
}
```

- [ ] **Step 6: Write `frontend/app/(protected)/checkout/page.tsx`**

```tsx
export default function CheckoutPage() {
  return (
    <div>
      <h2>Checkout</h2>
      <p className="opacity-60">Coming soon.</p>
    </div>
  );
}
```

- [ ] **Step 7: Write `frontend/app/(protected)/dashboard/page.tsx`**

```tsx
export default function DashboardPage() {
  return (
    <div>
      <h2>Dashboard</h2>
      <p className="opacity-60">Coming soon.</p>
    </div>
  );
}
```

- [ ] **Step 8: Run the full test suite**

Run: `cd frontend && npm run test`
Expected: 42 passed (36 from Task 4 + 6 Nav tests).

- [ ] **Step 9: Commit**

```bash
git add frontend/components/layout/ "frontend/app/(protected)/"
git commit -m "Add protected layout with role-gated nav and stub checkout/dashboard pages"
```

---

### Task 6: E2E smoke tests and final integration

**Files:**
- Create: `frontend/e2e/login.spec.ts`
- Modify: `frontend/README.md` (create if it doesn't exist — `create-next-app` generates a default one)

**Interfaces:**
- Consumes: everything from Tasks 1-5, plus the live Django backend (must be running via `docker compose up` for E2E tests to pass — this is the one task in this plan that needs the real backend, not mocks).
- Produces: nothing consumed by a later task — this is the final task.

- [ ] **Step 1: Write `frontend/e2e/login.spec.ts`**

```typescript
import { test, expect } from "@playwright/test";

test.describe("Login", () => {
  test("staff login redirects to /checkout", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Username").fill("staff1");
    await page.getByLabel("Password").fill("staffpass");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL("/checkout");
    await expect(page.getByRole("link", { name: "Checkout" })).toBeVisible();
  });

  test("admin login redirects to /dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Username").fill("admin1");
    await page.getByLabel("Password").fill("adminpass");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL("/dashboard");
    await expect(page.getByText("Admin")).toBeVisible();
  });

  test("failed login shows an error and does not navigate", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Username").fill("staff1");
    await page.getByLabel("Password").fill("wrongpassword");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Invalid username or password")).toBeVisible();
    await expect(page).toHaveURL("/login");
  });

  test("visiting a protected route without a session redirects to /login", async ({ page }) => {
    await page.goto("/checkout");
    await expect(page).toHaveURL("/login");
  });
});
```

These tests require two fixture employees to exist in the Django database: a `sales_staff` employee `staff1`/`staffpass`, and an `admin` employee `admin1`/`adminpass`. Before running this task's E2E suite, create them if they don't already exist:

```bash
cd ../backend
docker compose run --rm web python manage.py shell -c "
from accounts.models import Employee
from datetime import date
if not Employee.objects.filter(username='staff1').exists():
    Employee.objects.create_user(username='staff1', password='staffpass', full_name='Staff One', hire_date=date(2025,1,1), role=Employee.Role.SALES_STAFF)
if not Employee.objects.filter(username='admin1').exists():
    Employee.objects.create_user(username='admin1', password='adminpass', full_name='Admin One', hire_date=date(2025,1,1), role=Employee.Role.ADMIN)
"
```

- [ ] **Step 2: Ensure the Django backend is running**

```bash
cd ../backend
docker compose up -d postgres redis web
```

- [ ] **Step 3: Run the E2E suite**

```bash
cd ../frontend
cp .env.local.example .env.local
npm run test:e2e
```
Expected: 4 passed. If any fail, check that the Django backend is reachable at `http://localhost:8000` and the fixture employees from Step 1 exist, before assuming a frontend defect.

- [ ] **Step 4: Run the full component/unit test suite once more**

Run: `cd frontend && npm run test`
Expected: 42 passed (unchanged from Task 5 — this task adds no new Vitest tests, only Playwright E2E tests).

- [ ] **Step 5: Run the production build once more**

Run: `cd frontend && npm run build`
Expected: exits 0, no TypeScript errors.

- [ ] **Step 6: Update `frontend/README.md`**

Replace the default `create-next-app`-generated content with:

```markdown
# Promise Electronic Shop — Frontend

Next.js 15 (App Router) + TypeScript frontend for the Promise Electronic Shop inventory/POS
system, built against the Django REST backend in `../backend`.

## Setup

1. Copy the environment template:
   ```bash
   cp .env.local.example .env.local
   ```
2. Ensure the Django backend is running (`cd ../backend && docker compose up -d`).
3. Install dependencies and run the dev server:
   ```bash
   npm install
   npm run dev
   ```
   The app is now at `http://localhost:3000`.

## Testing

- `npm run test` — Vitest component and BFF route handler tests.
- `npm run test:e2e` — Playwright E2E smoke tests (requires the Django backend running with
  `staff1`/`staffpass` and `admin1`/`adminpass` fixture employees — see Phase 1's plan for the
  exact creation command).

## Architecture

- `app/` — Next.js App Router pages and API routes (the BFF).
- `app/api/auth/` — login/logout/session routes; hold JWTs in httpOnly cookies, never expose
  them to browser JS.
- `app/api/proxy/[...path]/` — generic authenticated proxy to the Django API; every domain
  page's data fetching goes through this, not directly to Django.
- `components/ui/` — the Nocturne-themed component library (Button, Card, Field, Tag, Table,
  Dialog, SegmentedToggle) — reused across every phase.
- `components/layout/` — Nav and the role-gating logic.
- `lib/` — `auth.ts` (session/cookie helpers), `api-client.ts` (fetch wrapper for TanStack
  Query), `query-client.ts`, `types.ts`.

## Phase 1 (Foundation) — complete

Project scaffold, Nocturne design tokens ported into Tailwind, core UI component library, auth
BFF with token-refresh retry, login screen, role-gated nav shell. Domain screens (products,
purchases, sales/POS, stock/equipment, finance, notifications, admin dashboard) are stub
"Coming soon" pages, built out in later phases.
```

- [ ] **Step 7: Commit**

```bash
git add frontend/e2e/ frontend/README.md
git commit -m "Add E2E login smoke tests, document frontend setup and architecture"
```

---

## Self-Review Notes

**Mechanical verification against the real backend (all confirmed correct):**
- `POST /api/auth/login/` response shape confirmed as `{access, refresh, role}` via
  `EmployeeTokenObtainPairSerializer.validate()` in `backend/accounts/serializers.py:8-12` —
  `role` is genuinely present, not assumed.
- `Employee.Role` choices (`admin`, `manager`, `sales_staff`, `technician`) confirmed against
  `backend/accounts/models.py` — `EmployeeRole` in `lib/types.ts` matches exactly.
- `GET/PATCH /api/employees/{id}/` confirmed `IsAdmin`-only (`backend/accounts/views.py:14`) —
  this is why the plan does NOT attempt to fetch `full_name` for nav display (Global Constraints),
  since that call would 403 for non-admin roles logging in.
- Nocturne token values (colors, spacing, radius, shadows) copied verbatim from a direct read of
  the mockup's `styles.css` — every hex code, px value, and box-shadow definition in Task 1's
  `tailwind.config.ts` matches the source exactly, including the `color-mix()`-to-`rgba()`
  translation for `--color-divider`, explicitly justified rather than approximated.
- Login screen (mockup 1a) and both nav bars (1b staff, 1m admin) markup read directly from the
  mockup — the exact link sets, link order, role-badge presence (admin only), and the exact
  role-redirect caption text are transcribed, not paraphrased.

**Spec coverage:** Decision 1 (Next.js 15 App Router + TypeScript, `frontend/` top-level) → Task
1. Decision 2 (Tailwind themed with exact tokens, reusable component set) → Task 1 (tokens) +
Task 2 (all 6 named components, plus `SegmentedToggle` — justified as a 7th component since both
Foundation-owned screens, login and nav, need it, not scope creep). Decision 3 (TanStack Query) →
Task 3's `query-client.ts` (not yet exercised by a real query in this phase, since there's no
domain data to fetch yet — correctly present and configured for the first domain phase to use).
Decision 4 (BFF, httpOnly cookies, generic proxy) → Task 3 in full, including the refresh-retry
logic specified in the design's Auth flow section. Decision 5 (EN/RW visual-only) → Task 4's
`SegmentedToggle` in the login page and Task 5's `Nav`, rendered but not wired to any translation
logic. Decision 6 (desktop-first, no invented breakpoints) → no responsive utility classes added
anywhere in this plan. Decision 7 (toast pattern for sale completion generalizes to error
feedback) → correctly deferred: this phase has no domain mutations yet to generate a toast for;
the design's Error Handling section names this as this phase's shell mechanism to build, but
without a real mutation to trigger it, Task 3-5 don't include a toast component — **this is a
gap**: the approved spec's Error Handling section says the toast mechanism should be "built here
for every later phase to reuse," but no task in this plan creates a `Toast`/`Toaster` component.
Fixed by adding it to Task 2's scope below.

**Fix applied during self-review:** Task 2 is missing a `Toast` component the spec's Error
Handling section requires this phase to build. Since Task 2 already exists as the "core UI
component library" task and reviewers grade against the diff at task-review time, this component
belongs in Task 2, added as an explicit additional step rather than revising the whole task
numbering:

- [ ] **Task 2, additional Step 24 (before the final commit in Step 23): Write the failing test — `frontend/components/ui/Toast.test.tsx`**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Toast } from "./Toast";

describe("Toast", () => {
  it("renders its message", () => {
    render(<Toast message="Sale completed" variant="success" />);
    expect(screen.getByText("Sale completed")).toBeInTheDocument();
  });

  it("applies success variant classes by default", () => {
    render(<Toast message="Sale completed" />);
    expect(screen.getByRole("status").className).toContain("border-accent");
  });

  it("applies error variant classes", () => {
    render(<Toast message="Something went wrong" variant="error" />);
    expect(screen.getByRole("status").className).toContain("border-red-500");
  });
});
```

- [ ] **Task 2, additional Step 25: Write `frontend/components/ui/Toast.tsx`**

```tsx
interface ToastProps {
  message: string;
  variant?: "success" | "error";
}

export function Toast({ message, variant = "success" }: ToastProps) {
  return (
    <div
      role="status"
      className={[
        "fixed bottom-4 right-4 py-2 px-3.5 rounded-md bg-surface shadow-md border text-sm",
        variant === "success" ? "border-accent text-accent" : "border-red-500 text-red-400",
      ].join(" ")}
    >
      {message}
    </div>
  );
}
```

- [ ] **Task 2, additional Step 26: Run test to verify it passes**

Run: `cd frontend && npm run test -- Toast`
Expected: 3 passed.

This revises Task 2's final counts: **28 passed** at the end of Task 2 (25 + 3 Toast), and every
later task's "full test suite" expected count shifts up by 3 accordingly: Task 3's Step 17 becomes
**35 passed**, Task 4's Step 5 becomes **39 passed**, Task 5's Step 8 becomes **45 passed**, Task
6's Step 4 becomes **45 passed**. Report the real count from actual output at each checkpoint
rather than trusting this arithmetic blindly, consistent with this project's established practice
whenever a plan's own estimate has been wrong before.

**Placeholder scan:** no TBD/TODO/"add appropriate handling" phrases; every step has literal code
or a literal shell command. `full_name`-vs-`username` in the nav is an explicit, justified design
decision (Global Constraints), not a placeholder.

**Type/signature consistency:** `EmployeeRole`/`Session`/`LoginResponse` (Task 1) used identically
in Tasks 3, 4, 5. `getSession()` (Task 3) return type (`Session | null`) matches how Task 5's
layout consumes it (`if (!session) redirect(...)`). `getNavLinksForRole` (Task 5) exported and
tested directly, not just as an implementation detail of `Nav`. `apiFetch`/`queryClient` (Task 3)
are produced but not yet consumed within this plan — correctly so, since Foundation has no domain
data to fetch; the first domain phase's plan is where their first real usage appears.

## Execution Handoff

After saving the plan, offer execution choice:

**1. Subagent-Driven (recommended)** - dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - execute tasks in this session using executing-plans, batch execution with checkpoints

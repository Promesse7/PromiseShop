"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode, type RefObject } from "react";

/** Height of the sticky TopBar; the page heading counts as "scrolled away" once it passes under it. */
const TOP_BAR_HEIGHT = 56;

interface PageTitleState {
  /** The current page's h1 text, or null when no Page is mounted. */
  title: string | null;
  /** False once the page heading has scrolled under the top bar. */
  titleVisible: boolean;
}

interface PageTitleContextValue extends PageTitleState {
  setTitle: (title: string | null) => void;
  setTitleVisible: (visible: boolean) => void;
}

const NO_PROVIDER: PageTitleState = { title: null, titleVisible: true };

const PageTitleContext = createContext<PageTitleContextValue | null>(null);

/**
 * Lets the TopBar "tuck" the page title into itself once the page's own h1 scrolls away.
 * Page registers its heading; TopBar reads the state. Mounted once in AppShell.
 */
export function PageTitleProvider({ children }: { children: ReactNode }) {
  const [title, setTitle] = useState<string | null>(null);
  const [titleVisible, setTitleVisible] = useState(true);
  const value = useMemo(() => ({ title, titleVisible, setTitle, setTitleVisible }), [title, titleVisible]);
  return <PageTitleContext.Provider value={value}>{children}</PageTitleContext.Provider>;
}

/** For the TopBar. Outside a provider the heading always counts as visible. */
export function usePageTitleState(): PageTitleState {
  const context = useContext(PageTitleContext);
  return context ? { title: context.title, titleVisible: context.titleVisible } : NO_PROVIDER;
}

/** For Page: registers its title and watches whether its h1 is still below the top bar. */
export function usePageTitleRegistration(title: string, headingRef: RefObject<HTMLElement | null>): void {
  const context = useContext(PageTitleContext);
  const setTitle = context?.setTitle;
  const setTitleVisible = context?.setTitleVisible;

  useEffect(() => {
    if (!setTitle || !setTitleVisible) return;
    setTitle(title);
    return () => {
      setTitle(null);
      setTitleVisible(true);
    };
  }, [title, setTitle, setTitleVisible]);

  useEffect(() => {
    const heading = headingRef.current;
    if (!setTitleVisible || !heading || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (entry) setTitleVisible(Boolean(entry.isIntersecting));
      },
      { rootMargin: `-${TOP_BAR_HEIGHT}px 0px 0px 0px`, threshold: 0 }
    );
    observer.observe(heading);
    return () => observer.disconnect();
  }, [headingRef, setTitleVisible]);
}

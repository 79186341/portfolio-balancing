"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type SaveState = "saved" | "saving" | "error";

type Patch = Record<string, unknown>;

interface Job {
  patch: Patch;
  save: (patch: Patch) => Promise<unknown>;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Debounced saving keyed by record ("portfolio", "asset:3"): edits to the same
 * record within `delayMs` are merged into one save.
 */
export function useAutosave(delayMs = 500) {
  const jobs = useRef(new Map<string, Job>());
  const inFlight = useRef(0);
  const [state, setState] = useState<SaveState>("saved");

  const settle = useCallback((failed: boolean) => {
    inFlight.current -= 1;
    if (failed) setState("error");
    else if (jobs.current.size === 0 && inFlight.current === 0) setState("saved");
  }, []);

  const flush = useCallback(
    (key: string) => {
      const job = jobs.current.get(key);
      if (!job) return;
      clearTimeout(job.timer);
      jobs.current.delete(key);
      inFlight.current += 1;
      job.save(job.patch).then(
        () => settle(false),
        () => settle(true),
      );
    },
    [settle],
  );

  const schedule = useCallback(
    <P extends object>(key: string, patch: P, save: (patch: P) => Promise<unknown>) => {
      const existing = jobs.current.get(key);
      if (existing) clearTimeout(existing.timer);
      jobs.current.set(key, {
        patch: { ...existing?.patch, ...patch },
        save: save as (patch: Patch) => Promise<unknown>,
        timer: setTimeout(() => flush(key), delayMs),
      });
      setState("saving");
    },
    [delayMs, flush],
  );

  const cancel = useCallback((key: string) => {
    const job = jobs.current.get(key);
    if (!job) return;
    clearTimeout(job.timer);
    jobs.current.delete(key);
    if (jobs.current.size === 0 && inFlight.current === 0) setState("saved");
  }, []);

  // Next.js runs server actions one at a time, in order, so an action called
  // after this sees every change it sends.
  const flushAll = useCallback(() => [...jobs.current.keys()].forEach(flush), [flush]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") flushAll();
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (jobs.current.size === 0 && inFlight.current === 0) return;
      flushAll();
      event.preventDefault(); // ask the browser to confirm leaving while a save is pending
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [flushAll]);

  return { state, schedule, flush, flushAll, cancel };
}

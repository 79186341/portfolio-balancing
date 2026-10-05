"use client";

import { useSyncExternalStore } from "react";

const subscribeNoop = () => () => {};

/**
 * False during server rendering and hydration, true after. Times are formatted
 * in the browser's time zone, so only render them once this is true.
 */
export function useHydrated() {
  return useSyncExternalStore(subscribeNoop, () => true, () => false);
}

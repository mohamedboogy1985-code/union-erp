import { useSyncExternalStore } from "react";

const listeners = new Set<() => void>();
let generalPanelOpen = false;

export const setGeneralPanelOpen = (value: boolean): void => {
  if (generalPanelOpen === value) return;
  generalPanelOpen = value;
  listeners.forEach((listener) => listener());
};

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const useGeneralPanelOpen = (): boolean =>
  useSyncExternalStore(
    subscribe,
    () => generalPanelOpen,
    () => false,
  );

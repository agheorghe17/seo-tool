'use client';

import { useSyncExternalStore } from 'react';

export type ToastTone = 'success' | 'error' | 'info';
export interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}

let toasts: Toast[] = [];
const listeners = new Set<() => void>();
let nextId = 1;

function emit() {
  for (const l of listeners) l();
}

export function pushToast(message: string, tone: ToastTone = 'info', ttl = 4500): number {
  const id = nextId++;
  toasts = [...toasts, { id, tone, message: message.slice(0, 240) }];
  emit();
  if (ttl > 0) setTimeout(() => dismissToast(id), ttl);
  return id;
}

export function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export function useToasts(): Toast[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => toasts,
    () => toasts,
  );
}

/** Convenience for components. */
export function useToast() {
  return {
    success: (m: string) => pushToast(m, 'success'),
    error: (m: string) => pushToast(m, 'error'),
    info: (m: string) => pushToast(m, 'info'),
  };
}

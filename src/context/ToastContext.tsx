import { createContext, useContext } from 'react';

export type ToastKind = 'info' | 'success' | 'warning';
export type ToastFn = (message: string, kind?: ToastKind) => void;
export const ToastContext = createContext<ToastFn>(() => undefined);
export const useToast = () => useContext(ToastContext);

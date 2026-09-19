import { useState, type ReactNode } from 'react';

/** Acción destructiva en dos pasos, sin diálogos del navegador. */
export default function ConfirmButton({ children, confirmLabel, onConfirm }: { children: ReactNode; confirmLabel: string; onConfirm: () => void }) {
  const [armed, setArmed] = useState(false);
  return armed
    ? <button type="button" className="button danger" onClick={onConfirm}>{confirmLabel}</button>
    : <button type="button" className="text-button danger-text" onClick={() => setArmed(true)}>{children}</button>;
}

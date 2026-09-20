import { useState, type ReactNode } from 'react';

/** Acción destructiva en dos pasos, sin diálogos del navegador. */
export default function ConfirmButton({ children, confirmLabel, onConfirm, disabled = false }: { children: ReactNode; confirmLabel: string; onConfirm: () => void; disabled?: boolean }) {
  const [armed, setArmed] = useState(false);
  return armed
    ? <button disabled={disabled} type="button" className="button danger" onClick={() => { setArmed(false); onConfirm(); }}>{confirmLabel}</button>
    : <button disabled={disabled} type="button" className="text-button danger-text" onClick={() => setArmed(true)}>{children}</button>;
}

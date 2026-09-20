export const ROLES = ['superadmin', 'supervisor'] as const;
export type Role = (typeof ROLES)[number];
/** `mustChangePassword`: la contraseña se la puso el superadministrador y todavía no eligió una propia. */
export type User = { id: string; email: string; name: string; role: Role; active: boolean; mustChangePassword: boolean };

export const ROLE_LABELS: Record<Role, string> = { superadmin: 'Superadministrador', supervisor: 'Supervisor' };
export const MIN_PASSWORD_LENGTH = 12;

/**
 * El supervisor lleva el día a día: jugadores, torneos, inscripciones, fixture, marcadores, publicar y reabrir resultados.
 * Quedan para el superadministrador las reglas de puntuación y, en el servidor, las cuentas, la auditoría y reemplazar todos los datos.
 */
const SUPERADMIN_ACTIONS = new Set(['rules.save']);
export const canApply = (role: Role, actionType: string) => role === 'superadmin' || !SUPERADMIN_ACTIONS.has(actionType);

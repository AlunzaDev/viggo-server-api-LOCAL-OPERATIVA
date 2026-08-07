import { AUTH_ROLES, type UsuarioRol } from "./auth-roles";

const OPERATIVE_WEB_ROLES = new Set<UsuarioRol>([
  AUTH_ROLES.ADMIN,
  AUTH_ROLES.SUPER,
]);

export const isRoleAllowedForOperativeWeb = (role: UsuarioRol): boolean =>
  OPERATIVE_WEB_ROLES.has(role);

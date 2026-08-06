import { NextFunction, Request, Response } from "express";

import { JwtPlugin } from "../../config/plugins/jwt.plugin";

import {
  hasUserModuleAccess,
  isUsuarioRol,
  isWebOperativeApp,
  normalizeUserApps,
  normalizeUserModules,
  normalizeUserParkings,
  type UserAppAccess,
  type UserModuleAccess,
  type UsuarioRol,
  type WebOperativeApp,
} from "../../domain/constants";

import { CustomError } from "../../domain/errors/custom.error";

import { AuthMongoDatasource } from "../../infrastructure/datasources/auth/auth.datasource.mongo";
import { AuthRepositoryImpl } from "../../infrastructure/repositories/auth/auth.repository.impl";

type AuthenticatedUser = {
  id: string;
  nombre?: string;
  apellido?: string;
  rol: UsuarioRol;
  parkings: string[];
  modules: UserModuleAccess[];
  allowedApps: UserAppAccess[];
};

type AuthenticatedRequest = Request & {
  uid?: string;
  authApp?: WebOperativeApp;
  usuario?: AuthenticatedUser;
};

type AuthTokenPayload = {
  id: string;
  app: WebOperativeApp;
};

const getRequestToken = (req: Request): string | undefined => {
  const authorization = req.header("Authorization");

  if (authorization?.startsWith("Bearer ")) {
    const token = authorization.slice("Bearer ".length).trim();

    return token || undefined;
  }

  const legacyToken = req.header("x-token")?.trim();

  return legacyToken || undefined;
};

const parseAuthTokenPayload = (payload: unknown): AuthTokenPayload | null => {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;

  const id = String(record.id ?? "").trim();
  const app = record.app;

  if (!id || !isWebOperativeApp(app)) {
    return null;
  }

  return {
    id,
    app,
  };
};

const normalizeRole = (value: unknown): UsuarioRol | null => {
  return isUsuarioRol(value) ? value : null;
};

export const getAuthenticatedRequestUser = (
  req: Request,
): AuthenticatedRequest["usuario"] => {
  return (req as AuthenticatedRequest).usuario;
};

export const getAuthenticatedRequestApp = (
  req: Request,
): WebOperativeApp | undefined => {
  return (req as AuthenticatedRequest).authApp;
};

export const getAllowedProjectIdsFromRequest = (req: Request): string[] => {
  const authUser = getAuthenticatedRequestUser(req);

  return authUser?.parkings ?? [];
};

export const isSuperAdminRequest = (req: Request): boolean => {
  return getAuthenticatedRequestUser(req)?.rol === "SUPER_ROLE";
};

export const canAccessProjectFromRequest = (
  req: Request,
  projectId: string,
): boolean => {
  if (isSuperAdminRequest(req)) {
    return true;
  }

  const normalizedProjectId = String(projectId ?? "").trim();

  if (!normalizedProjectId) {
    return false;
  }

  return getAllowedProjectIdsFromRequest(req).includes(normalizedProjectId);
};

export const ensureProjectAccessFromRequest = (
  req: Request,
  projectId: string,
): void => {
  if (!canAccessProjectFromRequest(req, projectId)) {
    throw CustomError.forbidden("No tienes acceso al proyecto solicitado");
  }
};

export class AuthMiddleware {
  static requireAuth = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const token = getRequestToken(req);

      if (!token) {
        return res.status(401).json({
          error: "No token provided",
        });
      }

      const rawPayload = await JwtPlugin.validateToken(token);

      const payload = parseAuthTokenPayload(rawPayload);

      if (!payload) {
        return res.status(401).json({
          error: "Invalid token",
        });
      }

      const datasource = new AuthMongoDatasource();

      const repository = new AuthRepositoryImpl(datasource);

      const usuario = await repository.findById(payload.id);

      if (!usuario || !usuario.estado) {
        return res.status(401).json({
          error: "User not found or inactive",
        });
      }

      if (!usuario.emailValidated) {
        return res.status(403).json({
          error: "La cuenta aún no ha sido validada",
        });
      }

      const normalizedRole = normalizeRole(usuario.rol);

      if (!normalizedRole) {
        return res.status(403).json({
          error: "Invalid role",
        });
      }

      const allowedApps = normalizeUserApps(usuario.allowedApps);

      if (!allowedApps.includes(payload.app)) {
        return res.status(403).json({
          error: "El usuario no tiene acceso al Web Operativo",
        });
      }

      const authRequest = req as AuthenticatedRequest;

      authRequest.uid = usuario.id;
      authRequest.authApp = payload.app;

      authRequest.usuario = {
        id: usuario.id,
        nombre: usuario.nombre,
        apellido: usuario.apellido,
        rol: normalizedRole,
        parkings: normalizeUserParkings(usuario.parkings),
        modules: normalizeUserModules(usuario.modules),
        allowedApps,
      };

      return next();
    } catch (_error) {
      return res.status(401).json({
        error: "Unauthorized",
      });
    }
  };

  static requireRoles = (...allowedRoles: UsuarioRol[]) => {
    return (req: Request, res: Response, next: NextFunction) => {
      const authRequest = req as AuthenticatedRequest;

      if (!authRequest.usuario) {
        return res.status(401).json({
          error: "Unauthorized",
        });
      }

      if (!allowedRoles.includes(authRequest.usuario.rol)) {
        return res.status(403).json({
          error: "Forbidden",
        });
      }

      return next();
    };
  };

  static requireModules = (...allowedModules: UserModuleAccess[]) => {
    return (req: Request, res: Response, next: NextFunction) => {
      const authRequest = req as AuthenticatedRequest;

      if (!authRequest.usuario) {
        return res.status(401).json({
          error: "Unauthorized",
        });
      }

      if (allowedModules.length === 0) {
        return next();
      }

      if (authRequest.usuario.rol === "SUPER_ROLE") {
        return next();
      }

      const hasAccess = allowedModules.some((module) =>
        hasUserModuleAccess(authRequest.usuario!.modules, module),
      );

      if (!hasAccess) {
        return res.status(403).json({
          error: "Forbidden",
        });
      }

      return next();
    };
  };
}

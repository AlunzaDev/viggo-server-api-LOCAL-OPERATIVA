import { AuthMongoDatasource } from "../../infrastructure/datasources/auth/auth.datasource.mongo";
import { PermissionProfileMongoDatasource } from "../../infrastructure/datasources/auth/permission-profile.datasource.mongo";

import { AuthRepositoryImpl } from "../../infrastructure/repositories/auth/auth.repository.impl";
import { PermissionProfileRepositoryImpl } from "../../infrastructure/repositories/auth/permission-profile.repository.impl";

import { AuthController } from "../routes/auth/auth.controller";
import { AuthService } from "../services/auth/auth.service";

export const buildAuthController = (): AuthController => {
  const authRepository = new AuthRepositoryImpl(new AuthMongoDatasource());

  const permissionProfileRepository = new PermissionProfileRepositoryImpl(
    new PermissionProfileMongoDatasource(),
  );

  const authService = new AuthService(
    authRepository,
    permissionProfileRepository,
  );

  return new AuthController(authService);
};

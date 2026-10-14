import { buildAuthRepository, buildPermissionProfileRepository } from "./repositories.dependencies";


import { AuthController } from "../routes/auth/auth.controller";
import { AuthService } from "../services/auth/auth.service";

export const buildAuthController = (): AuthController => {
  const authRepository = buildAuthRepository();

  const permissionProfileRepository = buildPermissionProfileRepository();

  const authService = new AuthService(
    authRepository,
    permissionProfileRepository,
  );

  return new AuthController(authService);
};

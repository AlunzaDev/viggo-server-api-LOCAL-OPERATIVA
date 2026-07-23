import { AuthMongoDatasource } from "../../infrastructure/datasources/auth/auth.datasource.mongo";
import { AuthRepositoryImpl } from "../../infrastructure/repositories/auth/auth.repository.impl";
import { AuthController } from "../routes/auth/auth.controller";
import { AuthService } from "../services/auth/auth.service";

export const buildAuthController = (): AuthController => {
  const repository = new AuthRepositoryImpl(new AuthMongoDatasource());
  return new AuthController(new AuthService(repository));
};

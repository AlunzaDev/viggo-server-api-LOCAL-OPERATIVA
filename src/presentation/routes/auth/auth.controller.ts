import { Request, Response } from "express";

import type { WebOperativeApp } from "../../../domain/constants";

import { LoginCorreoDto } from "../../../domain/dtos/auth/login-correo.dto";
import { LoginTelefonoDto } from "../../../domain/dtos/auth/login-telefono.dto";
import { UpdateBarrierBlasterHighScoreDto } from "../../../domain/dtos/auth/update-barrier-blaster-high-score.dto";

import { AuthService } from "../../services/auth/auth.service";
import { ErrorService } from "../../services/error.service";

type AuthenticatedRequest = Request & {
  uid?: string;
  authApp?: WebOperativeApp;
};

export class AuthController {
  constructor(private readonly authService: AuthService) {}

  loginCorreo = async (req: Request, res: Response) => {
    try {
      const [error, dto] = LoginCorreoDto.create(req.body);

      if (error || !dto) {
        return res.status(400).json({
          error: error ?? "Los datos de inicio de sesión son inválidos",
        });
      }

      const result = await this.authService.loginCorreo(
        dto.correo,
        dto.password,
        dto.app,
      );

      return res.status(200).json(result);
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  loginTelefono = async (req: Request, res: Response) => {
    try {
      const [error, dto] = LoginTelefonoDto.create(req.body);

      if (error || !dto) {
        return res.status(400).json({
          error: error ?? "Los datos de inicio de sesión son inválidos",
        });
      }

      const result = await this.authService.loginTelefono(
        dto.telefono,
        dto.password,
        dto.app,
      );

      return res.status(200).json(result);
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  renewToken = async (req: Request, res: Response) => {
    try {
      const authRequest = req as AuthenticatedRequest;

      const id = authRequest.uid;
      const app = authRequest.authApp;

      if (!id) {
        return res.status(401).json({
          error: "Unauthorized",
        });
      }

      if (!app) {
        return res.status(401).json({
          error: "La sesión no contiene una aplicación válida",
        });
      }

      const result = await this.authService.renewToken(id, app);

      return res.status(200).json(result);
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  updateBarrierBlasterHighScore = async (req: Request, res: Response) => {
    try {
      const id = (req as AuthenticatedRequest).uid;
      const [error, dto] = UpdateBarrierBlasterHighScoreDto.create(
        req.body ?? {},
      );

      if (!id) return res.status(401).json({ error: "Unauthorized" });
      if (error || !dto) return res.status(400).json({ error });

      const highScore = await this.authService.updateBarrierBlasterHighScore(
        id,
        dto.score,
      );
      return res.status(200).json({ barrierBlasterHighScore: highScore });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };
}

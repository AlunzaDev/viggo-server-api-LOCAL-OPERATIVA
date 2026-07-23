import { Request, Response } from "express";
import { LoginCorreoDto } from "../../../domain/dtos/auth/login-correo.dto";
import { LoginTelefonoDto } from "../../../domain/dtos/auth/login-telefono.dto";
import { ErrorService } from "../../services/error.service";
import { AuthService } from "../../services/auth/auth.service";

export class AuthController {
  constructor(private readonly authService: AuthService) {}

  loginCorreo = async (req: Request, res: Response) => {
    try {
      const [error, dto] = LoginCorreoDto.create(req.body);
      if (error) return res.status(400).json({ error });

      const result = await this.authService.loginCorreo(dto!.correo, dto!.password);
      return res.status(200).json(result);
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  loginTelefono = async (req: Request, res: Response) => {
    try {
      const [error, dto] = LoginTelefonoDto.create(req.body);
      if (error) return res.status(400).json({ error });

      const result = await this.authService.loginTelefono(
        dto!.telefono,
        dto!.password,
      );
      return res.status(200).json(result);
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  renewToken = async (req: Request, res: Response) => {
    try {
      const id = (req as Request & { uid?: string }).uid;
      if (!id) return res.status(401).json({ error: "Unauthorized" });

      const result = await this.authService.renewToken(id);
      return res.status(200).json(result);
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };
}

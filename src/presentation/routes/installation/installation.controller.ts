import type { Request, Response } from "express";
import { CustomError } from "../../../domain/errors/custom.error";
import { getAuthenticatedRequestUser } from "../../middlewares";
import { ErrorService } from "../../services/error.service";
import type { InstallationLinkService } from "../../services/installation/installation-link.service";

/** HTTP for this installation's link to the cloud; the flow lives in InstallationLinkService. */
export class InstallationController {
  constructor(private readonly link: InstallationLinkService) {}

  resetInstallation = async (req: Request, res: Response) => {
    try {
      const installation = await this.link.reset(String(req.body?.installationId ?? ""), getAuthenticatedRequestUser(req));
      return res.status(200).json({ installation });
    } catch (error) {
      // The web shows how many changes are still waiting to be sent.
      if (error instanceof CustomError && error.code === "OUTBOX_PENDING") {
        return res.status(409).json({ error: error.message, code: error.code, pending: (error.details as { pending: number }).pending });
      }
      return ErrorService.handleApiError(error, res);
    }
  };

  getStatus = async (_req: Request, res: Response) => {
    try {
      return res.status(200).json({ installation: await this.link.status() });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  previewProjectLink = async (req: Request, res: Response) => {
    try {
      return res.status(200).json({ proyecto: await this.link.previewLink(String(req.body?.installationLinkToken ?? "").trim()) });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  requestProjectLink = async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const installation = await this.link.requestLink({
        installationLinkToken: String(body.installationLinkToken ?? ""),
        browserCoordinates: body.browserCoordinates,
        browserLocationAccuracy: body.browserLocationAccuracy,
        browserLocationCapturedAt: body.browserLocationCapturedAt,
      }, getAuthenticatedRequestUser(req));
      return res.status(202).json({ installation });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };
}

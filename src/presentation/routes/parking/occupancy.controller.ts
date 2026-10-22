import type { Request, Response } from "express";
import { ErrorService } from "../../services/error.service";
import type { OccupancyService } from "../../services/parking/occupancy.service";

/** HTTP for the occupancy screen; always this installation's parking. */
export class OccupancyController {
  constructor(private readonly occupancy: OccupancyService) {}

  get = async (req: Request, res: Response) => {
    try {
      return res.status(200).json(await this.occupancy.get(String((req as Request & { localProjectId?: string }).localProjectId)));
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };
}

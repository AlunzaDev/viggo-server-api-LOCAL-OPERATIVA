import { OccupancyController } from "../routes/parking/occupancy.controller";
import { OccupancyService } from "../services/parking/occupancy.service";
import { buildOccupancyRepository, buildProyectoRepository } from "./repositories.dependencies";

export const buildOccupancyController = () =>
  new OccupancyController(new OccupancyService(buildOccupancyRepository(), buildProyectoRepository()));

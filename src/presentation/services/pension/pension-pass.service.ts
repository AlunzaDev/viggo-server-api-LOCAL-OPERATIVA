import { PensionPassEntity } from "../../../domain/entities/pension/pension-pass.entity";
import { CustomError } from "../../../domain/errors/custom.error";
import { ModuloRepository } from "../../../domain/repository/parking/modulo.repository";
import { ProyectoRepository } from "../../../domain/repository/parking/proyecto.repository";
import { PensionMoveRepository } from "../../../domain/repository/pension/pension-move.repository";
import { PensionPassRepository } from "../../../domain/repository/pension/pension-pass.repository";
import { PensionRepository } from "../../../domain/repository/pension/pension.repository";
import {
  buildPaginatedResponse,
  paginateArray,
  parsePaginationDateQuery,
  PaginationDateQuery,
} from "../shared/pagination-query";
import { PensionPassAccessService } from "./pension-pass-access.service";
import {
  PensionMoveResponse,
  PensionPassCardResponse,
  PensionPassResponseMapper,
} from "./pension-pass-response.mapper";

/**
 * Operational access to contracts synchronized from NUBEADMIN.
 * Contract creation, renewal and commercial status changes do not belong here.
 */
export class PensionPassService {
  private readonly responseMapper: PensionPassResponseMapper;
  private readonly accessService: PensionPassAccessService;

  constructor(
    private readonly pensionPassRepository: PensionPassRepository,
    private readonly pensionRepository: PensionRepository,
    proyectoRepository: ProyectoRepository,
    moduloRepository: ModuloRepository,
    private readonly pensionMoveRepository: PensionMoveRepository,
  ) {
    this.responseMapper = new PensionPassResponseMapper(
      pensionRepository,
      proyectoRepository,
      moduloRepository,
    );
    this.accessService = new PensionPassAccessService(
      pensionPassRepository,
      pensionRepository,
      moduloRepository,
      pensionMoveRepository,
      this.responseMapper,
    );
  }

  getPensionPasses(): Promise<PensionPassEntity[]> {
    return this.pensionPassRepository.getAll();
  }

  async getPensionPassById(id: string): Promise<PensionPassEntity> {
    const pensionPass = await this.pensionPassRepository.findById(id);
    if (!pensionPass) throw CustomError.notFound("PensionPass no encontrado");
    return pensionPass;
  }

  async getPensionPassesByPension(pensionId: string): Promise<PensionPassEntity[]> {
    const pension = await this.pensionRepository.findById(pensionId);
    if (!pension) throw CustomError.notFound("Pension no encontrada");
    return this.pensionPassRepository.getByPension(pensionId);
  }

  getPensionPassesByUsuario(usuarioId: string): Promise<PensionPassEntity[]> {
    return this.pensionPassRepository.getByUsuario(usuarioId);
  }

  async getPensionPassCardsByUsuario(
    usuarioId: string,
  ): Promise<PensionPassCardResponse[]> {
    const passes = await this.getPensionPassesByUsuario(usuarioId);
    return Promise.all(
      passes.map((pass) => this.responseMapper.toPensionPassCardResponse(pass)),
    );
  }

  async getPensionPassCardById(id: string): Promise<PensionPassCardResponse> {
    return this.responseMapper.toPensionPassCardResponse(
      await this.getPensionPassById(id),
    );
  }

  async getProyectoIdByPensionId(pensionId: string): Promise<string> {
    const pension = await this.pensionRepository.findById(pensionId);
    if (!pension) throw CustomError.notFound("Pension no encontrada");
    return pension.proyecto;
  }

  async getProyectoIdByPensionPassId(pensionPassId: string): Promise<string> {
    const pass = await this.getPensionPassById(pensionPassId);
    return this.getProyectoIdByPensionId(pass.pension);
  }

  async getPensionMovesByPensionPass(
    pensionPassId: string,
    query: PaginationDateQuery = {},
  ) {
    await this.getPensionPassById(pensionPassId);
    const { page, limit, from, to } = parsePaginationDateQuery(query);
    const moves = await this.pensionMoveRepository.getByPensionPass(pensionPassId);
    const filtered = moves
      .filter((move) =>
        (from === undefined || move.fecha >= from) &&
        (to === undefined || move.fecha <= to),
      )
      .sort((a, b) => b.fecha - a.fecha);
    const pageItems = paginateArray(filtered, page, limit);
    const response = await Promise.all(
      pageItems.map((move) => this.responseMapper.toPensionMoveResponse(move)),
    );
    return buildPaginatedResponse(
      "pensionMoves",
      response,
      filtered.length,
      page,
      limit,
    );
  }

  openBarrierWithPensionPass(
    usuarioId: string,
    pensionPassId: string,
    moduleToken: string,
  ): Promise<PensionMoveResponse> {
    return this.accessService.openBarrierWithPensionPass(
      usuarioId,
      pensionPassId,
      moduleToken,
    );
  }
}

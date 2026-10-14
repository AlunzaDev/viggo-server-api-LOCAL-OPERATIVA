import { JwtPlugin } from "../../../config/plugins/jwt.plugin";
import { PensionEntity } from "../../../domain/entities/pension/pension.entity";
import { TransactionRunner } from "../../../domain/datasources/system/transaction";
import {
  assertPensionPassage,
  type PensionPassageTipo,
} from "../../../domain/entities/pension/pension-move.entity";
import { PensionPassEntity } from "../../../domain/entities/pension/pension-pass.entity";
import { CustomError } from "../../../domain/errors/custom.error";
import { ModuloRepository } from "../../../domain/repositories/parking/modulo.repository";
import { PensionMoveRepository } from "../../../domain/repositories/pension/pension-move.repository";
import { PensionPassRepository } from "../../../domain/repositories/pension/pension-pass.repository";
import { PensionRepository } from "../../../domain/repositories/pension/pension.repository";
import { SocketServerPlugin } from "../../sockets/socket-server";
import {
  PensionMoveResponse,
  PensionPassResponseMapper,
} from "./pension-pass-response.mapper";

export class PensionPassAccessService {
  constructor(
    private readonly pensionPassRepository: PensionPassRepository,
    private readonly pensionRepository: PensionRepository,
    private readonly moduloRepository: ModuloRepository,
    private readonly pensionMoveRepository: PensionMoveRepository,
    private readonly responseMapper: PensionPassResponseMapper,
    private readonly transactions: TransactionRunner,
  ) {}

  async openBarrierWithPensionPass(
    usuarioId: string,
    pensionPassId: string,
    moduleToken: string,
  ): Promise<PensionMoveResponse> {
    const pensionPass = await this.getValidPensionPass(pensionPassId, usuarioId);
    const pension = await this.getValidPension(pensionPass.pension);
    const modulo = await this.getValidModulo(moduleToken, pension.proyecto);

    const tipo = modulo.tipo as PensionPassageTipo;
    // Fast feedback; registerPassage checks again against the locked, current state.
    assertPensionPassage(pensionPass.inParking, tipo);
    this.validatePensionPassSchedule(pension);

    // The passage is recorded only if the barrier opens; a second simultaneous read of
    // the same pass waits and then fails anti-passback instead of flipping the state back.
    const pensionMove = await this.transactions.run(async (tx) => {
      const move = await this.pensionMoveRepository.registerPassage(
        {
          pensionPassId: pensionPass.id,
          moduloId: modulo.id,
          proyectoId: pension.proyecto,
          tipo,
          fecha: Date.now(),
        },
        tx,
      );
      await SocketServerPlugin.openBarrier(modulo.id);
      return move;
    });

    return this.responseMapper.toPensionMoveResponse(
      pensionMove,
      modulo.nombre,
    );
  }

  private async getValidPensionPass(
    pensionPassId: string,
    usuarioId: string,
  ): Promise<PensionPassEntity> {
    const pensionPass = await this.pensionPassRepository.findById(pensionPassId);

    if (!pensionPass) {
      throw CustomError.notFound("PensionPass no encontrado");
    }

    if (pensionPass.usuario && pensionPass.usuario !== usuarioId) {
      throw CustomError.unauthorized("La pension no pertenece al usuario");
    }

    if (!pensionPass.estado || !pensionPass.vigent) {
      throw CustomError.badRequest("La pension no esta vigente");
    }

    if (pensionPass.to !== -1 && Date.now() > pensionPass.to) {
      await this.pensionPassRepository.update(pensionPass.id, {
        vigent: false,
        from: -1,
        to: -1,
      });
      throw CustomError.badRequest(
        "La pension expiro. Renuevala para volver a usarla.",
        { pensionPassId: pensionPass.id },
        "PENSION_PASS_EXPIRED",
      );
    }

    return pensionPass;
  }

  private async getValidPension(pensionId: string): Promise<PensionEntity> {
    const pension = await this.pensionRepository.findById(pensionId);

    if (!pension) {
      throw CustomError.badRequest("La pension asociada no existe");
    }

    if (!pension.estado) {
      throw CustomError.badRequest("La pension se encuentra inhabilitada");
    }

    return pension;
  }

  private async getValidModulo(moduleToken: string, proyectoId: string) {
    const moduloId = await this.getModuloIdFromToken(moduleToken);
    const modulo = await this.moduloRepository.findById(moduloId);

    if (!modulo) {
      throw CustomError.badRequest("El modulo no existe");
    }

    if (modulo.proyecto !== proyectoId) {
      throw CustomError.badRequest(
        "El modulo no pertenece al proyecto de la pension",
      );
    }

    if (modulo.tipo === "POS") {
      throw CustomError.badRequest("El modulo no es de entrada o salida");
    }

    return modulo;
  }

  private async getModuloIdFromToken(moduleToken: string): Promise<string> {
    const payload = await JwtPlugin.validateToken(moduleToken);

    if (!payload || typeof payload !== "object") {
      throw CustomError.badRequest("El token del modulo es invalido");
    }

    const moduloId =
      "id" in payload
        ? String(payload.id)
        : "uid" in payload
          ? String(payload.uid)
          : "";

    if (!moduloId) {
      throw CustomError.badRequest("El token del modulo es invalido");
    }

    return moduloId;
  }

  private validatePensionPassSchedule(pension: PensionEntity): void {
    const now = new Date();
    const validez = pension.validez.find((item) => item.weekDay === now.getDay());

    if (!validez) {
      throw CustomError.badRequest("No hay horario configurado para este dia");
    }

    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const fromMinutes = (validez.from[0] ?? 0) * 60 + (validez.from[1] ?? 0);
    const toMinutes = (validez.to[0] ?? 0) * 60 + (validez.to[1] ?? 0);

    if (currentMinutes < fromMinutes || currentMinutes > toMinutes) {
      throw CustomError.badRequest("Se encuentra fuera del rango de horas");
    }
  }
}

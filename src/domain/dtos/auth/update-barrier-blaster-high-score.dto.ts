export class UpdateBarrierBlasterHighScoreDto {
  private constructor(public readonly score: number) {}

  static create(object: Record<string, unknown>): [string?, UpdateBarrierBlasterHighScoreDto?] {
    const score = object.score;

    if (typeof score !== "number" || !Number.isInteger(score)) {
      return ["El score debe ser un numero entero"];
    }

    if (score < 0 || score > 1_000_000_000) {
      return ["El score debe estar entre 0 y 1000000000"];
    }

    return [undefined, new UpdateBarrierBlasterHighScoreDto(score)];
  }
}

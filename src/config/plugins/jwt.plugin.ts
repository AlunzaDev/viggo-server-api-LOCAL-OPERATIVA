import jwt, { type JwtPayload, type SignOptions } from "jsonwebtoken";

import { envs } from "./envs.plugin";

const SESSION_TOKEN_DURATION_SECONDS = 60 * 60 * 24 * 2;

const JWT_ALGORITHM = "HS256" as const;

type TokenPayload = Record<string, unknown>;

type ValidatedToken = JwtPayload | string;

export class JwtPlugin {
  private static getSeed(): string {
    if (!envs.JWT_SEED) {
      throw new Error("JWT_SEED is required to use JwtPlugin.");
    }

    return envs.JWT_SEED;
  }

  static generateToken(
    payload: TokenPayload,
    duration: number = SESSION_TOKEN_DURATION_SECONDS,
  ): Promise<string | null> {
    const options: SignOptions = {
      expiresIn: duration,
      algorithm: JWT_ALGORITHM,
    };

    return new Promise((resolve) => {
      jwt.sign(payload, this.getSeed(), options, (error, token) => {
        if (error || !token) {
          resolve(null);
          return;
        }

        resolve(token);
      });
    });
  }

  static validateToken(token: string): Promise<ValidatedToken | null> {
    return new Promise((resolve) => {
      jwt.verify(
        token,
        this.getSeed(),
        {
          algorithms: [JWT_ALGORITHM],
        },
        (error, decoded) => {
          if (error || !decoded) {
            resolve(null);
            return;
          }

          resolve(decoded);
        },
      );
    });
  }
}

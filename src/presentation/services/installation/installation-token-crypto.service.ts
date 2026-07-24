import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { envs } from "../../../config";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

const getKey = () => {
  const secret = envs.INSTALLATION_SECRET_KEY || envs.JWT_SEED;
  return createHash("sha256").update(secret).digest();
};

export class InstallationTokenCryptoService {
  static encrypt(token: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, getKey(), iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    const encrypted = Buffer.concat([
      cipher.update(token, "utf8"),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return [
      "v1",
      iv.toString("base64url"),
      authTag.toString("base64url"),
      encrypted.toString("base64url"),
    ].join(".");
  }

  static decrypt(value: string): string {
    const [version, ivValue, authTagValue, encryptedValue] = value.split(".");
    if (version !== "v1" || !ivValue || !authTagValue || !encryptedValue) {
      throw new Error("Invalid encrypted installation token");
    }

    const decipher = createDecipheriv(
      ALGORITHM,
      getKey(),
      Buffer.from(ivValue, "base64url"),
      { authTagLength: AUTH_TAG_LENGTH },
    );
    decipher.setAuthTag(Buffer.from(authTagValue, "base64url"));

    return Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  }
}

import jwt from "jsonwebtoken";
import { config } from "../config/env";
import crypto from "crypto";

export class JwtService {
  private privateKey: string;
  private publicKey: string;
  private tokenExpirationSeconds: number;
  private audience: string;

  constructor() {
    this.privateKey = config.paragon.signingKey;
    if (!this.privateKey) {
      throw new Error("PARAGON_SIGNING_KEY environment variable is required");
    }
    if (!config.paragon.projectId) {
      throw new Error("PARAGON_PROJECT_ID environment variable is required");
    }
    this.publicKey = this.extractPublicKey(this.privateKey);
    this.tokenExpirationSeconds = config.paragon.tokenExpirationSeconds;
    this.audience = `dashboard.useparagon.com/${config.paragon.projectId}`;
  }

  private extractPublicKey(privateKey: string): string {
    try {
      const keyObject = crypto.createPrivateKey(privateKey);
      const publicKey = crypto.createPublicKey(keyObject);
      return publicKey.export({ type: "spki", format: "pem" }) as string;
    } catch (error) {
      throw new Error(
        "Failed to extract public key from private key. Ensure PARAGON_SIGNING_KEY is a valid RSA private key in PEM format."
      );
    }
  }

  signToken(userId: string): string {
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      sub: userId,
      iat: now,
      exp: now + this.tokenExpirationSeconds,
      aud: this.audience,
    };

    return jwt.sign(payload, this.privateKey, {
      algorithm: "RS256",
    });
  }

  verifyToken(
    token: string
  ): { sub: string; iat: number; exp: number; aud: string } | null {
    try {
      const decoded = jwt.verify(token, this.publicKey, {
        algorithms: ["RS256"],
        audience: this.audience,
      }) as { sub: string; iat: number; exp: number; aud: string };

      return decoded;
    } catch (error) {
      return null;
    }
  }
}

export const jwtService = new JwtService();

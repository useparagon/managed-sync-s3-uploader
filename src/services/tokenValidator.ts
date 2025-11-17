import { jwtService } from "./jwtService";

export class TokenValidator {
  private validatedTokens: Map<string, number> = new Map();
  private validationCacheMs: number = 5 * 60 * 1000; // 5 minutes

  async validateToken(token: string): Promise<boolean> {
    const now = Date.now();
    const cached = this.validatedTokens.get(token);

    if (cached && now - cached < this.validationCacheMs) {
      return true;
    }

    const decoded = jwtService.verifyToken(token);

    if (decoded) {
      this.validatedTokens.set(token, now);
      return true;
    }

    return false;
  }

  clearCache(): void {
    this.validatedTokens.clear();
  }
}

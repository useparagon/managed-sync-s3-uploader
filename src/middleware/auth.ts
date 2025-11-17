import { Request, Response, NextFunction } from "express";
import { TokenValidator } from "../services/tokenValidator";

const tokenValidator = new TokenValidator();

export interface AuthenticatedRequest extends Request {
  paragonToken?: string;
}

export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({
      error: "Unauthorized",
      message:
        "Missing or invalid Authorization header. Expected: Bearer <token>",
    });
    return;
  }

  const token = authHeader.substring(7);

  if (!token) {
    res.status(401).json({
      error: "Unauthorized",
      message: "Token is required",
    });
    return;
  }

  const isValid = await tokenValidator.validateToken(token);

  if (!isValid) {
    res.status(401).json({
      error: "Unauthorized",
      message: "Invalid or expired Paragon User Token",
    });
    return;
  }

  req.paragonToken = token;
  next();
}

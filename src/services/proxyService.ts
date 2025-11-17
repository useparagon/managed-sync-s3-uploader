import axios, { AxiosInstance } from "axios";
import { Request, Response } from "express";
import { config } from "../config/env";
import { wrapAxiosError } from "../utils/axiosError";
import { logger, LogCategory } from "../utils/logger";

export class ProxyService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = config.paragon.baseUrl;
  }

  private createClient(token: string): AxiosInstance {
    return axios.create({
      baseURL: this.baseUrl,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      timeout: 60000,
    });
  }

  async proxyRequest(
    req: Request,
    res: Response,
    token: string
  ): Promise<void> {
    try {
      const path = req.path.replace(/^\/api/, "");
      const url = `${this.baseUrl}${path}`;

      const client = this.createClient(token);

      const requestConfig: any = {
        method: req.method.toLowerCase() as any,
        url,
        params: req.query,
        headers: {} as Record<string, string>,
        data: req.body,
      };

      Object.keys(req.headers).forEach((key) => {
        const lowerKey = key.toLowerCase();
        if (
          lowerKey !== "host" &&
          lowerKey !== "content-length" &&
          lowerKey !== "authorization"
        ) {
          requestConfig.headers[key] = req.headers[key] as string;
        }
      });

      if (
        req.headers.accept?.includes("application/octet-stream") ||
        req.headers.accept?.includes("*/*")
      ) {
        requestConfig.responseType = "arraybuffer";
      }

      const response = await client.request(requestConfig);

      if (requestConfig.responseType === "arraybuffer") {
        res.set(response.headers);
        res.status(response.status).send(response.data);
      } else {
        res.status(response.status).json(response.data);
      }
    } catch (error: unknown) {
      const apiError = wrapAxiosError(error);
      if (apiError.statusCode) {
        if (
          req.headers.accept?.includes("application/octet-stream") ||
          req.headers.accept?.includes("*/*")
        ) {
          res.status(apiError.statusCode).send(apiError.body);
        } else {
          res.status(apiError.statusCode).json(apiError.body || { error: apiError.message });
        }
      } else {
        logger.error(LogCategory.PROXY, "Proxy error", {
          path: req.path,
          method: req.method,
          error: apiError,
        });
        res.status(500).json({
          error: "Failed to proxy request",
          message: apiError.message,
        });
      }
    }
  }
}

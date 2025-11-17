import { AxiosError } from "axios";

export class ApiError extends Error {
  statusCode?: number;
  body?: any;

  constructor(message: string, statusCode?: number, body?: any) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.body = body;
  }
}

export function wrapAxiosError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }

  if (error instanceof Error) {
    const axiosError = error as AxiosError;
    if (axiosError.response) {
      const statusCode = axiosError.response.status;
      const body = axiosError.response.data;
      const message =
        (body && typeof body === "object" && body.message
          ? body.message
          : null) ||
        axiosError.message ||
        `API request failed with status ${statusCode}`;

      return new ApiError(message, statusCode, body);
    }
    if (axiosError.request) {
      return new ApiError(
        "No response received from API",
        undefined,
        undefined
      );
    }
    return new ApiError(error.message, undefined, undefined);
  }
  return new ApiError("Unknown error occurred", undefined, undefined);
}


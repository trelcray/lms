import { NextFunction, Request, Response } from "express";
import { ApiError } from "../helpers/api-errors";

export const ErrorMiddleware = (
  err: Error & Partial<ApiError>,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const statusCode = err.statusCode ?? 500;
    const message = err.message ?? "Internal Server Error";

    return res.status(statusCode).json({ message });
  } catch (error) {
    next(error);
  }
};

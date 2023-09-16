import { NextFunction, Request, Response } from "express";
import { CatchAsyncError } from "./catchAsyncErrors";
import {
  BadRequestError,
  ForbiddenError,
  UnauthorizedError,
} from "../helpers/api-errors";
import jwt, { JwtPayload } from "jsonwebtoken";
import { redis } from "../database/redis";

export const isAuthenticated = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    const access_token = req.cookies.access_token as string;

    if (!access_token) {
      throw new UnauthorizedError("Please login to access this resource.");
    }

    const decoded = jwt.verify(
      access_token,
      process.env.ACCESS_TOKEN as string
    ) as JwtPayload;

    if (!decoded) {
      throw new BadRequestError("Access token is not valid!");
    }

    const user = await redis.get(decoded.id);

    if (!user) {
      throw new UnauthorizedError("Please login to access this resource.");
    }

    req.user = JSON.parse(user);

    next();
  }
);

export const authorizeRoles = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!roles.includes(req.user?.role || "")) {
      throw new ForbiddenError(
        `Role ${req.user?.role} is not allowed to access this resource!`
      );
    }
    next();
  };
};

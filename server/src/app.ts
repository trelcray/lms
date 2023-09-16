import "dotenv/config";
import express, { Request } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { ErrorMiddleware } from "./middleware/error";
import userRouter from "./routes/user.routes";
import { NotFoundError } from "./helpers/api-errors";
import courseRouter from "./routes/course.routes";
import orderRouter from "./routes/order.routes";
import notificationRouter from "./routes/notification.routes";
import analyticsRouter from "./routes/analytics.routes";
import layoutRouter from "./routes/layout.routes";

export const app = express();

app.use(express.json({ limit: "50mb" }));

app.use(cookieParser());

app.use(
  cors({
    origin: process.env.ORIGIN,
  })
);

app.use("/api/v1", userRouter);
app.use("/api/v1", courseRouter);
app.use("/api/v1", orderRouter);
app.use("/api/v1", notificationRouter);
app.use("/api/v1", analyticsRouter);
app.use("/api/v1", layoutRouter);

app.all("*", (req: Request) => {
  throw new NotFoundError(`Route ${req.originalUrl} not found`);
});

app.use(ErrorMiddleware);

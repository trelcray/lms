import { InternalServerError, NotFoundError } from "../helpers/api-errors";
import { CatchAsyncError } from "../middleware/catchAsyncErrors";
import NotificationModel from "../models/notification.model";
import { Request, Response } from "express";
import cron from "node-cron";

// get all notifications -- only admin
export const getNotifications = CatchAsyncError(
  async (req: Request, res: Response) => {
    try {
      const notifications = await NotificationModel.find().sort({
        createdAt: -1,
      });

      res.status(201).json({
        success: true,
        notifications,
      });
    } catch (error) {
      throw new InternalServerError((error as Error).message);
    }
  }
);

// update notifications status -- only admin
export const updateNotifications = CatchAsyncError(
  async (req: Request, res: Response) => {
    try {
      const notification = await NotificationModel.findById(req.params.id);

      if (!notification) {
        throw new NotFoundError("Notification not found!");
      }
      notification.status
        ? (notification.status = "read")
        : notification.status;

      await notification.save();

      const notifications = await NotificationModel.find().sort({
        createdAt: -1,
      });

      res.json({
        success: true,
        notifications,
      });
    } catch (error) {
      throw new InternalServerError((error as Error).message);
    }
  }
);

// delete notification -- only admin
cron.schedule("0 0 0 * * *", async () => {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  await NotificationModel.deleteMany({
    status: "read",
    createdAt: { $lt: thirtyDaysAgo },
  });
  console.log("Deleted read notifications");
});

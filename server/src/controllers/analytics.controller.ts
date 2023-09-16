import { Request, Response } from "express";
import { CatchAsyncError } from "../middleware/catchAsyncErrors";
import { InternalServerError } from "../helpers/api-errors";
import { generateLast12MonthsData } from "../utils/analytics.generator";
import userModel from "../models/user.model";
import CourseModel from "../models/course.model";
import OrderModel from "../models/order.model";

// get user analytics -- only admin
export const getUserAnalytics = CatchAsyncError(
  async (req: Request, res: Response) => {
    try {
      const users = await generateLast12MonthsData(userModel);

      res.json({
        success: true,
        users,
      });
    } catch (error) {
      throw new InternalServerError((error as Error).message);
    }
  }
);

// get course analytics -- only admin
export const getCourseAnalytics = CatchAsyncError(
  async (req: Request, res: Response) => {
    try {
      const courses = await generateLast12MonthsData(CourseModel);

      res.json({
        success: true,
        courses,
      });
    } catch (error) {
      throw new InternalServerError((error as Error).message);
    }
  }
);

// get course analytics -- only admin
export const getorderAnalytics = CatchAsyncError(
  async (req: Request, res: Response) => {
    try {
      const orders = await generateLast12MonthsData(OrderModel);

      res.json({
        success: true,
        orders,
      });
    } catch (error) {
      throw new InternalServerError((error as Error).message);
    }
  }
);

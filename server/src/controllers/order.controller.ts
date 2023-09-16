import { NextFunction, Request, Response } from "express";
import { CatchAsyncError } from "../middleware/catchAsyncErrors";
import { IOrder } from "../models/order.model";
import userModel from "../models/user.model";
import CourseModel from "../models/course.model";
import path from "path";
import ejs from "ejs";
import sendMail from "../utils/sendMail";
import NotificationModel from "../models/notification.model";
import {
  BadRequestError,
  InternalServerError,
  NotFoundError,
} from "../helpers/api-errors";
import { getAllOrdersService, newOrder } from "../services/order.service";

// create order
export const createOrder = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { courseId, payment_info }: IOrder = req.body;

      const user = await userModel.findById(req.user?._id);

      const courseExistsInUser = user?.courses.some(
        (course) => course._id.toString() === courseId
      );

      if (courseExistsInUser) {
        throw new BadRequestError("You have already purchased this course!");
      }

      const course = await CourseModel.findById(courseId);

      if (!course) {
        throw new NotFoundError("Course not found!");
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any = {
        courseId: course._id,
        userId: user?._id,
        payment_info,
      };

      const mailData = {
        order: {
          _id: course._id.toString().slice(0, 6),
          name: course.name,
          price: course.price,
          date: new Date().toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          }),
        },
      };
      await ejs.renderFile(
        path.join(__dirname, "../utils/order-confirmation.ejs"),
        { order: mailData }
      );

      try {
        if (user) {
          await sendMail({
            email: user.email,
            subject: "Order confirmation",
            template: "order-confirmation.ejs",
            data: mailData,
          });
        }
      } catch (error) {
        throw new InternalServerError((error as Error).message);
      }

      user?.courses.push(course._id);

      await user?.save();

      await NotificationModel.create({
        user: user?._id,
        title: "New Order",
        message: `You have a new order from ${course.name}`,
      });

      course.purchased ? (course.purchased += 1) : course.purchased;

      await course.save();

      newOrder(data, res, next);
    } catch (error) {
      throw new InternalServerError((error as Error).message);
    }
  }
);

// get all orders -- only for admin
export const getAllOrders = CatchAsyncError(
  async (req: Request, res: Response) => {
    try {
      getAllOrdersService(res);
    } catch (error) {
      throw new BadRequestError((error as Error).message);
    }
  }
);

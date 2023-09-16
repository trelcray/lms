import { Response } from "express";
import { CatchAsyncError } from "../middleware/catchAsyncErrors";
import OrderModel from "../models/order.model";

export const newOrder = CatchAsyncError(async (data: object, res: Response) => {
  const order = await OrderModel.create(data);

  res.status(201).json({
    success: true,
    order,
  });
});

// get all order
export const getAllOrdersService = async (res: Response) => {
  const orders = await OrderModel.find().sort({ creadtedAt: -1 });

  res.json({
    success: true,
    orders,
  });
};

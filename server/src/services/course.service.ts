import { Response } from "express";
import { CatchAsyncError } from "../middleware/catchAsyncErrors";
import CourseModel from "../models/course.model";

export const createCourse = CatchAsyncError(
  async (data: object, res: Response) => {
    const course = await CourseModel.create(data);
    res.status(201).json({
      success: true,
      course,
    });
  }
);

// get all courses
export const getAllCoursesService = async (res: Response) => {
  const courses = await CourseModel.find().sort({ creadtedAt: -1 });

  res.json({
    success: true,
    courses,
  });
};

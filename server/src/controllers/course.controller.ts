import { v2 as cloudinary } from "cloudinary";
import { CatchAsyncError } from "../middleware/catchAsyncErrors";
import { NextFunction, Request, Response } from "express";
import {
  BadRequestError,
  InternalServerError,
  NotFoundError,
  UnauthorizedError,
} from "../helpers/api-errors";
import { createCourse, getAllCoursesService } from "../services/course.service";
import CourseModel from "../models/course.model";
import { redis } from "../database/redis";
import mongoose from "mongoose";
import ejs from "ejs";
import path from "path";
import sendMail from "../utils/sendMail";
import NotificationModel from "../models/notification.model";

// upload course
export const uploadCourse = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = req.body;
      const thumbnail = data.thumbnail;

      if (thumbnail) {
        const myCloud = await cloudinary.uploader.upload(thumbnail, {
          folder: "courses",
        });

        data.thumbnail = {
          public_id: myCloud.public_id,
          url: myCloud.secure_url,
        };
      }

      createCourse(data, res, next);
    } catch (error) {
      throw new InternalServerError((error as Error).message);
    }
  }
);

// edit course
export const editCourse = CatchAsyncError(
  async (req: Request, res: Response) => {
    try {
      const data = req.body;
      const thumbnail = data.thumbnail;

      if (thumbnail) {
        await cloudinary.uploader.destroy(thumbnail.public_id);

        const myCloud = await cloudinary.uploader.upload(thumbnail, {
          folder: "courses",
        });

        data.thumbnail = {
          public_id: myCloud.public_id,
          url: myCloud.secure_url,
        };
      }

      const courseId = req.params.id;

      const course = await CourseModel.findByIdAndUpdate(
        courseId,
        {
          $set: data,
        },
        { new: true }
      );

      res.json({
        success: true,
        course,
      });
    } catch (error) {
      throw new InternalServerError((error as Error).message);
    }
  }
);

// get sigle course --- without purchasing
export const getSigleCourse = CatchAsyncError(
  async (req: Request, res: Response) => {
    try {
      const courseId = req.params.id;

      const isCacheExist = await redis.get(courseId);

      if (isCacheExist) {
        const course = JSON.parse(isCacheExist);
        res.json({
          success: true,
          course,
        });
      } else {
        const course = await CourseModel.findById(req.params.id).select(
          "-courseData.videoUrl -courseData.suggestion -courseData.questions -courseData.links"
        );

        await redis.set(courseId, JSON.stringify(course));

        res.json({
          success: true,
          course,
        });
      }
    } catch (error) {
      throw new InternalServerError((error as Error).message);
    }
  }
);

// get all course --- without purchasing
export const getAllCourse = CatchAsyncError(
  async (req: Request, res: Response) => {
    try {
      const isCacheExist = await redis.get("allCourses");
      if (isCacheExist) {
        const courses = JSON.parse(isCacheExist);
        res.json({
          success: true,
          courses,
        });
      } else {
        const courses = await CourseModel.find().select(
          "-courseData.videoUrl -courseData.suggestion -courseData.questions -courseData.links"
        );

        await redis.set("allCourses", JSON.stringify(courses), "EX", 604800); // 7days

        res.json({
          success: true,
          courses,
        });
      }
    } catch (error) {
      throw new InternalServerError((error as Error).message);
    }
  }
);

// get course content -- only for valid user
export const getCourseByUser = CatchAsyncError(
  async (req: Request, res: Response) => {
    try {
      const userCourseList = req.user?.courses;
      const courseId = req.params.id;

      const courseExists = userCourseList?.find(
        (course) => course?._id.toString() === courseId
      );

      if (!courseExists) {
        throw new UnauthorizedError(
          "You are not allowed to access this course!"
        );
      }

      const course = await CourseModel.findById(courseId);

      const content = course?.courseData;

      res.json({
        success: true,
        content,
      });
    } catch (error) {
      throw new InternalServerError((error as Error).message);
    }
  }
);

// add question in course
interface IAddQuestionData {
  question: string;
  courseId: string;
  contentId: string;
}

export const addQuestion = CatchAsyncError(
  async (req: Request, res: Response) => {
    try {
      const { contentId, courseId, question }: IAddQuestionData = req.body;
      const course = await CourseModel.findById(courseId);

      if (!mongoose.Types.ObjectId.isValid(contentId)) {
        throw new BadRequestError("Invalid content id");
      }

      const courseContent = course?.courseData.find((item) =>
        item._id.equals(contentId)
      );

      if (!courseContent) {
        throw new BadRequestError("Invalid content id");
      }

      // create na new question object
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const newQuestion: any = {
        user: req.user,
        question,
        questionReplies: [],
      };

      // add this question to our course content
      courseContent.questions.push(newQuestion);

      await NotificationModel.create({
        user: req.user?._id,
        title: "New Question Received",
        message: `You have a new question at ${courseContent.title}`,
      });

      // save the updated course
      await course?.save();

      res.json({
        success: true,
        course,
      });
    } catch (error) {
      throw new InternalServerError((error as Error).message);
    }
  }
);

// add answer in course question
interface IAddAnswerData {
  answer: string;
  courseId: string;
  contentId: string;
  questionId: string;
}

export const addAnswer = CatchAsyncError(
  async (req: Request, res: Response) => {
    try {
      const { answer, contentId, courseId, questionId }: IAddAnswerData =
        req.body;

      const course = await CourseModel.findById(courseId);

      if (!mongoose.Types.ObjectId.isValid(contentId)) {
        throw new BadRequestError("Invalid content id");
      }

      const courseContent = course?.courseData.find((item) =>
        item._id.equals(contentId)
      );

      const question = courseContent?.questions.find((item) =>
        item._id.equals(questionId)
      );

      if (!courseContent) {
        throw new BadRequestError("Invalid course content");
      }

      if (!question) {
        throw new BadRequestError("Invalid question id");
      }

      // create a new answer object
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const newAnswer: any = {
        user: req.user,
        answer,
      };

      // add this answer to our course content
      question.questionReplies?.push(newAnswer);

      await course?.save();

      if (req.user?._id === question.user._id) {
        await NotificationModel.create({
          user: req.user?._id,
          title: "New Question Reply Received",
          message: `You have a new question reply at ${courseContent.title}`,
        });
      } else {
        const data = {
          name: question.user.name,
          title: courseContent.title,
        };

        await ejs.renderFile(
          path.join(__dirname, "../utils/question-reply.ejs"),
          data
        );

        try {
          await sendMail({
            email: question.user.email,
            template: "question-reply.ejs",
            data,
          });
        } catch (error) {
          throw new InternalServerError((error as Error).message);
        }
      }

      res.json({
        success: true,
        course,
      });
    } catch (error) {
      throw new InternalServerError((error as Error).message);
    }
  }
);

// add review in course
interface IAddReviewData {
  review: string;
  courseId: string;
  rating: number;
  userId: string;
}

export const addReview = CatchAsyncError(
  async (req: Request, res: Response) => {
    try {
      const userCourseList = req.user?.courses;
      const courseId = req.params.id;

      const courseExists = userCourseList?.some(
        (course) => course._id.toString() === courseId
      );

      if (!courseExists) {
        throw new UnauthorizedError(
          "You are not allowed to access this course!"
        );
      }

      const course = await CourseModel.findById(courseId);

      const { rating, review } = req.body as IAddReviewData;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const reviewData: any = {
        user: req.user,
        comment: review,
        rating,
      };

      course?.reviews.push(reviewData);

      let avg = 0;

      course?.reviews.forEach((rev) => {
        avg += rev.rating;
      });

      if (course) {
        course.ratings = avg / course.reviews.length;
      }

      await course?.save();
      // create a notification
      /* const notification = {
        title: "New Review Received",
        message: `${req.user?.name} has given a review in ${course?.name}`,
      }; */

      res.json({
        success: true,
        course,
      });
    } catch (error) {
      throw new InternalServerError((error as Error).message);
    }
  }
);

// add reply in review
interface IAddReviewData {
  comment: string;
  courseId: string;
  reviewId: string;
}

export const addReplyToReview = CatchAsyncError(
  async (req: Request, res: Response) => {
    try {
      const { comment, courseId, reviewId }: IAddReviewData = req.body;

      const course = await CourseModel.findById(courseId);

      if (!course) {
        throw new BadRequestError("Course not found!");
      }

      const review = course.reviews.find(
        (rev) => rev._id.toString() === reviewId
      );

      if (!review) {
        throw new BadRequestError("Review not found!");
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const replyData: any = {
        user: req.user,
        comment,
      };

      if (!review.commentReplies) {
        review.commentReplies = [];
      }

      review.commentReplies.push(replyData);

      await course.save();

      res.json({
        success: true,
        course,
      });
    } catch (error) {
      throw new InternalServerError((error as Error).message);
    }
  }
);

// get all courses -- only for admin
export const getAllCourses = CatchAsyncError(
  async (req: Request, res: Response) => {
    try {
      getAllCoursesService(res);
    } catch (error) {
      throw new BadRequestError((error as Error).message);
    }
  }
);

// delete course -- only for admin
export const deleteCourse = CatchAsyncError(
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const course = await CourseModel.findById(id);

      if (!course) {
        throw new NotFoundError("User not found!");
      }

      await course.deleteOne({ id });

      await redis.del(id);

      res.json({
        success: true,
        message: "Course deleted successfully",
      });
    } catch (error) {
      throw new BadRequestError((error as Error).message);
    }
  }
);

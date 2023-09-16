import { Request, Response } from "express";
import { CatchAsyncError } from "../middleware/catchAsyncErrors";
import { BadRequestError, InternalServerError } from "../helpers/api-errors";
import LayoutModel, { ICategory, IFaqItem } from "../models/layout.model";
import { v2 as cloudinary } from "cloudinary";

// create layout
export const createLayout = CatchAsyncError(
  async (req: Request, res: Response) => {
    try {
      const { type } = req.body;
      const isTypeExists = await LayoutModel.findOne({ type });
      if (isTypeExists) {
        throw new BadRequestError(`${type} already exists!`);
      }

      if (type === "Banner") {
        const { image, title, subTitle } = req.body;
        const myCloud = await cloudinary.uploader.upload(image, {
          folder: "layout",
        });
        const banner = {
          image: {
            public_id: myCloud.public_id,
            url: myCloud.secure_url,
          },
          title,
          subTitle,
        };
        await LayoutModel.create(banner);
      }

      if (type === "FAQ") {
        const { faq } = req.body;
        const faqItems = await Promise.all(
          faq.map(async (item: IFaqItem) => {
            return {
              question: item.question,
              answer: item.answer,
            };
          })
        );
        await LayoutModel.create({ type: "FAQ", faq: faqItems });
      }
      if (type === "Categories") {
        const { categories } = req.body;
        const categoriesItems = await Promise.all(
          categories.map(async (item: ICategory) => {
            return {
              title: item.title,
            };
          })
        );
        await LayoutModel.create({
          type: "Categories",
          categories: categoriesItems,
        });
      }

      res.status(201).json({
        success: true,
        message: "Layout created successfully",
      });
    } catch (error) {
      throw new InternalServerError((error as Error).message);
    }
  }
);

// edit layout
interface IBannerData {
  id: string;
  image: {
    public_id: string;
  };
}
export const updateLayout = CatchAsyncError(
  async (req: Request, res: Response) => {
    try {
      const { type } = req.body;

      if (type === "Banner") {
        const bannerData: IBannerData | null = await LayoutModel.findOne({
          type: "Banner",
        });
        const { image, title, subTitle } = req.body;

        if (bannerData) {
          await cloudinary.uploader.destroy(bannerData.image.public_id);
        }

        const myCloud = await cloudinary.uploader.upload(image, {
          folder: "layout",
        });

        const banner = {
          image: {
            public_id: myCloud.public_id,
            url: myCloud.secure_url,
          },
          title,
          subTitle,
        };
        await LayoutModel.findByIdAndUpdate(bannerData?.id, { banner });
      }

      if (type === "FAQ") {
        const { faq } = req.body;

        const faqItem = await LayoutModel.findOne({ type: "FAQ" });

        const faqItems = await Promise.all(
          faq.map(async (item: IFaqItem) => {
            return {
              question: item.question,
              answer: item.answer,
            };
          })
        );
        await LayoutModel.findByIdAndUpdate(faqItem?._id, {
          type: "FAQ",
          faq: faqItems,
        });
      }
      if (type === "Categories") {
        const { categories } = req.body;

        const categoriesData = await LayoutModel.findOne({
          type: "Categories",
        });

        const categoriesItems = await Promise.all(
          categories.map(async (item: ICategory) => {
            return {
              title: item.title,
            };
          })
        );
        await LayoutModel.create(categoriesData?._id, {
          type: "Categories",
          categories: categoriesItems,
        });
      }

      res.status(201).json({
        success: true,
        message: "Layout updated successfully",
      });
    } catch (error) {
      throw new InternalServerError((error as Error).message);
    }
  }
);

// get layout by type
export const getLayoutByType = CatchAsyncError(
  async (req: Request, res: Response) => {
    try {
      const { type } = req.body;
      const layout = await LayoutModel.findOne({ type });

      res.json({
        success: true,
        layout,
      });
    } catch (error) {
      throw new InternalServerError((error as Error).message);
    }
  }
);

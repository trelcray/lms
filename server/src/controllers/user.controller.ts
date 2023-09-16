import { Request, Response } from "express";
import { CatchAsyncError } from "../middleware/catchAsyncErrors";
import userModel from "../models/user.model";
import jwt, { JwtPayload, Secret } from "jsonwebtoken";
import ejs from "ejs";
import path from "path";
import sendMail from "../utils/sendMail";
import { BadRequestError, NotFoundError } from "../helpers/api-errors";
import { IUserSchema } from "../models/user.model";
import {
  accessTokenOptions,
  refreshTokenOptions,
  sendToken,
} from "../utils/jwt";
import { redis } from "../database/redis";
import {
  getAllUsersService,
  getUserById,
  updateUserRoleService,
} from "../services/user.service";
import { v2 as cloudinary } from "cloudinary";

interface IRegistrationBody {
  name: string;
  email: string;
  password: string;
  avatar?: string;
}

export const registrationUser = CatchAsyncError(
  async (req: Request, res: Response) => {
    try {
      const { name, email, password } = req.body;

      const isEmailExist = await userModel.findOne({ email });

      if (isEmailExist) {
        throw new BadRequestError("Email already exists.");
      }

      const user: IRegistrationBody = {
        name,
        email,
        password,
      };

      const activationToken = createActivationToken(user);
      const activationCode = activationToken.activationCode;
      const data = { user: { name: user.name }, activationCode };
      await ejs.renderFile(
        path.join(__dirname, "../utils/activation-mail.ejs"),
        data
      );

      try {
        await sendMail({
          email: user.email,
          subject: "Activate your account",
          template: "activation-mail.ejs",
          data,
        });

        res.status(201).json({
          success: true,
          message: `Please check your email: ${user.email} to activate your account.`,
          activationToken: activationToken.token,
        });
      } catch (error) {
        throw new BadRequestError((error as Error).message);
      }
    } catch (error) {
      throw new BadRequestError((error as Error).message);
    }
  }
);

interface IActivationToken {
  token: string;
  activationCode: string;
}

export const createActivationToken = (
  user: IRegistrationBody
): IActivationToken => {
  const activationCode = Math.floor(1000 + Math.random() * 9000).toString();

  const token = jwt.sign(
    {
      user,
      activationCode,
    },
    process.env.ACTIVATION_SECRET as Secret,
    {
      expiresIn: "1m",
    }
  );

  return { token, activationCode };
};

interface IActivationRequest {
  activation_code: string;
  activation_token: string;
}

export const activateUser = CatchAsyncError(
  async (req: Request, res: Response) => {
    try {
      const { activation_code, activation_token } =
        req.body as IActivationRequest;

      const newUser: { user: IUserSchema; activationCode: string } = jwt.verify(
        activation_token,
        process.env.ACTIVATION_SECRET as string
      ) as { user: IUserSchema; activationCode: string };

      if (newUser.activationCode !== activation_code) {
        throw new BadRequestError("Invalid activation code!");
      }

      const { name, email, password } = newUser.user;

      const existUser = await userModel.findOne({ email });

      if (existUser) {
        throw new BadRequestError("User already exists!");
      }

      await userModel.create({ name, email, password });

      res.status(201).json({
        success: true,
      });
    } catch (error) {
      throw new BadRequestError((error as Error).message);
    }
  }
);

// login user

interface ILoginRequest {
  email: string;
  password: string;
}

export const loginUser = CatchAsyncError(
  async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body as ILoginRequest;

      if (!email || !password) {
        throw new BadRequestError("Please enter a valid email and password");
      }

      const user = await userModel.findOne({ email }).select("+password");

      if (!user) {
        throw new BadRequestError("Invalid username or password");
      }

      const isPasswordMatch = await user.comparePassword(password);

      if (!isPasswordMatch) {
        throw new BadRequestError("Invalid username or password");
      }

      sendToken(user, 201, res);
    } catch (error) {
      throw new BadRequestError((error as Error).message);
    }
  }
);

// logout user
export const logoutUser = CatchAsyncError(
  async (req: Request, res: Response) => {
    try {
      res.cookie("refresh_token", "", { maxAge: 1 });
      res.cookie("access_token", "", { maxAge: 1 });
      const userId = req.user?._id ?? "";

      redis.del(userId);

      res.json({
        success: true,
        message: "Logged out successfully",
      });
    } catch (error) {
      throw new BadRequestError((error as Error).message);
    }
  }
);

// update access token
export const updateAccessToken = CatchAsyncError(
  async (req: Request, res: Response) => {
    try {
      const refresh_token = req.cookies.refresh_token as string;
      const decoded = jwt.verify(
        refresh_token,
        process.env.REFRESH_TOKEN as string
      ) as JwtPayload;

      if (!decoded) {
        throw new BadRequestError("Couldn't refresh token");
      }

      const session = await redis.get(decoded.id as string);

      if (!session) {
        throw new BadRequestError("Please login for access this resource!");
      }

      const user = JSON.parse(session);

      const accessToken = jwt.sign(
        { id: user._id },
        process.env.ACCESS_TOKEN as string,
        {
          expiresIn: "5m",
        }
      );

      const refreshToken = jwt.sign(
        { id: user._id },
        process.env.REFRESH_TOKEN as string,
        {
          expiresIn: "3d",
        }
      );

      req.user = user;

      res.cookie("access_token", accessToken, accessTokenOptions);
      res.cookie("refresh_token", refreshToken, refreshTokenOptions);

      await redis.set(user._id, JSON.stringify(user), "EX", 604800); // 7 days

      res.json({
        status: "success",
        accessToken,
      });
    } catch (error) {
      throw new BadRequestError((error as Error).message);
    }
  }
);

// get user info
export const getUserInfo = CatchAsyncError(
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?._id;
      getUserById(userId, res);
    } catch (error) {
      throw new BadRequestError((error as Error).message);
    }
  }
);

// social auth
interface ISocialAuthBody {
  email: string;
  name: string;
  avatar: string;
}

export const socialAuth = CatchAsyncError(
  async (req: Request, res: Response) => {
    try {
      const { email, name, avatar } = req.body as ISocialAuthBody;
      const user = await userModel.findOne({ email });
      if (!user) {
        const newUser = await userModel.create({ email, name, avatar });
        sendToken(newUser, 201, res);
      } else {
        sendToken(user, 200, res);
      }
    } catch (error) {
      throw new BadRequestError((error as Error).message);
    }
  }
);

// update user info
interface IUpdateUserInfo {
  name?: string;
  email?: string;
}

export const updateUserInfo = CatchAsyncError(
  async (req: Request, res: Response) => {
    try {
      const { name, email } = req.body as IUpdateUserInfo;
      const userId = req.user?._id;
      const user = await userModel.findById(userId);

      if (email && user) {
        const isEmailExist = await userModel.findOne({ email });
        if (isEmailExist) {
          throw new BadRequestError("Email already exists!");
        }
        user.email = email;
      }

      if (name && user) {
        user.name = name;
      }

      await user?.save();

      await redis.set(userId, JSON.stringify(user));

      res.status(201).json({
        success: true,
        user,
      });
    } catch (error) {
      throw new BadRequestError((error as Error).message);
    }
  }
);

// update user password
interface IUpdatePasswordBody {
  oldPassword: string;
  newPassword: string;
}

export const updatePassword = CatchAsyncError(
  async (req: Request, res: Response) => {
    try {
      const { oldPassword, newPassword } = req.body as IUpdatePasswordBody;

      if (!oldPassword || !newPassword) {
        throw new BadRequestError(
          "Please enter a old password and new password."
        );
      }
      const userId = req.user?._id;
      const user = await userModel.findById(userId).select("+password");

      if (!user?.password) {
        throw new BadRequestError("Invalid user!");
      }

      const isPasswordMatch = await user?.comparePassword(oldPassword);

      if (!isPasswordMatch) {
        throw new BadRequestError("Invalid old password!");
      }

      user.password = newPassword;

      await user.save();
      await redis.set(userId, JSON.stringify(user));

      res.status(201).json({
        success: true,
        user,
      });
    } catch (error) {
      throw new BadRequestError((error as Error).message);
    }
  }
);

// update profile picture

interface IUpdateProfilePictureBody {
  avatar: string;
}

export const updateProfilePicture = CatchAsyncError(
  async (req: Request, res: Response) => {
    try {
      const { avatar } = req.body as IUpdateProfilePictureBody;

      const userId = req.user?._id;

      const user = await userModel.findById(userId);

      if (user && avatar) {
        if (user?.avatar.public_id) {
          await cloudinary.uploader.destroy(user.avatar.public_id);

          const myCloud = await cloudinary.uploader.upload(avatar, {
            folder: "avatars",
            width: 150,
          });
          user.avatar = {
            public_id: myCloud.public_id,
            url: myCloud.secure_url,
          };
        } else {
          const myCloud = await cloudinary.uploader.upload(avatar, {
            folder: "avatars",
            width: 150,
          });
          user.avatar = {
            public_id: myCloud.public_id,
            url: myCloud.secure_url,
          };
        }
      }

      await user?.save();
      await redis.set(userId, JSON.stringify(user));

      res.json({
        success: true,
        user,
      });
    } catch (error) {
      throw new BadRequestError((error as Error).message);
    }
  }
);

// get all users -- only for admin
export const getAllUsers = CatchAsyncError(
  async (req: Request, res: Response) => {
    try {
      getAllUsersService(res);
    } catch (error) {
      throw new BadRequestError((error as Error).message);
    }
  }
);

// update user role -- only for admin
export const updateUserRole = CatchAsyncError(
  async (req: Request, res: Response) => {
    try {
      const { id, role } = req.body;
      updateUserRoleService(res, id, role);
    } catch (error) {
      throw new BadRequestError((error as Error).message);
    }
  }
);

// delete user -- only for admin
export const deleteUser = CatchAsyncError(
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const user = await userModel.findById(id);

      if (!user) {
        throw new NotFoundError("User not found!");
      }

      await user.deleteOne({ id });

      await redis.del(id);

      res.json({
        success: true,
        message: "User deleted successfully",
      });
    } catch (error) {
      throw new BadRequestError((error as Error).message);
    }
  }
);

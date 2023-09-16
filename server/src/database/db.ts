import mongoose from "mongoose";

const dbURL: string = process.env.DB_URL || "";

const connectDB = async () => {
  try {
    await mongoose.connect(dbURL).then((data: any) => {
      console.log(`Database connected with ${data.connection.host}`);
    });
  } catch (error) {
    console.log((error as Error).message);
    setTimeout(connectDB, 5000);
  }
};

export default connectDB;

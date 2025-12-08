import mongoose from "mongoose";

export const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
      throw new Error("MONGO_URI is not defined in environment variables");
    }
    await mongoose.connect(mongoUri);
    console.log("[Database] Connected to MongoDB");
  } catch (err) {
    console.error("[Database] Error:", err.message);
    process.exit(1);
  }
};


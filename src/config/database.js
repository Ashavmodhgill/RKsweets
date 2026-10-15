import mongoose from "mongoose";
import { env } from "./env.js";

export const connect = async () => {
    await mongoose.connect(env.mongodbUri);
};
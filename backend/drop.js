import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

async function dropDatabase() {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("Connected to MongoDB.");

    await mongoose.connection.dropDatabase();
    console.log("Database dropped successfully!");

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error("Error dropping database:", err);
    process.exit(1);
  }
}

dropDatabase();
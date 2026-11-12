
import mongoose from "mongoose";
import { getMongoUri } from "../config/env.js";

// The application database. The configured URI has no database name in its
// path, so this was previously MongoDB's default ("test"); it is now explicit.
// dbName takes precedence over any database name in the URI.
export const DB_NAME = "test";

export const Connection = async () => {
    const URL = getMongoUri();

    try {
        await mongoose.connect(URL, { dbName: DB_NAME });

        console.log("Database connected successfully!!!");
    } catch (error) {
        // Avoid logging the connection string or database credentials.
        console.error(
            "Error while connecting with the database:",
            error.name
        );

        throw error;
    }
};

export default Connection;

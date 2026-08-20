const { PrismaClient } = require("@prisma/client");
// const pkg = require("pg");
// const dotenv = require("dotenv");
// dotenv.config();
// const { Pool } = pkg;
// Prisma Client
const prisma = new PrismaClient({
    log:
        process.env.NODE_ENV === "development" ? ["info", "warn", "error"] : ["error"],
});

const connectDB = async () => {
    try {
        await prisma.$connect();
        console.log("Connected to Database");
    } catch (error) {
        console.error(`Error connecting to Database: ${error.message}`);
        process.exit(1);
    }
};

const disconnectDB = async () => {
    try {
        await prisma.$disconnect();
        console.log("Disconnected from Database");
    } catch (error) {
        console.error(`Error disconnecting from Database: ${error.message}`);
    }
};

// Pool Client
// const pool=new Pool({
//     user: process.env.DB_USER,
//     host: process.env.DB_HOST,
//     database: process.env.DB_DATABASE,
//     password: process.env.DB_PASSWORD,
//     port: process.env.DB_PORT
// });

// pool.on("connect", () =>{
//     console.log("Connection pool established with Database");
// });

module.exports = {  prisma, connectDB, disconnectDB };
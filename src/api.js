const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const pool = require("./config/db");
const errorHandling = require("./middlewares/errorHandler");
const app_routing = require("./routes/api_routing");
const { connectDB, disconnectDB } = require("./config/db");

dotenv.config();

// Connect to Database
connectDB();

const app = express();
const port = process.env.PORT || 3001;

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// Routes
app.use("/api", app_routing);

// Error handling Middleware
app.use(errorHandling);

// createUserTable();

app.get("/", async (req, res) => {
    console.log("start");
    const result = await pool.query("SELECT current_database()");
    console.log("end");

    res.send(
        `The database name is : ${result.rows[0].current_database}`
    );
});

// Disconnect from Database
process.on("unhandledRejection", async (err) => {
    console.error(`Unhandled rejection: ${err.message}`);
    server.close(async () => {
        console.log("Server is shutting down");
        await disconnectDB();
        process.exit(1);
    });
});

process.on("uncaughtException", async (err) => {
    console.error(`Uncaught exception: ${err.message}`);
    server.close(async () => {
        console.log("Server is shutting down");
        await disconnectDB();
        process.exit(1);
    });
});

process.on("SIGINT", async (err) => {
    console.error(`SIGINT: ${err.message}`);
    server.close(async () => {
        console.log("Server is shutting down");
        await disconnectDB();
        process.exit(0);
    });
});

process.on("SIGTERM", async (err) => {
    console.error(`SIGTERM: ${err.message}`);
    server.close(async () => {
        console.log("Server is shutting down");
        await disconnectDB();
        process.exit(0);
    });
});

const server = app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
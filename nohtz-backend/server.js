import express from "express";
import mysql from "mysql2/promise";
import {startupServices} from "./services.js";

import path from "path";

const app = express();
app.use(express.json());
app.use(express.static("../nohtz-frontend"));

// CORS middleware
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "http://localhost:3000");
    res.header("Access-Control-Allow-Credentials", "true");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") {
        return res.sendStatus(200);
    }
    next();
});

//DB Connection
const db = await mysql.createConnection({
host: "localhost",
user: "root",
password: "Logman718",
database: "notes_app",
});

//Services
startupServices(app, db);

//Server Start Message
app.listen(3000, () => console.log("Server running on http://localhost:3000"));

// Routes
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname + "/../nohtz-frontend/index.html"));
});

app.get("/app.html", (req, res) => {
    res.sendFile(path.join(__dirname + "/../nohtz-frontend/app.html"));
});
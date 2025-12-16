import express from "express";
import mysql from "mysql2/promise";
import {startupServices} from "./services.js";

import path from "path";

const app = express();
app.use(express.json());
app.use(express.static("../nohtz-frontend"));

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

//Test
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname + "/../nohtz-frontend/index.html"));
});
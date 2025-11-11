import express from "express";
import mysql from "mysql2/promise";
import {setupServices} from "./services.js";


const app = express();
app.use(express.json());

//DB Connection
const db = await mysql.createConnection({
host: "localhost",
user: "root",
password: "Logman718",
database: "notes_app",
});

//Test
app.get("/", (req, res) => {
    res.send("Backend is running");
});

//Example Route
setupServices(app, db);

//Server Start Message
app.listen(3000, () => console.log("Server running on http://localhost:3000"));
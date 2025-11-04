import express from "express";
import mysql from "mysql2/promise";


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
app.get("/users", async (req, res) => {
    const {rows} = await db.query("SELECT * FROM users");
    res.json(rows);
});

//Server Start Message
app.listen(3000, () => console.log("Server running on http://localhost:3000"));
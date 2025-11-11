export function startupServices(app, db) {

    app.get("/users", async (req, res) => {
        try {
            const [rows] = await db.query("SELECT * FROM users");
            res.json(rows);
        } catch (error) {
            console.error("Database query failed:", error);
            res.status(500).json({error: "Internal Server Error"});
        }
    });

}
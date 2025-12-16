import bcrypt from "bcrypt";
import session from "express-session";

export function startupServices(app, db) {
    // Session middleware
    app.use(session({
        secret: "nohtz-secret-key-change-in-production",
        resave: false,
        saveUninitialized: false,
        cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24 hours
    }));

    // Middleware to check if user is authenticated
    const requireAuth = (req, res, next) => {
        if (req.session.userId) {
            next();
        } else {
            res.status(401).json({ error: "Unauthorized" });
        }
    };

    // ========== AUTHENTICATION ENDPOINTS ==========

    // Register new user
    app.post("/api/register", async (req, res) => {
        try {
            const { username, password } = req.body;
            
            if (!username || !password) {
                return res.status(400).json({ error: "Username and password are required" });
            }

            // Check if username already exists
            const [existing] = await db.query("SELECT id FROM users WHERE username = ?", [username]);
            if (existing.length > 0) {
                return res.status(400).json({ error: "Username already exists" });
            }

            // Hash password
            const hashedPassword = await bcrypt.hash(password, 10);

            // Insert user
            const [result] = await db.query(
                "INSERT INTO users (username, password) VALUES (?, ?)",
                [username, hashedPassword]
            );

            // Auto-login after registration
            req.session.userId = result.insertId;
            req.session.username = username;

            res.json({ 
                success: true, 
                userId: result.insertId,
                username: username 
            });
        } catch (error) {
            console.error("Registration error:", error);
            res.status(500).json({ error: "Internal Server Error" });
        }
    });

    // Login
    app.post("/api/login", async (req, res) => {
        try {
            const { username, password } = req.body;
            
            if (!username || !password) {
                return res.status(400).json({ error: "Username and password are required" });
            }

            // Find user
            const [users] = await db.query("SELECT * FROM users WHERE username = ?", [username]);
            if (users.length === 0) {
                return res.status(401).json({ error: "Invalid credentials" });
            }

            const user = users[0];

            // Verify password
            const validPassword = await bcrypt.compare(password, user.password);
            if (!validPassword) {
                return res.status(401).json({ error: "Invalid credentials" });
            }

            // Set session
            req.session.userId = user.id;
            req.session.username = user.username;

            res.json({ 
                success: true, 
                userId: user.id,
                username: user.username 
            });
        } catch (error) {
            console.error("Login error:", error);
            res.status(500).json({ error: "Internal Server Error" });
        }
    });

    // Logout
    app.post("/api/logout", (req, res) => {
        req.session.destroy();
        res.json({ success: true });
    });

    // Check if user is logged in
    app.get("/api/me", (req, res) => {
        if (req.session.userId) {
            res.json({ 
                userId: req.session.userId,
                username: req.session.username 
            });
        } else {
            res.status(401).json({ error: "Not authenticated" });
        }
    });

    // ========== FOLDER ENDPOINTS ==========

    // Get all folders for user
    app.get("/api/folders", requireAuth, async (req, res) => {
        try {
            const [folders] = await db.query(
                "SELECT * FROM folders WHERE user_id = ? ORDER BY created_at ASC",
                [req.session.userId]
            );
            res.json(folders);
        } catch (error) {
            console.error("Get folders error:", error);
            res.status(500).json({ error: "Internal Server Error" });
        }
    });

    // Create folder
    app.post("/api/folders", requireAuth, async (req, res) => {
        try {
            const { name } = req.body;
            const folderName = name || "New Folder";

            const [result] = await db.query(
                "INSERT INTO folders (user_id, name) VALUES (?, ?)",
                [req.session.userId, folderName]
            );

            const [folder] = await db.query("SELECT * FROM folders WHERE id = ?", [result.insertId]);
            res.json(folder[0]);
        } catch (error) {
            console.error("Create folder error:", error);
            res.status(500).json({ error: "Internal Server Error" });
        }
    });

    // Delete folder
    app.delete("/api/folders/:id", requireAuth, async (req, res) => {
        try {
            const folderId = parseInt(req.params.id);

            // Verify folder belongs to user
            const [folders] = await db.query(
                "SELECT id FROM folders WHERE id = ? AND user_id = ?",
                [folderId, req.session.userId]
            );

            if (folders.length === 0) {
                return res.status(404).json({ error: "Folder not found" });
            }

            await db.query("DELETE FROM folders WHERE id = ?", [folderId]);
            res.json({ success: true });
        } catch (error) {
            console.error("Delete folder error:", error);
            res.status(500).json({ error: "Internal Server Error" });
        }
    });

    // ========== NOTE ENDPOINTS ==========

    // Get all notes for user (optionally filtered by folder)
    app.get("/api/notes", requireAuth, async (req, res) => {
        try {
            const folderId = req.query.folderId;
            let query = "SELECT * FROM notes WHERE user_id = ?";
            let params = [req.session.userId];

            if (folderId && folderId !== "null") {
                query += " AND folder_id = ?";
                params.push(parseInt(folderId));
            } else if (folderId === "null") {
                query += " AND folder_id IS NULL";
            }

            query += " ORDER BY updated_at DESC";

            const [notes] = await db.query(query, params);
            res.json(notes);
        } catch (error) {
            console.error("Get notes error:", error);
            res.status(500).json({ error: "Internal Server Error" });
        }
    });

    // Get single note
    app.get("/api/notes/:id", requireAuth, async (req, res) => {
        try {
            const noteId = parseInt(req.params.id);
            const [notes] = await db.query(
                "SELECT * FROM notes WHERE id = ? AND user_id = ?",
                [noteId, req.session.userId]
            );

            if (notes.length === 0) {
                return res.status(404).json({ error: "Note not found" });
            }

            res.json(notes[0]);
        } catch (error) {
            console.error("Get note error:", error);
            res.status(500).json({ error: "Internal Server Error" });
        }
    });

    // Create note
    app.post("/api/notes", requireAuth, async (req, res) => {
        try {
            const { title, folderId } = req.body;
            const noteTitle = title || "Untitled Note";
            const folder = folderId && folderId !== "null" ? parseInt(folderId) : null;

            // Verify folder belongs to user if provided
            if (folder) {
                const [folders] = await db.query(
                    "SELECT id FROM folders WHERE id = ? AND user_id = ?",
                    [folder, req.session.userId]
                );
                if (folders.length === 0) {
                    return res.status(404).json({ error: "Folder not found" });
                }
            }

            const [result] = await db.query(
                "INSERT INTO notes (user_id, folder_id, title, content) VALUES (?, ?, ?, ?)",
                [req.session.userId, folder, noteTitle, ""]
            );

            const [note] = await db.query("SELECT * FROM notes WHERE id = ?", [result.insertId]);
            res.json(note[0]);
        } catch (error) {
            console.error("Create note error:", error);
            res.status(500).json({ error: "Internal Server Error" });
        }
    });

    // Update note (save content, rename, or move)
    app.put("/api/notes/:id", requireAuth, async (req, res) => {
        try {
            const noteId = parseInt(req.params.id);
            const { title, content, folderId } = req.body;

            // Verify note belongs to user
            const [notes] = await db.query(
                "SELECT * FROM notes WHERE id = ? AND user_id = ?",
                [noteId, req.session.userId]
            );

            if (notes.length === 0) {
                return res.status(404).json({ error: "Note not found" });
            }

            // Build update query dynamically
            const updates = [];
            const params = [];

            if (title !== undefined) {
                updates.push("title = ?");
                params.push(title);
            }
            if (content !== undefined) {
                updates.push("content = ?");
                params.push(content);
            }
            if (folderId !== undefined) {
                const folder = folderId && folderId !== "null" ? parseInt(folderId) : null;
                
                // Verify folder belongs to user if provided
                if (folder) {
                    const [folders] = await db.query(
                        "SELECT id FROM folders WHERE id = ? AND user_id = ?",
                        [folder, req.session.userId]
                    );
                    if (folders.length === 0) {
                        return res.status(404).json({ error: "Folder not found" });
                    }
                }
                
                updates.push("folder_id = ?");
                params.push(folder);
            }

            if (updates.length === 0) {
                return res.status(400).json({ error: "No fields to update" });
            }

            params.push(noteId);
            await db.query(
                `UPDATE notes SET ${updates.join(", ")} WHERE id = ?`,
                params
            );

            const [updatedNote] = await db.query("SELECT * FROM notes WHERE id = ?", [noteId]);
            res.json(updatedNote[0]);
        } catch (error) {
            console.error("Update note error:", error);
            res.status(500).json({ error: "Internal Server Error" });
        }
    });

    // Delete note
    app.delete("/api/notes/:id", requireAuth, async (req, res) => {
        try {
            const noteId = parseInt(req.params.id);

            // Verify note belongs to user
            const [notes] = await db.query(
                "SELECT id FROM notes WHERE id = ? AND user_id = ?",
                [noteId, req.session.userId]
            );

            if (notes.length === 0) {
                return res.status(404).json({ error: "Note not found" });
            }

            await db.query("DELETE FROM notes WHERE id = ?", [noteId]);
            res.json({ success: true });
        } catch (error) {
            console.error("Delete note error:", error);
            res.status(500).json({ error: "Internal Server Error" });
        }
    });

    // Legacy endpoint (keeping for compatibility)
    app.get("/users", async (req, res) => {
        try {
            const [rows] = await db.query("SELECT * FROM users");
            res.json(rows);
        } catch (error) {
            console.error("Database query failed:", error);
            res.status(500).json({ error: "Internal Server Error" });
        }
    });
}

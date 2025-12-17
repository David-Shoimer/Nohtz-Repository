import bcrypt from "bcrypt";
import session from "express-session";

// Helper function to query notes by ID, trying different possible column names
async function queryNoteById(db, noteId, userId = null) {
    if (!noteId || isNaN(noteId)) {
        return null;
    }
    
    const possibleIdColumns = ['id', 'note_id', 'ID', 'NOTE_ID'];
    const userIdCondition = userId ? ' AND user_id = ?' : '';
    const params = userId ? [noteId, userId] : [noteId];
    
    for (const colName of possibleIdColumns) {
        try {
            const [notes] = await db.query(
                `SELECT * FROM notes WHERE ${colName} = ?${userIdCondition}`,
                params
            );
            if (notes.length > 0) {
                return notes[0];
            }
        } catch (err) {
            // Column doesn't exist or other error - try next one
            // Only continue if it's a "column doesn't exist" error
            if (err.code === 'ER_BAD_FIELD_ERROR') {
                continue;
            }
            // For other errors, log and return null
            console.error(`Error querying note by ${colName}:`, err.message);
            return null;
        }
    }
    return null;
}

// Helper function to delete note by ID, trying different possible column names
async function deleteNoteById(db, noteId, userId) {
    if (!noteId || isNaN(noteId)) {
        throw new Error("Invalid note ID");
    }
    
    const possibleIdColumns = ['id', 'note_id', 'ID', 'NOTE_ID'];
    
    for (const colName of possibleIdColumns) {
        try {
            const [result] = await db.query(
                `DELETE FROM notes WHERE ${colName} = ? AND user_id = ?`,
                [noteId, userId]
            );
            if (result.affectedRows > 0) {
                return true;
            }
        } catch (err) {
            // Column doesn't exist, try next one
            continue;
        }
    }
    return false;
}

// Helper function to update note by ID, trying different possible column names
async function updateNoteById(db, noteId, userId, updates, params) {
    if (!noteId || isNaN(noteId)) {
        throw new Error("Invalid note ID");
    }
    
    const possibleIdColumns = ['id', 'note_id', 'ID', 'NOTE_ID'];
    
    for (const colName of possibleIdColumns) {
        try {
            await db.query(
                `UPDATE notes SET ${updates.join(", ")} WHERE ${colName} = ? AND user_id = ?`,
                [...params, noteId, userId]
            );
            return true;
        } catch (err) {
            // Column doesn't exist, try next one
            continue;
        }
    }
    return false;
}

export function startupServices(app, db) {
    app.use(session({
        secret: "nohtz-secret-key-change-in-production",
        resave: false,
        saveUninitialized: false,
        cookie: { 
            secure: false, 
            maxAge: 24 * 60 * 60 * 1000, // 24 hours
            httpOnly: true,
            sameSite: 'lax'
        }
    }));

    const requireAuth = (req, res, next) => {
        if (req.session.userId) {
            next();
        } else {
            res.status(401).json({ error: "Unauthorized" });
        }
    };

    app.post("/api/register", async (req, res) => {
        try {
            const { username, password } = req.body;
            
            if (!username || !password) {
                return res.status(400).json({ error: "Username and password are required" });
            }

            // Check if username already exists
            const [existing] = await db.query("SELECT 1 FROM users WHERE username = ?", [username]);
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

            // Check if user has an id field (handle different column names)
            const userId = user.id || user.user_id || user.ID || user.USER_ID;
            if (!userId) {
                console.error("User object missing id field:", Object.keys(user));
                return res.status(500).json({ error: "Database error: user table missing id column" });
            }

            // Set session
            req.session.userId = userId;
            req.session.username = user.username;

            console.log("Session set - userId:", req.session.userId, "username:", req.session.username);

            res.json({ 
                success: true, 
                userId: userId,
                username: user.username 
            });
        } catch (error) {
            console.error("Login error:", error);
            res.status(500).json({ error: "Internal Server Error" });
        }
    });

    app.post("/api/logout", (req, res) => {
        req.session.destroy();
        res.json({ success: true });
    });

    app.get("/api/me", (req, res) => {
        console.log("Session check - userId:", req.session.userId, "sessionID:", req.sessionID);
        if (req.session.userId) {
            res.json({ 
                userId: req.session.userId,
                username: req.session.username 
            });
        } else {
            res.status(401).json({ error: "Not authenticated" });
        }
    });

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

    app.get("/api/notes/:id", requireAuth, async (req, res) => {
        try {
            const noteId = parseInt(req.params.id);
            const note = await queryNoteById(db, noteId, req.session.userId);

            if (!note) {
                return res.status(404).json({ error: "Note not found" });
            }

            res.json(note);
        } catch (error) {
            console.error("Get note error:", error);
            res.status(500).json({ error: "Internal Server Error" });
        }
    });

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

            let note = null;
            if (result.insertId) {
                const possibleIdColumns = ['id', 'note_id', 'ID', 'NOTE_ID'];
                for (const colName of possibleIdColumns) {
                    try {
                        const [notes] = await db.query(`SELECT * FROM notes WHERE ${colName} = ?`, [result.insertId]);
                        if (notes.length > 0) {
                            note = notes[0];
                            break;
                        }
                    } catch (err) {
                        // Column doesn't exist, try next one
                        continue;
                    }
                }
            }
            
            // If we couldn't find it by ID, try to find it by user_id, title, and recent timestamp
            if (!note) {
                try {
                    const [notes] = await db.query(
                        "SELECT * FROM notes WHERE user_id = ? AND title = ? ORDER BY created_at DESC LIMIT 1",
                        [req.session.userId, noteTitle]
                    );
                    if (notes.length > 0) {
                        note = notes[0];
                    }
                } catch (err) {
                    console.error("Error finding note by user_id and title:", err);
                }
            }
            
            // If still not found, construct it from what we know
            if (!note) {
                note = {
                    id: result.insertId || null,
                    user_id: req.session.userId,
                    folder_id: folder,
                    title: noteTitle,
                    content: "",
                    created_at: new Date(),
                    updated_at: new Date()
                };
            }
            
            if (!note.id) {
                note.id = note.note_id || note.ID || note.NOTE_ID || result.insertId || null;
            }
            
            res.json(note);
        } catch (error) {
            console.error("Create note error:", error);
            res.status(500).json({ error: "Internal Server Error" });
        }
    });

    app.put("/api/notes/:id", requireAuth, async (req, res) => {
        try {
            const noteId = parseInt(req.params.id);
            const { title, content, folderId } = req.body;

            // Verify note belongs to user
            const note = await queryNoteById(db, noteId, req.session.userId);
            if (!note) {
                return res.status(404).json({ error: "Note not found" });
            }

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

            const updated = await updateNoteById(db, noteId, req.session.userId, updates, params);
            if (!updated) {
                return res.status(500).json({ error: "Failed to update note" });
            }

            const updatedNote = await queryNoteById(db, noteId, req.session.userId);
            res.json(updatedNote);
        } catch (error) {
            console.error("Update note error:", error);
            res.status(500).json({ error: "Internal Server Error" });
        }
    });

    app.delete("/api/notes/:id", requireAuth, async (req, res) => {
        try {
            const noteId = parseInt(req.params.id);
            
            if (isNaN(noteId)) {
                return res.status(400).json({ error: "Invalid note ID" });
            }

            // Verify note belongs to user
            const note = await queryNoteById(db, noteId, req.session.userId);
            if (!note) {
                return res.status(404).json({ error: "Note not found" });
            }

            // Delete note using helper function
            const deleted = await deleteNoteById(db, noteId, req.session.userId);
            if (!deleted) {
                return res.status(500).json({ error: "Failed to delete note" });
            }

            res.json({ success: true });
        } catch (error) {
            console.error("Delete note error:", error);
            res.status(500).json({ error: "Internal Server Error" });
        }
    });

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


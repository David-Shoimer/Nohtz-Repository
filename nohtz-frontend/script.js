// API Base URL
const API_BASE = "";

// Current state
let currentFolderId = null;
let currentNoteId = null;
let notes = [];
let folders = [];

// ========== AUTHENTICATION ==========

// Check if user is logged in
async function checkAuth() {
    try {
        const response = await fetch(`${API_BASE}/api/me`, {
            credentials: "include"
        });
        if (response.ok) {
            const user = await response.json();
            return user;
        }
        return null;
    } catch (error) {
        console.error("Auth check error:", error);
        return null;
    }
}

// Register
async function register(username, password) {
    try {
        const response = await fetch(`${API_BASE}/api/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ username, password })
        });
        const data = await response.json();
        if (response.ok) {
            window.location.href = "app.html";
        } else {
            alert(data.error || "Registration failed");
        }
    } catch (error) {
        console.error("Registration error:", error);
        alert("Registration failed");
    }
}

// Login
async function login(username, password) {
    try {
        const response = await fetch(`${API_BASE}/api/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ username, password })
        });
        const data = await response.json();
        if (response.ok) {
            window.location.href = "app.html";
        } else {
            alert(data.error || "Login failed");
        }
    } catch (error) {
        console.error("Login error:", error);
        alert("Login failed");
    }
}

// ========== FOLDERS ==========

async function loadFolders() {
    try {
        const response = await fetch(`${API_BASE}/api/folders`, {
            credentials: "include"
        });
        if (response.ok) {
            folders = await response.json();
            renderFolders();
        }
    } catch (error) {
        console.error("Load folders error:", error);
    }
}

function renderFolders() {
    const foldersList = document.getElementById("foldersList");
    if (!foldersList) return;

    // Keep "All Notes" folder
    foldersList.innerHTML = '<div class="folder-item active" data-folder-id="null"><span>All Notes</span></div>';
    
    // Add click handler for "All Notes"
    const allNotesItem = foldersList.querySelector('[data-folder-id="null"]');
    if (allNotesItem) {
        allNotesItem.addEventListener("click", () => selectFolder(null));
    }

    folders.forEach(folder => {
        const folderItem = document.createElement("div");
        folderItem.className = "folder-item";
        folderItem.dataset.folderId = folder.id;
        folderItem.innerHTML = `<span>${escapeHtml(folder.name)}</span>`;
        folderItem.addEventListener("click", () => selectFolder(folder.id));
        folderItem.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            e.stopPropagation();
            showFolderContextMenu(e, folder.id);
        });
        foldersList.appendChild(folderItem);
    });
}

async function createFolder() {
    const name = prompt("Enter folder name:", "New Folder");
    if (!name) return;

    try {
        const response = await fetch(`${API_BASE}/api/folders`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ name })
        });
        if (response.ok) {
            await loadFolders();
        } else {
            const data = await response.json();
            alert(data.error || "Failed to create folder");
        }
    } catch (error) {
        console.error("Create folder error:", error);
        alert("Failed to create folder");
    }
}

async function deleteFolder(folderId) {
    if (!confirm("Delete this folder? Notes in this folder will be moved to 'All Notes'.")) return;

    try {
        const response = await fetch(`${API_BASE}/api/folders/${folderId}`, {
            method: "DELETE",
            credentials: "include"
        });
        if (response.ok) {
            if (currentFolderId === folderId) {
                selectFolder(null);
            }
            await loadFolders();
            await loadNotes();
        } else {
            const data = await response.json();
            alert(data.error || "Failed to delete folder");
        }
    } catch (error) {
        console.error("Delete folder error:", error);
        alert("Failed to delete folder");
    }
}

function selectFolder(folderId) {
    currentFolderId = folderId === "null" ? null : folderId;
    currentNoteId = null;
    
    // Update active folder
    document.querySelectorAll(".folder-item").forEach(item => {
        item.classList.remove("active");
        const itemFolderId = item.dataset.folderId;
        if ((itemFolderId === "null" && folderId === null) || 
            (itemFolderId == folderId && folderId !== null)) {
            item.classList.add("active");
        }
    });

    // Close editor and load notes
    closeNoteEditor();
    loadNotes();
}

// ========== NOTES ==========

async function loadNotes() {
    try {
        const url = `${API_BASE}/api/notes${currentFolderId ? `?folderId=${currentFolderId}` : "?folderId=null"}`;
        const response = await fetch(url, {
            credentials: "include"
        });
        if (response.ok) {
            notes = await response.json();
            renderNotes();
        }
    } catch (error) {
        console.error("Load notes error:", error);
    }
}

function renderNotes() {
    const notesGrid = document.getElementById("notesGrid");
    if (!notesGrid) return;

    notesGrid.innerHTML = "";

    notes.forEach(note => {
        const noteCard = document.createElement("div");
        noteCard.className = "note-card";
        noteCard.dataset.noteId = note.id;
        noteCard.innerHTML = `<div class="note-title">${escapeHtml(note.title)}</div>`;
        noteCard.addEventListener("click", () => openNote(note.id));
        noteCard.addEventListener("contextmenu", (e) => showNoteContextMenu(e, note.id));
        notesGrid.appendChild(noteCard);
    });
}

async function createNote() {
    try {
        const response = await fetch(`${API_BASE}/api/notes`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ 
                title: "Untitled Note",
                folderId: currentFolderId
            })
        });
        if (response.ok) {
            const note = await response.json();
            await loadNotes();
            openNote(note.id);
        } else {
            const data = await response.json();
            alert(data.error || "Failed to create note");
        }
    } catch (error) {
        console.error("Create note error:", error);
        alert("Failed to create note");
    }
}

async function openNote(noteId) {
    try {
        const response = await fetch(`${API_BASE}/api/notes/${noteId}`, {
            credentials: "include"
        });
        if (response.ok) {
            const note = await response.json();
            currentNoteId = note.id;

            // Show editor, hide notes view
            document.getElementById("notesView").style.display = "none";
            document.getElementById("noteEditorView").style.display = "flex";

            // Load note content
            const editor = document.getElementById("noteEditor");
            editor.innerHTML = note.content || "";
            
            // Update title if needed
            document.title = `${note.title} - Nohtz`;

            // Apply current formatting
            applyFormatting();
        } else {
            alert("Failed to load note");
        }
    } catch (error) {
        console.error("Open note error:", error);
        alert("Failed to load note");
    }
}

function closeNoteEditor() {
    currentNoteId = null;
    document.getElementById("notesView").style.display = "block";
    document.getElementById("noteEditorView").style.display = "none";
    document.getElementById("noteEditor").innerHTML = "";
    document.title = "Nohtz - Notes";
}

async function saveNote() {
    if (!currentNoteId) return;

    const content = document.getElementById("noteEditor").innerHTML;

    try {
        const response = await fetch(`${API_BASE}/api/notes/${currentNoteId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ content })
        });
        if (response.ok) {
            alert("Note saved!");
            await loadNotes();
        } else {
            const data = await response.json();
            alert(data.error || "Failed to save note");
        }
    } catch (error) {
        console.error("Save note error:", error);
        alert("Failed to save note");
    }
}

async function renameNote(noteId) {
    const note = notes.find(n => n.id === noteId);
    if (!note) return;

    const newTitle = prompt("Enter new title:", note.title);
    if (!newTitle || newTitle === note.title) return;

    try {
        const response = await fetch(`${API_BASE}/api/notes/${noteId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ title: newTitle })
        });
        if (response.ok) {
            await loadNotes();
            if (currentNoteId === noteId) {
                document.title = `${newTitle} - Nohtz`;
            }
        } else {
            const data = await response.json();
            alert(data.error || "Failed to rename note");
        }
    } catch (error) {
        console.error("Rename note error:", error);
        alert("Failed to rename note");
    }
}

async function deleteNote(noteId) {
    if (!confirm("Delete this note?")) return;

    try {
        const response = await fetch(`${API_BASE}/api/notes/${noteId}`, {
            method: "DELETE",
            credentials: "include"
        });
        if (response.ok) {
            if (currentNoteId === noteId) {
                closeNoteEditor();
            }
            await loadNotes();
        } else {
            const data = await response.json();
            alert(data.error || "Failed to delete note");
        }
    } catch (error) {
        console.error("Delete note error:", error);
        alert("Failed to delete note");
    }
}

async function moveNoteToFolder(noteId, folderId) {
    try {
        const response = await fetch(`${API_BASE}/api/notes/${noteId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ folderId: folderId || null })
        });
        if (response.ok) {
            await loadNotes();
        } else {
            const data = await response.json();
            alert(data.error || "Failed to move note");
        }
    } catch (error) {
        console.error("Move note error:", error);
        alert("Failed to move note");
    }
}

// ========== CONTEXT MENUS ==========

function showNoteContextMenu(e, noteId) {
    e.preventDefault();
    const menu = document.getElementById("noteContextMenu");
    menu.innerHTML = `
        <div class="context-menu-item" onclick="renameNote(${noteId}); hideContextMenus();">Rename</div>
        <div class="context-menu-item" onclick="deleteNote(${noteId}); hideContextMenus();">Delete</div>
        <div class="context-menu-divider"></div>
        <div class="context-menu-item">Move to Folder
            <div class="context-submenu" id="moveToFolderSubmenu"></div>
        </div>
    `;

    // Build folder submenu
    const submenu = document.getElementById("moveToFolderSubmenu");
    submenu.innerHTML = '<div class="context-menu-item" onclick="moveNoteToFolder(' + noteId + ', null); hideContextMenus();">All Notes</div>';
    folders.forEach(folder => {
        const item = document.createElement("div");
        item.className = "context-menu-item";
        item.textContent = folder.name;
        item.onclick = () => {
            moveNoteToFolder(noteId, folder.id);
            hideContextMenus();
        };
        submenu.appendChild(item);
    });

    menu.style.display = "block";
    menu.style.left = e.pageX + "px";
    menu.style.top = e.pageY + "px";
}

function showFolderContextMenu(e, folderId) {
    e.preventDefault();
    e.stopPropagation();
    const menu = document.getElementById("folderContextMenu");
    menu.innerHTML = `
        <div class="context-menu-item" onclick="deleteFolder(${folderId}); hideContextMenus();">Delete</div>
    `;
    menu.style.display = "block";
    menu.style.left = e.pageX + "px";
    menu.style.top = e.pageY + "px";
}

function hideContextMenus() {
    document.getElementById("noteContextMenu").style.display = "none";
    document.getElementById("folderContextMenu").style.display = "none";
}

// ========== TEXT FORMATTING ==========

function applyFormatting() {
    const editor = document.getElementById("noteEditor");
    if (!editor) return;

    const fontFamily = document.getElementById("fontFamily").value;
    const fontSize = document.getElementById("fontSize").value;
    const textColor = document.getElementById("textColor").value;

    editor.style.fontFamily = fontFamily;
    editor.style.fontSize = fontSize;
    editor.style.color = textColor;
}

// ========== UTILITY ==========

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

// ========== INITIALIZATION ==========

// Page-specific initialization
if (document.getElementById("loginForm")) {
    // Login page
    document.getElementById("loginForm").addEventListener("submit", (e) => {
        e.preventDefault();
        const username = document.getElementById("username").value;
        const password = document.getElementById("password").value;
        login(username, password);
    });
}

if (document.getElementById("registerForm")) {
    // Register page
    document.getElementById("registerForm").addEventListener("submit", (e) => {
        e.preventDefault();
        const username = document.getElementById("username").value;
        const password = document.getElementById("password").value;
        register(username, password);
    });
}

if (document.getElementById("notesGrid")) {
    // App page
    (async () => {
        const user = await checkAuth();
        if (!user) {
            window.location.href = "index.html";
            return;
        }

        // Load folders and notes
        await loadFolders();
        await loadNotes();

        // Event listeners
        document.getElementById("addFolderBtn").addEventListener("click", createFolder);
        document.getElementById("saveNoteBtn").addEventListener("click", saveNote);
        document.getElementById("closeEditorBtn").addEventListener("click", closeNoteEditor);

        // Formatting controls
        document.getElementById("fontFamily").addEventListener("change", applyFormatting);
        document.getElementById("fontSize").addEventListener("change", applyFormatting);
        document.getElementById("textColor").addEventListener("change", applyFormatting);

        // Right-click on empty space to create note
        const notesGrid = document.getElementById("notesGrid");
        notesGrid.addEventListener("contextmenu", (e) => {
            if (e.target === notesGrid || (e.target.closest(".note-card") === null && e.target !== notesGrid.querySelector(".note-card"))) {
                e.preventDefault();
                createNote();
            }
        });
        
        // Also allow right-click on the notes-view container
        document.getElementById("notesView").addEventListener("contextmenu", (e) => {
            if (e.target.id === "notesView" || (e.target.id === "notesGrid" && e.target.children.length === 0)) {
                e.preventDefault();
                createNote();
            }
        });

        // Click outside to hide context menus
        document.addEventListener("click", hideContextMenus);

        // Initialize formatting
        applyFormatting();
    })();
}

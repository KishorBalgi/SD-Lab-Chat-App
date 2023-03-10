// Express Server
const express = require("express");
const app = express();
// Socket.io
const http = require("http");
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
const cookieParser = require("cookie-parser");
// Sqlite3 Database
const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("database.db");
// File System
const fs = require("fs");

// db.serialize(() => {
// db.run("CREATE TABLE Users (username TEXT, password TEXT)");
// db.run("CREATE TABLE Messages (username TEXT, message TEXT,timestamp TEXT)");
// db.run("ALTER TABLE Messages ADD COLUMN timestamp TEXT");
// });

// db.close();
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use(cookieParser());

// Register:
app.get("/register", (req, res) => {
  if (req.cookies.logged) {
    res.redirect("/");
  } else {
    res.sendFile(__dirname + "/views" + "/register.html");
  }
});
app.post("/register", (req, res) => {
  // check if user exists in database
  // if yes, then redirect to login page
  // else, add user to database and redirect to home page
  const register = fs.readFileSync(
    __dirname + "/views" + "/register.html",
    "utf-8"
  );
  db.get(
    "SELECT username FROM Users WHERE username = ?",
    [req.body.username],
    (err, row) => {
      if (row) {
        // User already exists
        const registerWithErr = register.replace(
          "<!--error-->",
          '<div class="alert alert-danger" role="alert">Username already exists</div>'
        );
        res.status(401).send(registerWithErr);
      } else {
        db.run(
          "INSERT INTO Users VALUES (?, ?)",
          [req.body.username, req.body.password],
          (err) => {
            if (err) {
              console.log(err);
            } else {
              // User added to database
              res.cookie("logged", true);
              res.cookie("username", req.body.username);
              res.status(200).redirect("/");
            }
          }
        );
      }
    }
  );
});

// Login:
app.get("/login", (req, res) => {
  if (req.cookies.logged) {
    res.redirect("/");
  } else {
    res.sendFile(__dirname + "/views" + "/login.html");
  }
});
app.post("/login", (req, res) => {
  // check if user exists in database
  // if yes, then verify password redirect to home page
  // else, redirect to login page
  db.get(
    "SELECT username FROM Users WHERE username = ? AND password = ?",
    [req.body.username, req.body.password],
    (err, row) => {
      if (row) {
        // User verified
        res.cookie("logged", true);
        res.cookie("username", req.body.username);
        res.status(200).redirect("/");
      } else {
        // User not verified
        const login = fs.readFileSync(
          __dirname + "/views" + "/login.html",
          "utf-8"
        );
        const loginWithErr = login.replace(
          "<!--error-->",
          '<div class="alert alert-danger" role="alert">Invalid username or password</div>'
        );
        res.status(401).send(loginWithErr);
      }
    }
  );
});

// Logout:
app.get("/logout", (req, res) => {
  res.clearCookie("logged");
  res.redirect("/login");
});

// Home:
app.get("/", (req, res) => {
  if (req.cookies.logged) {
    const username = req.cookies.username;
    // Get messages from database
    db.all("SELECT * FROM Messages", (err, rows) => {
      if (err) {
        console.log(err);
      } else {
        let messages = "";
        rows.forEach((row) => {
          messages += `<li class="${
            row.username === username ? "msg-right" : "msg-left"
          }"><span>${
            row.username === username ? "You" : row.username.replace("%20", " ")
          }</span>${row.message}<span class="msg-timestamp">${
            row.timestamp
          }</span></li>`;
        });
        const index = fs.readFileSync(__dirname + "/index.html", "utf-8");
        const indexWithMessages = index.replace("<!--messages-->", messages);
        res.status(200).send(indexWithMessages);
      }
    });
  } else {
    res.redirect("/login");
  }
});

// Clear Messages:
app.get("/clear", (req, res) => {
  if (req.cookies.logged) {
    db.run("DELETE FROM Messages", (err) => {
      if (err) {
        console.log(err);
      } else {
        res.redirect("/");
      }
    });
  } else {
    res.redirect("/login");
  }
});

// Clear Users:
app.get("/clearusers", (req, res) => {
  if (req.cookies.logged) {
    db.run("DELETE FROM Users", (err) => {
      if (err) {
        console.log(err);
      } else {
        res.redirect("/");
      }
    });
  } else {
    res.redirect("/login");
  }
});

// Socket.io connection:
io.use((socket, next) => {
  if (socket.handshake.auth.token) {
    socket.username = socket.handshake.auth.token;
    next();
  } else {
    next(new Error("Please provide authentication!"));
  }
});

io.on("connection", (socket) => {
  // Join Public Room:
  socket.join("public");
  //   Send new user joined:
  io.emit("user joined", socket.username);
  //   Send Chat:
  socket.on("send message", (msg) => {
    // Save message to database
    db.run(
      "INSERT INTO Messages VALUES (?, ?, ?)",
      [socket.username, msg, new Date().toLocaleTimeString()],
      (err) => {
        if (err) {
          console.log(err);
        }
      }
    );
    socket
      .to("public")
      .emit("chat message", { msg, username: socket.username });
  });
  //   User Disconnected:
  socket.on("disconnect", () => {
    io.emit("user left", socket.username);
  });
});

// Server:
const PORT = process.env.PORT || 9000;
server.listen(PORT, () => {
  console.log("Listening on port http://localhost:9000/");
});

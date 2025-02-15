import dotenv from "dotenv";
dotenv.config();
import session from "express-session";
import express from "express";
import bodyParser from "body-parser";
import cookieParser from "cookie-parser";
import connectDB from "./config/db.js";
import userRoutes from "./routes/userRoutes.js";
import docRoutes from "./routes/docRoutes.js";

const app = express();
connectDB();
app.use(
  session({
    secret: process.env.SESSION_KEY, // A secret key used to sign the session ID cookie
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, httpOnly: true, maxAge: 3600000 }, // 1 hour session expiry
  })
);
app.use(express.json());
app.use(bodyParser.json());
app.use(cookieParser());

app.use("/api/users", userRoutes);
app.use("/api/doc", docRoutes);

app.all("*", (req, res, next) => {
  const error = new Error(
    `Method ${req.method} not allowed for ${req.originalUrl}`
  );
  error.status = 405; // Method Not Allowed
  next(error); // Pass the error to the error handler
});
// Default error handler
app.use((err, req, res, next) => {
  console.error(err); // Log error details
  res.status(err.status || 500).json({
    error: err.message || "Internal Server Error",
  });
});

app.listen(process.env.PORT, () => {
  console.log(`Server running on port ${process.env.PORT}`);
});

import jwt from "jsonwebtoken";

// Middleware to verify JWT token
export const verifyToken = (req, res, next) => {
  try {
    const token = req.query.token; // Token is passed in the query parameter

    if (!token) {
      return res.status(400).json({ message: "Token is required." });
    }

    // Verify the token
    const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);

    // Proceed to the next middleware or route handler
    next();
  } catch (error) {
    console.error("Error verifying token:", error);
    return res.status(401).json({ message: "Invalid or expired token." });
  }
};

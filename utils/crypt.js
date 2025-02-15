import dotenv from "dotenv";
dotenv.config();
import crypto from "crypto";

// AES-256 Encryption key (ensure this is stored securely, e.g., in environment variables)
const key = process.env.ENCRYPTION_KEY; // 32-byte key for AES-256

// Function to encrypt a string (either phone number or OTP)
export const encrypt = (text) => {
  if (!text) {
    throw new Error("Text to encrypt is missing");
  }

  const iv = crypto.randomBytes(16); // Generate a random IV (16 bytes)
  const cipher = crypto.createCipheriv(
    "aes-256-cbc",
    Buffer.from(key, "utf8"),
    iv
  ); // AES-CBC mode with IV

  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");

  return { encryptedData: encrypted, iv: iv.toString("hex") }; // Return encrypted data and IV
};

// Function to decrypt a string (either phone number or OTP)
export const decrypt = (encryptedText, iv) => {
  if (!encryptedText || !iv) {
    throw new Error("Encrypted text or IV is missing");
  }

  const decipher = crypto.createDecipheriv(
    "aes-256-cbc",
    Buffer.from(key, "utf8"),
    Buffer.from(iv, "hex")
  );
  let decrypted = decipher.update(encryptedText, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
};

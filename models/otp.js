import mongoose from "mongoose";

// Define the OTP schema
const otpSchema = new mongoose.Schema(
  {
    phoneNumber: {
      type: String,
      required: true,
      unique: true, // Ensures one OTP per phone number
    },
    otp: {
      type: String, // Store the encrypted OTP as a string
      required: true,
    },
    iv: {
      type: String, // Store the IV used for encryption as a hex string
      required: true,
    },
    expirationTime: {
      type: Date,
      required: true,
    },
    verified: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
); // Adds createdAt and updatedAt fields

// Create the OTP model
const OTP = mongoose.model("OTP", otpSchema);

export default OTP;

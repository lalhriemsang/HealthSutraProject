import dotenv from "dotenv";
dotenv.config();
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import OTP from "../models/otp.js";
import User from "../models/user.js";
import { encrypt, decrypt } from "../utils/crypt.js";

const bucketRegion = process.env.BUCKET_REGION;
// uses different bucket region from document due to SMS feature limitation for some regions
const AWS_AccessKey = process.env.AWS_ACCESS_KEY;
const AWS_Secret_AccessKey = process.env.AWS_SECRET_ACCESS_KEY;

// Initialize AWS SDK
const sns = new SNSClient({
  credentials: {
    accessKeyId: AWS_AccessKey,
    secretAccessKey: AWS_Secret_AccessKey,
  },
  region: bucketRegion,
});

// Function to generate OTP (6-digit)
function generateOtp() {
  const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP
  return otp;
}

// Function to save OTP in the database with expiration time (encrypted OTP and IV)
async function saveOtp(phoneNumber, otp) {
  const { encryptedData, iv } = encrypt(otp); // Encrypt OTP and get both encrypted data and IV

  const expirationTime = new Date(Date.now() + 10 * 60000); // OTP expires in 10 minutes

  const otpData = {
    otp: encryptedData, // Store encrypted OTP
    iv: iv, // Store IV used for encryption
    expirationTime,
    verified: false,
  };

  try {
    // Attempt to find the OTP record by phone number and update it
    const otpRecord = await OTP.findOneAndUpdate(
      { phoneNumber }, // Search by phone number
      otpData, // Update the OTP record with new data
      { new: true, upsert: true } // `upsert: true` creates a new record if none is found
    );

    return otpRecord;
  } catch (error) {
    console.error("Error saving OTP:", error);
    throw new Error("Error saving OTP");
  }
}

// Function to send OTP via SNS
async function sendOtp(phoneNumber, otp) {
  const params = {
    Message: `Your OTP is ${otp}`,
    PhoneNumber: phoneNumber, // Phone number in E.164 format (+91XXXXXXXXXX)
  };

  try {
    // Send OTP message to the phone number
    const command = new PublishCommand(params);
    const message = await sns.send(command);
    console.log("OTP sent:", message); // Optionally log the response
    return message;
  } catch (error) {
    console.error("Error sending OTP:", error);
    throw new Error("Error sending OTP");
  }
}

// Function to verify OTP (Check if OTP is valid and expired)
async function verifyOtp(phoneNumber, enteredOtp) {
  try {
    // Find the most recent OTP record for the given phone number
    const otpRecord = await OTP.findOne({ phoneNumber }).sort({
      createdAt: -1,
    });

    if (!otpRecord) {
      throw new Error("Invalid OTP");
    }

    // Check if the OTP has expired
    if (new Date() > otpRecord.expirationTime) {
      await OTP.deleteOne({ phoneNumber }); // Delete expired OTP record
      throw new Error("OTP has expired");
    }

    // Decrypt the OTP stored in the database
    const decryptedOtp = decrypt(otpRecord.otp, otpRecord.iv);

    // Verify the entered OTP
    if (decryptedOtp !== enteredOtp) {
      throw new Error("Invalid OTP");
    }

    // Optionally delete the OTP record after successful verification (if required)
    await OTP.deleteOne({ phoneNumber });

    return true; // OTP verified successfully
  } catch (error) {
    throw new Error(error.message);
  }
}

export const signUp = async (req, res) => {
  const { name, phoneNumber } = req.body;

  if (!name || !phoneNumber) {
    return res
      .status(400)
      .json({ error: "Phone number and name are required" });
  }

  const userExists = await User.findOne({ phoneNumber });

  if (userExists)
    return res.status(409).json({
      error:
        "Phone Number is already subscribed! Please enter a different Phone Number",
    });

  // Generate OTP for the phone number
  const otp = generateOtp();

  // Save OTP in database with expiration time
  try {
    await sendOtp(phoneNumber, otp); // Send OTP via SNS

    await saveOtp(phoneNumber, otp);

    const newUser = new User({ name, phoneNumber });
    await newUser.save();

    res.status(200).json({ message: "Sign-up successful. OTP sent to phone." });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message });
  }
};

// Verify OTP Endpoint
export const verifyUserOtp = async (req, res) => {
  const { phoneNumber, otp } = req.body;

  if (!phoneNumber || !otp) {
    return res.status(400).json({ error: "Phone number and OTP are required" });
  }

  try {
    // Verify OTP (ensure it's valid and not expired)
    await verifyOtp(phoneNumber, otp);

    const user = {
      phoneNumber: phoneNumber,
      isVerified: true,
    };
    req.session.user = user;

    res.status(200).json({ message: "OTP successfully verified" });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Sign-In Endpoint (Generates and Sends OTP again if needed)
export const signIn = async (req, res) => {
  const { phoneNumber } = req.body;

  if (!phoneNumber) {
    return res.status(400).json({ error: "Phone number is required" });
  }

  const userExists = await User.findOne({ phoneNumber });

  if (!userExists)
    return res.status(400).json({
      error: "PhoneNumber doesn't exist, please register first to continue.",
    });

  // Generate OTP for the phone number
  const otp = generateOtp();

  // Save OTP in the database
  try {
    await sendOtp(phoneNumber, otp); // Send OTP via SNS

    await saveOtp(phoneNumber, otp);

    res
      .status(200)
      .json({ message: "OTP sent successfully. Check your phone." });
  } catch (error) {
    res.status(500).json({ error: "Error sending OTP via SNS" });
  }
};

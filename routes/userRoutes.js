import express from "express";
import {
  signUp,
  signIn,
  verifyUserOtp,
} from "../controllers/userController.js";
const router = express.Router();

router.post("/signUp", signUp);
router.post("/signIn", signIn);
router.post("/verifyOtp", verifyUserOtp);

export default router;

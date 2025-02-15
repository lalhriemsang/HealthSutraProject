import express from "express";
import multer from "multer";
import {
  generateUploadDocLink,
  getAllUserDocs,
  deleteDoc,
  uploadDoc,
  handleUserQuery,
} from "../controllers/documentController.js";
import { verifyToken } from "../middleware/verifyToken.js";
import isVerified from "../middleware/verifyUser.js";

const upload = multer();
const router = express.Router();

router.get("/generateUploadLink", isVerified, generateUploadDocLink);
router.post(
  "/uploadDoc",
  isVerified,
  verifyToken,
  upload.single("file"),
  uploadDoc
);
router.get("/getAllDocs", isVerified, getAllUserDocs);
router.post("/deleteDoc", isVerified, deleteDoc);
router.post("/userquery", isVerified, handleUserQuery);

export default router;

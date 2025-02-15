import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import {
  TextractClient,
  StartDocumentTextDetectionCommand,
  GetDocumentTextDetectionCommand,
} from "@aws-sdk/client-textract";
import TextDoc from "../models/doc.js";

import jwt from "jsonwebtoken";
import axios from "axios";

const bucketName = process.env.BUCKET_NAME;
const bucketRegion = process.env.BUCKET_REGION1;
const AWS_AccessKey = process.env.AWS_ACCESS_KEY;
const AWS_Secret_AccessKey = process.env.AWS_SECRET_ACCESS_KEY;

const GEMINI_API_URL = process.env.GEMINI_API_URL;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_FILE_TYPE = "application/pdf";

const textract = new TextractClient({
  credentials: {
    accessKeyId: AWS_AccessKey,
    secretAccessKey: AWS_Secret_AccessKey,
  },
  region: bucketRegion,
});

const s3 = new S3Client({
  credentials: {
    accessKeyId: AWS_AccessKey,
    secretAccessKey: AWS_Secret_AccessKey,
  },
  region: bucketRegion,
});

export const generateUploadDocLink = async (req, res) => {
  try {
    const { phoneNumber } = req.session.user;

    // use phnNo for auth before generateLink

    if (!phoneNumber) {
      return res.status(400).json({ message: "Phone number is required." });
    }

    const token = jwt.sign({ phoneNumber }, process.env.JWT_SECRET_KEY, {
      expiresIn: "15m",
    });

    // Send the upload link to the user
    res.json({
      uploadLink: `http://localhost:${process.env.PORT}/api/doc/uploadDoc?token=${token}`,
    });
  } catch (error) {
    console.error("Error generating upload link:", error);
    res.status(500).json({ message: "Error generating upload link" });
  }
};

export const uploadDoc = async (req, res) => {
  try {
    const { phoneNumber } = req.session.user;

    const file = req.file; // File from the request

    if (!file) {
      return res.status(400).json({ message: "No file provided." });
    }

    // Validate the file type (only PDFs allowed)
    if (file.mimetype !== ALLOWED_FILE_TYPE) {
      return res
        .status(400)
        .json({ message: "Invalid file type. Only PDFs are allowed." });
    }

    // Validate file size (handled by multer but verifying again)
    if (file.size > MAX_FILE_SIZE) {
      return res.status(400).json({
        message: `File size exceeds the limit of ${
          MAX_FILE_SIZE / (1024 * 1024)
        }MB`,
      });
    }

    // Use the original filename from the file upload (keeping the original name)
    const originalFileName = file.originalname;

    // Prepare the upload parameters for S3
    const uploadParams = {
      Bucket: bucketName,
      Key: originalFileName, // Use original filename
      Body: file.buffer, // The file data to upload (buffer from multer)
      ContentType: ALLOWED_FILE_TYPE,
      Metadata: {
        phoneNumber: phoneNumber, // Store the phone number as metadata
      },
    };

    // Upload the file to S3
    await s3.send(new PutObjectCommand(uploadParams));

    // Combine all uploaded files
    const combinedText = await extractAllDocsByPhoneNo(phoneNumber);

    await TextDoc.findOneAndUpdate(
      { phoneNumber: phoneNumber },
      { combinedText: combinedText },
      { new: true, upsert: true } // This will create a new document if none exists
    );

    // Respond with success message
    return res.json({
      message: "File uploaded successfully!",
      s3Location: `https://${bucketName}.s3.amazonaws.com/${originalFileName}`,
    });
  } catch (error) {
    console.error("Error uploading file:", error);
    return res.status(500).json({ message: "Error uploading file." });
  }
};

// Example usage in your function
async function getAllDocsByPhoneNo(phoneNumber) {
  try {
    // Prepare the command to list objects in the S3 bucket
    const listCommand = new ListObjectsV2Command({
      Bucket: process.env.BUCKET_NAME, // The name of your S3 bucket
    });

    // Get the list of objects in the S3 bucket
    const data = await s3.send(listCommand);

    // Filter the files by phone number stored in metadata
    const filteredFiles = [];

    for (const object of data.Contents) {
      // Get the metadata for each object (file)
      const metadataCommand = new GetObjectCommand({
        Bucket: process.env.BUCKET_NAME,
        Key: object.Key,
      });

      const fileData = await s3.send(metadataCommand);
      const fileMetadata = fileData.Metadata;

      // Check if the phone number in metadata matches the provided phone number
      if (fileMetadata.phonenumber === phoneNumber) {
        // If it matches, add the file's metadata and content to the result
        filteredFiles.push({
          Key: object.Key,
          Body: fileData.Body, // Store the valid body (Body is stream)
        });
      } else {
        console.log("Invalid file body, skipping file:", object.Key);
      }
    }

    return filteredFiles;
  } catch (error) {
    console.log("Error in fetching all documents", error);
    return null;
  }
}

export const getAllUserDocs = async (req, res) => {
  try {
    const { phoneNumber } = req.session.user;

    const filteredFiles = await getAllDocsByPhoneNo(phoneNumber);

    // If no files are found
    if (!filteredFiles || filteredFiles.length === 0) {
      return res
        .status(404)
        .json({ message: "No documents found for this phone number." });
    }

    const files = filteredFiles.map((file) => file.Key);
    // Return the list of filenames
    return res.json({ files: files });
  } catch (error) {}
};

export const deleteDoc = async (req, res) => {
  try {
    const { phoneNumber } = req.session.user;

    const { fileName } = req.body;

    // Verify phone number and file name presence
    if (!phoneNumber || !fileName) {
      return res
        .status(400)
        .json({ message: "Phone number and file name are required." });
    }

    // Check if the file exists and retrieve metadata without downloading the file
    const headCommand = new HeadObjectCommand({
      Bucket: bucketName,
      Key: fileName,
    });

    const s3Response = await s3.send(headCommand);
    const metadata = s3Response.Metadata;

    // Decrypt the metadata to verify the phone number
    const orgPhoneNumber = metadata.phonenumber;

    if (orgPhoneNumber !== phoneNumber) {
      return res.status(403).json({
        message:
          "Access denied. You do not have permission to delete this document.",
      });
    }

    // If the phone numbers match, proceed with deletion
    const deleteCommand = new DeleteObjectCommand({
      Bucket: bucketName,
      Key: fileName,
    });

    await s3.send(deleteCommand);

    // Combine all remaining files
    const combinedText = await extractAllDocsByPhoneNo(phoneNumber);

    await TextDoc.findOneAndUpdate(
      { phoneNumber: phoneNumber },
      { combinedText: combinedText },
      { new: true } // Update the existing document
    );

    // Return a success message
    res.status(200).json({
      message: "Document deleted successfully.",
    });
  } catch (error) {
    console.error("Error deleting document:", error);
    res.status(500).json({ message: "Error deleting document." });
  }
};

async function extractAllDocsByPhoneNo(phoneNumber) {
  try {
    const filteredFiles = await getAllDocsByPhoneNo(phoneNumber);

    let combinedText = "";

    for (const file of filteredFiles) {
      const extractedText = await extractTextFromPdf(file.Key);
      combinedText += extractedText;
    }

    return combinedText;
  } catch (error) {
    console.log("Error in fetching or processing documents", error);
    return null;
  }
}

// Function to start text detection for a PDF file using Textract
const extractTextFromPdf = async (documentName) => {
  try {
    // Start the text detection process using Textract
    const startParams = {
      DocumentLocation: {
        S3Object: {
          Bucket: bucketName,
          Name: documentName,
        },
      },
    };

    const startCommand = new StartDocumentTextDetectionCommand(startParams);
    const startResponse = await textract.send(startCommand);
    const jobId = startResponse.JobId;

    console.log(`Started text detection for ${documentName}. JobId: ${jobId}`);

    // Poll for the result (check the job status)
    let jobStatus = "IN_PROGRESS";
    let extractedText = "";
    while (jobStatus === "IN_PROGRESS") {
      const getParams = { JobId: jobId };
      const getCommand = new GetDocumentTextDetectionCommand(getParams);
      const getResponse = await textract.send(getCommand);
      jobStatus = getResponse.JobStatus;

      if (jobStatus === "IN_PROGRESS") {
        console.log("Job still in progress...");
        await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait for 5 seconds before checking again
      } else if (jobStatus === "SUCCEEDED") {
        console.log(`Text extraction succeeded for ${documentName}.`);

        // Extract the text from the response
        getResponse.Blocks.forEach((block) => {
          if (block.BlockType === "LINE") {
            extractedText += block.Text + "\n"; // Append text from each line
          }
        });
      } else {
        console.error(`Text extraction failed for ${documentName}.`);
        throw new Error("Textract job failed");
      }
    }

    // Add a separator to indicate the end of this document's text
    extractedText += "\n--- Document Separator ---\n";

    return extractedText;
  } catch (error) {
    console.error(`Error extracting text from ${documentName}:`, error);
    return "";
  }
};

export const handleUserQuery = async (req, res) => {
  try {
    const { phoneNumber } = req.session.user;

    const { query } = req.body;

    if (!query) {
      return res.status(400).json({ message: "Query must not be empty" });
    }

    // Retrieve the combined text document from MongoDB
    const textDoc = await TextDoc.findOne({ phoneNumber });

    if (!textDoc) {
      return res.status(404).json({ message: "No medical history found." });
    }

    const medicalHistoryText = textDoc.combinedText;

    // Now perform the NLP analysis
    const medicalReport = await docAnalysis(medicalHistoryText, query);

    res.status(200).json({ medicalReport });
  } catch (error) {
    console.error("Error processing query:", error);
    return res.status(500).json({ message: "Error processing the query." });
  }
};

async function docAnalysis(medicalHistoryText, userQuery) {
  const prompt = `Answer the following query: "${userQuery}"

If the answer requires additional information from the patient's medical history, please analyze the medical history texts provided below. Each section represents a different medical history document. Please identify and reference these individual documents as separate records when analyzing the information.

The medical history records to analyze are:

${medicalHistoryText}

Each record is separated by the following marker: "\n--- Document Separator ---\n"
Treat each record as a distinct medical history, and when relevant, refer to them using their specific context, such as "the patient's primary medical record," "the record regarding the 48-year-old male," or "the record regarding Mr. Tan Ah Kow," as appropriate.

If multiple records contain relevant details, feel free to draw from them together. Be sure to refer to the most relevant record based on the query, and if any details from a specific record are important, make it clear which one you're referencing.

In your response, summarize conditions, treatments, medications, or other specifics in plain language. If any key details are unclear or missing from any of the records, make a note of that. Additionally, offer any critical insights that might be relevant to the query.

Be sure to focus on answering the query first, using the medical history records to inform your response where needed, and clearly indicate which record each piece of information is coming from.

---
`;

  try {
    // Send request to Gemini API for inference
    const response = await axios.post(
      GEMINI_API_URL,
      {
        contents: [
          {
            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
        params: {
          key: GEMINI_API_KEY,
        },
      }
    );

    let rawText = response.data.candidates[0].content.parts[0].text;

    // Clean up the raw text
    rawText = rawText.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>"); // Bold to <strong>
    rawText = rawText.replace(/\n/g, "<br>"); // \n to <br>
    rawText = rawText.replace("--- Document Separator ---", "<hr>");

    return rawText;
  } catch (error) {
    console.log(error);
    throw new Error(
      `Failed to anaylyze medical History using Gemini: ${error.message}`
    );
  }
}

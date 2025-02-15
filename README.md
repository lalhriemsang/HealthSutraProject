# HEALTHSUTRA

A backend application that leverages AI tools to analyze a patient's medical history and provide relevant health insights.

## SETUP

1. **Clone the repository:**
   ```sh
   git clone <repository-url>
   ```
2. **Navigate to the project directory:**
   ```sh
   cd <project-directory>
   ```
3. **Install dependencies:**

   ```sh

   npm install @aws-sdk/client-s3 @aws-sdk/client-sns @aws-sdk/client-textract axios cookie-parser dotenv express-session express mongoose multer crypto body-parser jsonwebtoken


   ```

4. **Set the environment variables:**  
   Define the following variables in your `.env` file:
   ```sh
   MONGO_URI, PORT, SESSION_KEY, JWT_SECRET_KEY, BUCKET_NAME, BUCKET_REGION, BUCKET_REGION1, AWS_ACCESS_KEY, AWS_SECRET_ACCESS_KEY, GEMINI_API_URL, GEMINI_API_KEY, ENCRYPTION_KEY
   ```

- Please google on how to create and use your GEMINI API

#### IMPORTANT NOTE

I used two different AWS regions: one for my S3 bucket and another for my SNS topic, to enable the SMS feature. This was necessary because the S3 bucket was created in the Asia Pacific (Mumbai) region, and when I tried using the same region for the SNS topic, I wasn't able to send SMS messages. However, when I selected a different region for the SNS topic (Asia Pacific - Singapore), the SMS functionality worked.

To avoid this complexity, you can create both the S3 bucket and the SNS topic in the same region, but make sure that the SMS service via SNS is supported in that region

## RUN INSTRUCTIONS

### Running the Application

Run the following command in the terminal:

```sh
node app.js
```

To interact with the backend, you can use tools like **Postman** to send API requests.

### Using Postman

1. **Open Postman** and log in or create a new account.
2. **Create a new workspace.**
3. **Sign Up or Sign In** before using the APIs.

### API Endpoints

#### 1. User Sign-Up

- **Method:** POST
- **URL:** `http://localhost:5000/api/users/signUp`
- **Request Body (JSON):**
  ```json
  {
    "name": "Your Name",
    "phoneNumber": "Your Phone Number"
  }
  ```

#### 2. User Sign-In

- **Method:** POST
- **URL:** `http://localhost:5000/api/users/signIn`
- **Request Body (JSON):**
  ```json
  {
    "phoneNumber": "Your Phone Number"
  }
  ```

#### 3. OTP Verification

- **Get the OTP from your phone.**
- **Method:** POST
- **URL:** `http://localhost:5000/api/users/verifyOtp`
- **Request Body (JSON):**
  ```json
  {
    "phoneNumber": "Your Phone Number",
    "otp": "Your OTP"
  }
  ```
- **If OTP is expired or invalid, retry.**

#### 4. Upload a Document

- **Generate an upload link:**
  - **Method:** GET
  - **URL:** `http://localhost:5000/api/doc/generateUploadLink`
  - **Response (JSON):**
    ```json
    { "uploadLink": "http://localhost:5000/api/doc/uploadDoc?<token>" }
    ```
- **Upload the document:**
  - **Method:** POST
  - **Use the provided upload link.**
  - **Request Body:** Form-data
    - Key: `file`, Value: Select the file to upload
- **Success Response:**
  ```json
  { "message": "File uploaded successfully!" }
  ```

#### 5. Get All Uploaded Documents

- **Method:** GET
- **URL:** `http://localhost:5000/api/doc/getAllDocs`
- **Response (JSON):**
  ```json
  {
    "files": ["file1", "file2", "fileN"]
  }
  ```

#### 6. Submit a Query

- **Method:** POST
- **URL:** `http://localhost:5000/api/doc/userquery`
- **Request Body (JSON):**
  ```json
  { "query": "Your query here" }
  ```
- **Response (JSON):**
  ```json
  { "medicalReport": "AI Response" }
  ```

#### 7. Delete a Document

- **Method:** DELETE
- **URL:** `http://localhost:5000/api/doc/deleteDoc`
- **Request Body (JSON):**
  ```json
  { "fileName": "Sample-File.pdf" }
  ```
- **Response (JSON):**
  ```json
  { "message": "File deleted successfully" }
  ```

## DESIGN DECISIONS

#### 1. User Registration & Authentication

We identify users by their phone number. Additionally, we require users to enter their name for further processing or additional information that may be needed later. User information will be stored in a MongoDB database.

Phone verification will be done through OTP (One-Time Password). For each phone number, we ensure that only one OTP is associated at a time. If it doesn’t exist, an OTP is created; if a new one is generated, the previous OTP is updated. The OTP will be encrypted and securely stored in MongoDB for enhanced security.

When verifying an OTP, if it has expired or doesn’t exist, or if the entered OTP doesn't match the stored OTP, it will be treated as invalid.

To enable SMS-based phone verification, we first need to create an AWS account and an IAM user with AWS SNS Full Access (for simplicity). We then create an SNS topic on the AWS SNS platform and select the appropriate region (e.g., Asia Pacific – Singapore) that supports SMS.

However, before sending SMS messages to users, we must first verify the phone numbers in the AWS SNS sandbox environment. This involves using the AWS SNS Console to add the phone numbers to the sandbox destination list. Only after phone numbers are verified in the sandbox can we send SMS messages from the application.

After phone number verification, we write the user controller code to handle user signup, signin, and the sending and verifying of OTPs. Once the OTP is successfully verified, we store the user’s phone number in a session object along with a flag variable indicating that the user is verified and authorized to use the application.

#### 2. Ephemeral Document Upload

For this functionality, we create a route called "api/doc/generateUploadLink". This route will generate an upload link that includes a JWT token with a 15-minute expiration time. Within this time frame, users must use the upload link to upload their files to the cloud server. If a user tries to use an upload link after its expiration, the server will respond with a message indicating that the token is either invalid or expired.

Additionally, we’ve implemented functionality where, after uploading or deleting a document, all existing documents for a user (identified by their phone number) are combined into a single text message. Each document's text is separated by an indicator that enables the AI to recognize them as distinct documents.

To extract text from PDF documents, we use the AWS Textract API. The extraction process involves sending the PDF document to AWS Textract, which returns the extracted text. The text for each document is then compiled into a single message.

## Reasons for implementing the above functionality

- 1. The AI API needs text to analyze user documents to give insights
- 2. We therefore convert all documents of a user to a single text while maintaining each document text is seperated from the other for the AI to recognize.
- 3. It would be costly to access to all user's documents using this process for the AI to analyze each time it makes a request in response to a query.
- 4. We therefore combine all the user's documents into a text either on uploading or deletion since a user won't use these operations frequently
- 5. The combined text will contain all information about the documents available for the AI API to access anytime and is more cost effective since we already have all of user's document information.

#### 3. User-Specific AI Query Endpoint

We create an AI Query Endpoint "/api/doc/userquery" for users to input their query and analyze their documents using AI.

Using phone Number as metadeta while uploading documents to the cloud server we restrict the AI API to access only those documents with phone number that matches with the current verfied user's phone number.

Users can input as many queries as they want to get the relevant insights from their documents.

#### 4. Security & Best Practices

- While uploading documents we validate the file size and type restricting the file to be of atmost 10 MB and of only pdf type to prevent malicious upload.
- Proper error handling is also implemented here for all controllers and on any invalid url the server gives back the proper response.
- Using a strong session key and with session cookie expiry time for max 1 hr we ensure a proper session management where for a user in a particular session only that user will be authorized and any other external agents will be blocked from tampering that session.

- By using a strong session key and setting a session cookie expiry time of 1 hour, we ensure proper session management. This means that only the authenticated user within a specific session will be authorized to access their data. Any external agents trying to tamper with the session (for example, through session hijacking or impersonation) will be blocked.

Additionally:

- The session key ensures that the session ID is securely signed and cannot be tampered with.
- The 1-hour session expiry reduces the window of opportunity for an attacker to misuse a session if the session ID is compromised.
- By setting the httpOnly flag, we prevent client-side JavaScript from accessing the session cookie, making it harder for attackers to steal the-session through cross-site scripting (XSS) attacks.
- Setting secure: true in production ensures that cookies are sent only over HTTPS, preventing interception through man-in-the-middle attacks.

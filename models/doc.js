import mongoose from "mongoose";

const textDocSchema = new mongoose.Schema({
  phoneNumber: { type: String, required: true, unique: true },
  combinedText: { type: String, required: true },
});

const TextDoc = mongoose.model("TextDoc", textDocSchema);

export default TextDoc;

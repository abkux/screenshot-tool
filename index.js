const chokidar = require('chokidar');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const dotenv = require('dotenv');
const mime = require("mime-types");
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const axios = require('axios');
const FormData = require('form-data');

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GKEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

const screenshotFolder = "Path Where ScreenShort Is Stored";

const watcher = chokidar.watch(screenshotFolder, {
  persistent: true,
  ignoreInitial: true,
});

watcher.on('add', async (filePath) => {
  const originalName = path.basename(filePath);
  const ext = path.extname(filePath);

  // Avoid already renamed files
  if (originalName.endsWith('-ss' + ext)) return;

  console.log(`New screenshot detected: ${originalName}`);

  // Wait a bit for the file to be fully written
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Prompt
  const prompt = `
  You are an intelligent data understanding model. Analyze the following screenshot image and give it a short description about it (in 7 to 10 words max).
  
  Only return the short description — no extra explanation or comments.
  `;

  const image = {
    inlineData: {
      data: Buffer.from(fs.readFileSync(filePath)).toString("base64"),
      mimeType: mime.lookup(filePath) || "image/png",
    },
  };

  try {
    const result = await model.generateContent([prompt, image]);

    const descRaw = result.response.text().trim();

    // Cleaning the name ( puntuation; replacing space with hypen)
    const safeDescription = descRaw
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 50);

    const newName = `${safeDescription}-ss${ext}`;
    const newFilePath = path.join(screenshotFolder, newName);

    console.log(`Description: "${descRaw}"`);
    console.log(`Renaming to: ${newName}`);

    fs.renameSync(filePath, newFilePath);
    console.log(`Successfully renamed to: ${newName}`);

    // Uploading - Remove this if you don't want to upload server
    console.log("Uploading to server...");
    const form = new FormData();
    form.append('image', fs.createReadStream(newFilePath), newName);

    console.log("🚀 Uploading to server...");
    const response = await axios.post(process.env.SERVER_URL, form, {
      headers: form.getHeaders(),
    });

    const url = response.data.url;
    console.log('Uploaded:', url);
    exec(`echo ${url} | clip`, (error) => {
      if (error) {
        console.error('Error copying to clipboard:', error);
      } else {
        console.log('Copied URL to clipboard!');
      }
    });
    // Comment till here if you want to disable.

  } catch (err) {
    console.error(`Error processing image: ${err.message}`);
  }
});

console.log("Running and Watching : " + screenshotFolder );

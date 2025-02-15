const express = require("express");
const cors = require("cors");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const fs = require("fs");
const path = require("path");
const { cloudinary } = require("./cloudinary/main.js");
const dotenv = require("dotenv");
const user = require("./model/user.js");
const mongoose = require('mongoose')
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const dbUrl = process.env.DB_URL || 'mongodb://127.0.0.1:27017/cookie_agreement'

mongoose.connect(dbUrl);

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'CONNECTION FAILED!'));
db.once('open', () => {
  console.log('DATABASE CONNECTED');
});

app.use(express.static(path.join(__dirname, "public")));

app.post('/create-user', async (req, res) => {
    try {
        const { name, email, uid } = req.body;
        const newUser = new user({ name, email, uid });
        await newUser.save();
        res.json({ success: true, user: newUser });
    } catch (error) {
        console.error("Error creating user:", error);
        res.status(500).json({ error: "Failed to create user" });
    }
});

app.get('/get-user', async (req, res) => {
    try {
        const { uid } = req.query;
        const cookie_user = await user.findOne({ uid: uid });
        res.json({ user: cookie_user });
    } catch (error) {
        console.error("Error getting user:", error);
        res.status(500).json({ error: "Failed to get user" });
    }
});

app.post("/generate-pdf", async (req, res) => {
    try {
        const { name, date, address, signature, uid } = req.body;
        const capitalized_name = name.charAt(0).toUpperCase() + name.slice(1);

        console.log("Got the request", name, date, address, uid);

        const cookie_user = await user.findOne({ uid: uid });

        console.log(cookie_user)

        if (!cookie_user) {
            return res.status(400).json({ error: "User not found" });
        }

        if (cookie_user.is_agreement_updated) {
            return res.status(400).json({ error: "Agreement already signed" });
        }

        const pdf_path = "template_agreement.pdf";
        const pdfBytes = fs.readFileSync(pdf_path);
        const pdfDoc = await PDFDocument.load(pdfBytes);
        const firstPage = pdfDoc.getPages()[4];
        const title_page = pdfDoc.getPages()[0];
        const { width, height } = firstPage.getSize();

        const font = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);

        title_page.drawText(`Dear ${capitalized_name}`, { x: 470, y: 225, size: 16, font, color: rgb(1, 1, 1) });
        firstPage.drawText(capitalized_name, { x: 465, y: 240, size: 17, font, color: rgb(0, 0, 0) });
        title_page.drawText(`This agreement is made and effective as of ${date}`, { x: 280, y: height - 60, size: 12, font, color: rgb(1, 1, 1) });

        if (signature) {
            const signatureImage = await pdfDoc.embedPng(Buffer.from(signature.split(",")[1], "base64"));
            firstPage.drawImage(signatureImage, { x: width / 2 + 130, y: 275, width: 100, height: 50 });
        }

        const outputFilePath = `modified_agreement_${name}.pdf`;
        fs.writeFileSync(outputFilePath, await pdfDoc.save());

        const cloudinaryResponse = await cloudinary.uploader.upload(outputFilePath, {
            resource_type: "raw",
            folder: "PDFs"
        });

        fs.unlinkSync(outputFilePath);

        cookie_user.is_agreement_updated = true;

        await cookie_user.save();

        res.json({ message: 'Agreement Signed Successfully', pdfUrl: cloudinaryResponse.secure_url });
    } catch (error) {
        console.error("Error generating PDF:", error);
        res.status(500).json({ error: "Failed to generate and upload PDF" });
    }
});

app.listen(5000, () => console.log("Server running on port 5000"));

const express = require("express");
const cors = require("cors");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const fs = require("fs");
const path = require("path");
const { cloudinary } = require("./cloudinary/main.js");
const dotenv = require("dotenv");
const User = require("./model/user.js");
const mongoose = require('mongoose');
const multer = require('multer');
const { auth, create_firebase_user } = require('./firebase/firebase.js');
const { checkCloudinaryConnection } = require('./cloudinary/main.js');
dotenv.config();

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());
// process.env.DB_URL ||
const dbUrl = 'mongodb://127.0.0.1:27017/cookie_agreement'

mongoose.connect(dbUrl);

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'CONNECTION FAILED!'));
db.once('open', () => {
    console.log('DATABASE CONNECTED');
});

app.use(express.static(path.join(__dirname, "public")));

checkCloudinaryConnection();

const upload = multer({ dest: "uploads/" });


app.post("/upload-template", upload.single("file"), (req, res) => {
    try {
        const tempPath = req.file.path;
        const targetPath = path.join(__dirname, "template_agreement.pdf");

        fs.rename(tempPath, targetPath, (err) => {
            if (err) return res.status(500).json({ error: "Failed to update template" });

            res.json({ message: "Template updated successfully!" });
        });
    } catch (error) {
        res.status(500).json({ error: "Error processing file" });
    }
});



app.post('/create-user', async (req, res) => {

    const { email, client_name } = req.body;

    const updated_client = client_name.split(' ').join('_').toLowerCase();

    if (!email) {
        return res.status(400).json({ error: "Email is required" });
    }

    const firebase_user = await create_firebase_user(email, '12345678');

    if (!firebase_user) {
        return res.status(500).json({ error: "Failed to create user" });
    }

    try {
        const newUser = new User({ client_name: updated_client, email, uid: firebase_user.uid });
        await newUser.save();
        res.json({ success: true, user: firebase_user, link: `${process.env.FRONTEND_URL}/sign-agreement/${firebase_user.uid}` });
    } catch (error) {
        console.error("Error creating user:", error);
        res.status(500).json({ error: "Failed to create user" });
    }

});

app.get('/get-user', async (req, res) => {
    try {
        const { uid } = req.query;
        const cookie_user = await User.findOne({ uid: uid });
        res.json({ user: cookie_user });
    } catch (error) {
        console.error("Error getting user:", error);
        res.status(500).json({ error: "Failed to get user" });
    }
});



app.post("/generate-pdf", async (req, res) => {
    try {
        const { name, date, phone_number, signature, uid } = req.body;
        const capitalized_name = name.charAt(0).toUpperCase() + name.slice(1);

        console.log("Got the request", name, date, phone_number, uid);

        const cookie_user = await User.findOne({ uid: uid });

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

        // Utility function to calculate text width and adjust font size
        function getTextWidth(text, font, size) {
            return font.widthOfTextAtSize(text, size);
        }

        function adjustFontSize(text, font, maxWidth, initialSize) {
            let currentSize = initialSize;
            let textWidth = getTextWidth(text, font, currentSize);
            
            while (textWidth > maxWidth && currentSize > 5) {
                currentSize--;  // Decrease font size until it fits
                textWidth = getTextWidth(text, font, currentSize);
            }
            
            return currentSize; // Return the adjusted size
        }

        // Maximum width for text to avoid overflow
        const maxWidth = 550; // Adjust according to your page layout

        // Wrap text function to break long text into multiple lines
        function wrapText(text, font, size, maxWidth) {
            const words = text.split(" ");
            let lines = [];
            let currentLine = "";

            for (let word of words) {
                let lineWidth = font.widthOfTextAtSize(currentLine + " " + word, size);
                if (lineWidth < maxWidth) {
                    currentLine += " " + word;
                } else {
                    lines.push(currentLine);
                    currentLine = word;
                }
            }
            lines.push(currentLine);
            return lines;
        }

        // Adjust font size for "Dear ${capitalized_name}"
        let firstText = `Dear ${capitalized_name}`;
        let firstTextSize = adjustFontSize(firstText, font, maxWidth, 16);
        const firstTextWidth = getTextWidth(firstText, font, firstTextSize);
        const firstTextX = 50; // Adjusted to prevent overflow

        title_page.drawText(firstText, { 
            x: firstTextX, 
            y: 225, 
            size: firstTextSize, 
            font, 
            color: rgb(1, 1, 1) 
        });

        // Adjust font size for "cookie_user.client_name"
        let clientName = cookie_user.name;
        let clientNameSize = adjustFontSize(clientName, font, maxWidth, 17);
        const clientNameWidth = getTextWidth(clientName, font, clientNameSize);
        const clientNameX = 50; // Adjusted to prevent overflow

        firstPage.drawText(clientName, { 
            x: clientNameX, 
            y: 240, 
            size: clientNameSize, 
            font, 
            color: rgb(0, 0, 0) 
        });

        // Wrap and draw the agreement text: "This agreement is made and effective as of ${date}"
        let agreementText = `This agreement is made and effective as of ${date}`;
        let agreementTextSize = adjustFontSize(agreementText, font, maxWidth, 12);
        const wrappedAgreementText = wrapText(agreementText, font, agreementTextSize, maxWidth);

        wrappedAgreementText.forEach((line, index) => {
            title_page.drawText(line.trim(), {
                x: 50,
                y: height - 60 - index * 15, // Stack lines downward
                size: agreementTextSize,
                font,
                color: rgb(1, 1, 1)
            });
        });

        // Add signature image if present
        if (signature) {
            const signatureImage = await pdfDoc.embedPng(Buffer.from(signature.split(",")[1], "base64"));
            firstPage.drawImage(signatureImage, { x: width / 2 + 130, y: 275, width: 100, height: 50 });
        }

        // Save the generated PDF
        const outputFilePath = `modified_agreement_${name}.pdf`;
        fs.writeFileSync(outputFilePath, await pdfDoc.save());

        // Upload to Cloudinary
        const cloudinaryResponse = await cloudinary.uploader.upload(outputFilePath, {
            public_id: `${cookie_user.client_name + cookie_user.uid.slice(0,6)}_agreement`,
            resource_type: "raw",
            folder: "cookie_agreements"
        });

        fs.unlinkSync(outputFilePath);

        // Update user info in the database
        cookie_user.is_agreement_updated = true;
        cookie_user.name = capitalized_name;
        cookie_user.phone_number = phone_number;
        cookie_user.agreement_url = cloudinaryResponse.secure_url;

        await cookie_user.save();

        // Send success response
        res.json({ message: 'Agreement Signed Successfully', pdfUrl: cloudinaryResponse.secure_url });
    } catch (error) {
        console.error("Error generating PDF:", error);
        res.status(500).json({ error: "Failed to generate and upload PDF" });
    }
});


app.post('/unsign-agreement', async (req, res) => {
    try {
        const { uid } = req.body;
        const cookie_user = await User.findOne({ uid: uid });

        if(!cookie_user){
            return res.status(400).json({ error: "User not found" });
        }

        cookie_user.is_agreement_updated = false;

        await cookie_user.save();
        res.json({ message: 'Agreement unsigned successfully' })
    } catch (e) {
        console.error("Error: ", e);
        res.status(500).json({ error: "Failed to unsign the agreement" });
    }
})


app.get('/clients', async (req, res) => {
    try {
        const clients = await User.find({});
        res.json({ clients: clients })
    } catch (e) {
        console.error("Error generating PDF:", error);
        res.status(500).json({ error: "Failed to fetch clients" });
    }
})

app.listen(5000, () => console.log("Server running on port 5000"));

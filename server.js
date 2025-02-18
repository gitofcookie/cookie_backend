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
const Admin = require("./model/admin.js");
dotenv.config();

const app = express();
app.use(cors({ origin: process.env.FRONTEND_URL }));
app.use(express.json());
const dbUrl = process.env.DB_URL || 'mongodb://127.0.0.1:27017/cookie_agreement'

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
        const { name, phone_number, signature, uid } = req.body;

        const date_object = new Date();

        const date = date_object.toLocaleDateString();


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

        function getTextWidth(text, font, size) {
            if (typeof text !== 'string') {
                throw new Error('Text must be a string');
            }
            return font.widthOfTextAtSize(text, size);
        }

        function adjustFontSize(text, font, maxWidth, initialSize) {
            let currentSize = initialSize;
            let textWidth = getTextWidth(text, font, currentSize);
            
            while (textWidth > maxWidth && currentSize > 5) {
                currentSize--;  
                textWidth = getTextWidth(text, font, currentSize);
            }
            
            return currentSize; 
        }

        function wrapText(text, font, size, maxWidth) {
            const words = text.split(' ');
            let lines = [];
            let currentLine = '';

            for (let i = 0; i < words.length; i++) {
                const word = words[i];
                const testLine = currentLine ? currentLine + ' ' + word : word;
                const testWidth = getTextWidth(testLine, font, size);

                if (testWidth <= maxWidth) {
                    currentLine = testLine;
                } else {
                    lines.push(currentLine);
                    currentLine = word; 
                }
            }

            if (currentLine) {
                lines.push(currentLine);
            }

            return lines;
        }

        const maxWidth = 550;

        let firstText = `Dear ${capitalized_name}`;
        let firstTextSize = adjustFontSize(firstText, font, maxWidth, 16);
        const firstTextWidth = getTextWidth(firstText, font, firstTextSize);
        console.log(`Width of text "${firstText}":`, firstTextWidth);

        const firstTextX = 50;

        title_page.drawText(firstText, { 
            x: firstTextX, 
            y: 225, 
            size: firstTextSize, 
            font, 
            color: rgb(1, 1, 1) 
        });

        let clientName = capitalized_name ; 
        let clientNameSize = adjustFontSize(clientName, font, maxWidth, 17);

        const clientNameWidth = getTextWidth(clientName, font, clientNameSize);
        console.log(`Width of client name "${clientName}":`, clientNameWidth);

        const clientNameX = 50; 

        firstPage.drawText(clientName, { 
            x: clientNameX, 
            y: 230, 
            size: clientNameSize, 
            font, 
            color: rgb(0, 0, 0) 
        });

        let agreementText = `This agreement is made and effective as of ${date}`;
        let agreementTextSize = adjustFontSize(agreementText, font, maxWidth, 12);
        const wrappedAgreementText = wrapText(agreementText, font, agreementTextSize, maxWidth);

        wrappedAgreementText.forEach((line, index) => {
            title_page.drawText(line.trim(), {
                x: 50,
                y: height - 60 - index * 15,
                size: agreementTextSize,
                font,
                color: rgb(1, 1, 1)
            });
        });

        if (signature) {
            const signatureImage = await pdfDoc.embedPng(Buffer.from(signature.split(",")[1], "base64"));
            firstPage.drawImage(signatureImage, { x: 75, y: 275, width: 100, height: 50 });
        }

        const outputFilePath = `modified_agreement_${name}.pdf`;
        fs.writeFileSync(outputFilePath, await pdfDoc.save());

        const cloudinaryResponse = await cloudinary.uploader.upload(outputFilePath, {
            public_id: `${cookie_user.client_name + cookie_user.uid.slice(0,6)}_agreement`,
            resource_type: "raw",
            folder: "cookie_agreements"
        });

        fs.unlinkSync(outputFilePath);

        cookie_user.is_agreement_updated = true;
        cookie_user.name = capitalized_name;
        cookie_user.phone_number = phone_number;
        cookie_user.agreement_url = cloudinaryResponse.secure_url;

        await cookie_user.save();

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

app.post('/complete-project', async(req, res) => {
    try{
        const {uid} = req.body;
        const cookie_user = await User.findOne({uid: uid})

        if(!cookie_user){
            return res.status(400).json({ error: "User not found" });
        }

        cookie_user.is_project_completed = true;

        await cookie_user.save();

        res.json({message: 'Hurray!!!!!!!!, make sure you party tonight, Wrapped🥳'})
        
    }catch(e){
        console.log('error', e)
        res.status(500).json({error: "Failed to update project completion"})
    }
})

app.get('/client/:uid', async(req, res) => {
    try{
        const {uid} = req.params;
        const cookie_user = await User.findOne({uid: uid});

        if(!cookie_user){
            return res.status(400).json({error: "User not found."})
        }

        res.json({client: cookie_user})
    }catch(e){
        console.log(e)
        res.status(500).json({error: 'Failed to fetch client'})
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

app.get('/admin/:uid', async(req, res) => {
    try{
        const {uid} = req.params;
        const admin = await Admin.findOne({uid: uid});
        console.log(admin)
        res.json({admin: admin})
    }catch(e){
        res.status(500).json({error: 'Failed to fetch admin'})
    }
})

app.listen(5000, () => console.log("Server running on port 5000"));

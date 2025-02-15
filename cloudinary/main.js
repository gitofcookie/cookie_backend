const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
require('dotenv').config();

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_KEY,
    api_secret: process.env.CLOUDINARY_SECRET
});

// Configure Cloudinary Storage for PDFs
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'agreement_pdfs', // Folder to store PDFs
        resource_type: 'raw', // Important for handling PDFs
        allowedFormats: ['pdf'] // Restrict to PDFs only
    }
});

// Function to Check Cloudinary Connection
const checkCloudinaryConnection = async () => {
    try {
        const result = await cloudinary.api.ping();
        if (result.status === 'ok') {
            console.log('Cloudinary connection is successful.');
            return true;
        }
    } catch (error) {
        console.error('Cloudinary connection failed:', error);
        return false;
    }
};

module.exports = { cloudinary, storage, checkCloudinaryConnection };

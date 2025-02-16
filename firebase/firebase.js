require("dotenv").config();
const admin = require("firebase-admin");

const serviceAccount = {
  type: "service_account",
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: process.env.FIREBASE_AUTH_URI,
  token_uri: process.env.FIREBASE_TOKEN_URI,
  auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_CERT_URL,
  client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL,
  universe_domain: process.env.FIREBASE_UNIVERSE_DOMAIN,
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});


const auth = admin.auth();


async function create_firebase_user(email, password) {
    try {
        // Create user in Firebase Authentication

    

        const userRecord = await admin.auth().createUser({
            email: email,
            password: password,  
            emailVerified: false,
            disabled: false
        });

        console.log("User successfully created:", userRecord.uid);

        // Fetch the user to check if email is set
        const updatedUser = await admin.auth().getUser(userRecord.uid);
        console.log("Updated User:", updatedUser);

        return updatedUser;
    } catch (error) {
        console.error("Error creating Firebase user:", error);
        return null;
    }
}

module.exports = { auth, create_firebase_user };



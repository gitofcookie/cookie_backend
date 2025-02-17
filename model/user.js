const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    client_name: {
        type: String,
        required: true
    },
    name: {
        type: String,
    },
    email: {
        type: String,
        required: true
    },
    phone_number: {
        type: Number,
        default: 1234567890
    },
    date: {
        type: Date,
        default: Date.now
    },
    is_project_completed: {
        type: Boolean,
        default: false
    },
    uid: {
        type: String,
        required: true
    },
    agreement_url: {
        type: String,
        default: ''
    },
    is_agreement_updated: {
        type: Boolean,
        default: false
    }
});

const User = mongoose.model('User', userSchema);

module.exports = User
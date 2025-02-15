const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true
    },
    date: {
        type: Date,
        default: Date.now
    },
    uid: {
        type: String,
        required: true
    },
    is_agreement_updated: {
        type: Boolean,
        default: false
    }
});

module.exports = mongoose.model('User', userSchema);    
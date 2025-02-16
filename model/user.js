const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    client_name:{
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

const User = mongoose.model('User', userSchema);   

module.exports = User
const mongoose = require('mongoose');

const admin_schema = new mongoose.Schema({
    is_admin: {
        type: Boolean,
        default: true
    },
    name: {
        type: String,
    },
    email: {
        type: String,
        required: true
    },
    uid: {
        type: String,
        required: true
    }
});

const Admin = mongoose.model('Admin', admin_schema);

module.exports = Admin
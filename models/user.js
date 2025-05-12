const mongoose = require('mongoose');

let userSchema = new mongoose.Schema({
    username: String,
    name: String,
    email: String,
    password: String,
    age: Number,
    posts: [{type: mongoose.Schema.Types.ObjectId, ref: 'post'}]
});

module.exports = mongoose.model('user', userSchema);
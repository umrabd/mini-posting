const mongoose = require('mongoose');

let postSchema = new mongoose.Schema({
    user: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'user'
    },
    date: {
        type: Date,
        default: Date.now,
    },
    content: {
        type: String,
        required: false  // Making content optional
    },
    image: {
        type: String,  // This will store the path to the image
        default: null
    }
});

module.exports = mongoose.model('post', postSchema);
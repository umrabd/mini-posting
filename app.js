const express = require('express');
const app = express();
const userModel = require('./models/user');
const postModel = require('./models/post');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const connectDB = require('./db');
const multer = require('multer');
const mongoose = require('mongoose');
const path = require('path');

// Middleware
app.set('view engine', 'ejs');
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static('public'));

// Configure multer for memory storage
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter: function (req, file, cb) {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Not an image! Please upload an image.'), false);
        }
    }
});

// Function to upload file to GridFS
const uploadToGridFS = async (file) => {
    try {
        const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
            bucketName: 'images'
        });

        const filename = `${Date.now()}-${file.originalname}`;
        const uploadStream = bucket.openUploadStream(filename, {
            contentType: file.mimetype
        });

        return new Promise((resolve, reject) => {
            uploadStream.on('finish', () => {
                resolve(filename);
            });
            uploadStream.on('error', (error) => {
                reject(error);
            });
            uploadStream.end(file.buffer);
        });
    } catch (error) {
        console.error('GridFS upload error:', error);
        throw error;
    }
};

// Connect to MongoDB and initialize GridFS
connectDB().then(() => {
    console.log('Connected to MongoDB');
}).catch(err => {
    console.error('Failed to connect to MongoDB:', err);
});

// Middleware
const isLoggedIn = (req, res, next) => {
    const token = req.cookies.token;
    if (!token) {
        return res.redirect('/login');
    }
    jwt.verify(token, 'abcd', (err, decoded) => {
        if (err) {
            res.clearCookie('token');
            return res.redirect('/login');
        }
        req.user = decoded;
        next();
    });
};

app.get('/', (req, res) => {
    res.render('index');
});

app.get('/login', (req, res) => {
    const token = req.cookies.token;
    if (token) {
        try {
            jwt.verify(token, 'abcd');
            return res.redirect('/profile');
        } catch (error) {
            res.clearCookie('token');
        }
    }
    res.render('login');
});

app.get('/profile', isLoggedIn, async (req, res) => {
    const {email} = req.user;
    const user = await userModel.findOne({email}).populate('posts');

    
    
    res.render('profile', {user});
});

app.post('/delete-post', isLoggedIn, async (req, res) => {
    try {
        const {email} = req.user;
        const {postId} = req.body;
        
        // Find and delete the post
        const post = await postModel.findByIdAndDelete(postId);
        if (!post) {
            return res.status(404).json({ error: 'Post not found' });
        }

        // Update user's posts array
        const user = await userModel.findOne({email});
        user.posts = user.posts.filter(post => post.toString() !== postId);
        await user.save();

        res.redirect('/profile');
    } catch (error) {
        console.error('Error deleting post:', error);
        res.status(500).json({ error: 'Error deleting post' });
    }
});

app.post('/post', isLoggedIn, upload.single('image'), async (req, res) => {
    try {
        const {email} = req.user;
        const {content} = req.body;
        const user = await userModel.findOne({email});

        // Validate that at least one of content or image is present
        if (!content && !req.file) {
            return res.status(400).send('Post must contain either text or an image');
        }

        let imagePath = null;
        if (req.file) {
            try {
                const filename = await uploadToGridFS(req.file);
                imagePath = `/image/${filename}`;
            } catch (error) {
                console.error('Error uploading image:', error);
                return res.status(500).send('Error uploading image');
            }
        }

        let post = await postModel.create({
            content: content || '',  // Use empty string if no content
            user: user._id,
            image: imagePath
        });

        user.posts.push(post._id);
        await user.save();

        res.redirect('/profile');
    } catch (error) {
        console.error('Error creating post:', error);
        res.status(500).send('Error creating post');
    }
});

app.post('/register', async (req, res) => {
    try {
        const {username, name, email, password, age} = req.body;
        
        // Validate required fields
        if (!username || !name || !email || !password || !age) {
            return res.status(400).send('All fields are required');
        }

        // Check if user already exists
        let user = await userModel.findOne({email});
        if (user) {
            return res.status(400).send('User already exists');
        }

        // Hash password and create user
        bcrypt.genSalt(10, function(err, salt) {
            if (err) {
                return res.status(500).send('Error generating salt');
            }
            
            bcrypt.hash(password, salt, async (err, hash) => {
                if (err) {
                    return res.status(500).send('Error hashing password');
                }

                try {
                    let user = await userModel.create({
                        username,
                        name,
                        email,
                        password: hash,
                        age
                    });

                    let token = jwt.sign({email: user.email, id: user._id}, 'abcd');
                    res.cookie('token', token);
                    res.redirect('/login');
                } catch (error) {
                    console.error('Error creating user:', error);
                    res.status(500).send('Error creating user');
                }
            });
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).send('Server error during registration');
    }
});

app.post('/login', async (req, res) => {
    try {
        const {email, password} = req.body;

        if (!email || !password) {
            return res.status(400).send('All fields are required');
        }

        let user = await userModel.findOne({email});
        if (!user) {
            return res.status(400).send('Invalid email or password');
        }

        bcrypt.compare(password, user.password, (err, result) => {
            if (err) {
                return res.status(500).send('Error during login');
            }
            
            if (result) {
                const token = jwt.sign({email: user.email, id: user._id}, 'abcd');
                res.cookie('token', token);
                return res.redirect('/profile');
            } else {
                return res.status(400).send('Invalid email or password');
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).send('Server error during login');
    }
});

app.get('/logout', (req, res) => {
    res.clearCookie('token');
    res.redirect('/login');
});

// Serve images from GridFS
app.get('/image/:filename', async (req, res) => {
    try {
        const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
            bucketName: 'images'
        });
        
        const downloadStream = bucket.openDownloadStreamByName(req.params.filename);
        downloadStream.pipe(res);
    } catch (error) {
        console.error('Error serving image:', error);
        res.status(404).send('Image not found');
    }
});

app.listen(3000, () => {
    console.log('Server is running on port 3000');
});
import bcrypt from 'bcryptjs';
import User from '../models/User.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function pwdStrength(pwd) {
    if (!pwd) return 0;
    let score = 0;
    if (pwd.length >= 8) score++;
    if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;
    if (score <= 1) return 0;
    if (score === 2) return 1;
    return 2;
}

export const createUser = async (req, res) => {
    try {
        const { name, email, password, age, gender } = req.body;

        if (!EMAIL_RE.test(email)) {
            return res.status(400).json({ error: 'Enter a valid email address (e.g. you@domain.com).' });
        }

        if (pwdStrength(password) < 1) {
            return res.status(400).json({ error: 'Password too weak — use 8+ characters with uppercase, lowercase, and a number.' });
        }

        const userExists = await User.findOne({ email });
        if (userExists) {
            return res.status(400).json({ error: 'User already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 12);

        const user = await User.create({
            name,
            email,
            password: hashedPassword,
            profile: { age, gender }
        });

        res.status(201).json({
            message: 'User created successfully',
            userId: user._id,
            user: { _id: user._id, name: user.name, email: user.email }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const getAllUsers = async (req, res) => {
    try {
        const users = await User.find({}).select('name email _id');
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * GET /api/users/active-session
 * Returns the current authenticated session data
 */
export const getActiveSession = async (req, res) => {
    try {
        // Extract token from Authorization header
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'No token provided' });
        }

        const token = authHeader.split(' ')[1];

        res.json({
            userId: req.user._id.toString(),
            token: token
        });
    } catch (error) {
        console.error('Active session error:', error);
        res.status(500).json({ error: error.message });
    }
};
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    const valid = user && await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(400).json({ message: 'Invalid email or password' });
    }

    // Generate JWT
    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );
    res.json({
      message: 'Login successful',
      token, // Send token to frontend
      user: {
        name: user.name,
        email: user.email,
        _id: user._id,
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
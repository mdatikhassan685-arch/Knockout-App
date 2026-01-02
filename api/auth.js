const db = require('../db');
const bcrypt = require('bcryptjs');

module.exports = async (req, res) => {
    // 1. CORS & Headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { type, name, email, password, phone, token } = req.body;
    const ADMIN_SECRET_TOKEN = process.env.ADMIN_SECRET; 

    try {
        // 🔒 ADMIN LOGIN
        if (type === 'admin_login') {
            if (!ADMIN_SECRET_TOKEN || token !== ADMIN_SECRET_TOKEN) {
                return res.status(401).json({ error: 'Invalid Admin Token' });
            }
            const [admins] = await db.execute('SELECT id, username, email, role FROM users WHERE email = ? AND role = "admin"', [email]);
            
            if (admins.length === 0) return res.status(404).json({ error: 'Admin access denied or not found' });
            
            return res.status(200).json({ message: 'Admin Access Granted', user: admins[0] });
        }

        // 📝 USER SIGNUP (Duplicate Check Added)
        else if (type === 'signup') {
            if (!name || !email || !password || !phone) return res.status(400).json({ error: 'All fields required' });
            
            const [exists] = await db.execute('SELECT id FROM users WHERE email = ? OR phone = ?', [email, phone]);
            if (exists.length > 0) return res.status(400).json({ error: 'Email or Phone already registered' });
            
            const hashedPassword = await bcrypt.hash(password, 10);
            
            await db.execute(
                'INSERT INTO users (username, email, password, phone, wallet_balance, role, status) VALUES (?, ?, ?, ?, 0, "user", "active")', 
                [name, email, hashedPassword, phone]
            );
            
            return res.status(200).json({ message: 'Account created! Please Login.' });
        }

        // 🔑 USER LOGIN (Security Fix)
        else if (type === 'login') {
            const [users] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);
            
            if (users.length === 0) return res.status(401).json({ error: 'User not found' });
            
            const user = users[0];

            // Status Check
            if (user.status === 'blocked') return res.status(403).json({ error: 'Your account has been BLOCKED.' });
            if (user.status === 'suspended') return res.status(403).json({ error: 'Your account is temporarily SUSPENDED.' });

            // Password Check
            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) return res.status(401).json({ error: 'Wrong password' });
            
            // 🔥 FIX: Remove password from response
            const { password: _, ...userData } = user; 

            return res.status(200).json({ message: 'Login Success', user: userData });
        }

        return res.status(400).json({ error: 'Invalid Request Type' });

    } catch (error) {
        console.error("AUTH ERROR:", error);
        return res.status(500).json({ error: 'Server Error: ' + error.message });
    }
};

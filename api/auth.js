const db = require('../db');
const bcrypt = require('bcryptjs');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const { type, name, email, password, phone, token } = req.body;

    // ============ SECURE TOKEN SETUP ============
    // এখন টোকেন আসবে Vercel এর গোপন ভল্ট থেকে
    const ADMIN_SECRET_TOKEN = process.env.ADMIN_SECRET; 
    // ============================================

    try {
        if (type === 'admin_login') {
            // যদি Vercel এ টোকেন সেট করা না থাকে
            if (!ADMIN_SECRET_TOKEN) {
                return res.status(500).json({ error: 'সার্ভার কনফিগারেশন এরর (ADMIN_SECRET নেই)' });
            }

            // টোকেন চেক করা
            if (token !== ADMIN_SECRET_TOKEN) {
                return res.status(401).json({ error: 'ভুল সিক্রেট টোকেন!' });
            }

            const [admins] = await db.execute('SELECT * FROM users WHERE email = ? AND role = "admin"', [email]);

            if (admins.length === 0) {
                return res.status(404).json({ error: 'এই ইমেইলে কোনো এডমিন নেই' });
            }

            return res.status(200).json({
                message: 'Admin Access Granted',
                user: admins[0]
            });
        }

        // ... (বাকি কোড আগের মতোই) ...
        else if (type === 'signup') {
            if (!name || !email || !password || !phone) return res.status(400).json({ error: 'সব তথ্য দিন' });
            const [exists] = await db.execute('SELECT id FROM users WHERE email = ?', [email]);
            if (exists.length > 0) return res.status(400).json({ error: 'ইমেইল আগেই ব্যবহার হয়েছে' });
            const hashedPassword = await bcrypt.hash(password, 10);
            await db.execute('INSERT INTO users (name, email, password, phone, balance, role) VALUES (?, ?, ?, ?, 0, "user")', [name, email, hashedPassword, phone]);
            return res.status(200).json({ message: 'Success' });
        }

        else if (type === 'login') {
            const [users] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);
            if (users.length === 0) return res.status(401).json({ error: 'ভুল ইমেইল বা পাসওয়ার্ড' });
            const isMatch = await bcrypt.compare(password, users[0].password);
            if (!isMatch) return res.status(401).json({ error: 'ভুল ইমেইল বা পাসওয়ার্ড' });
            return res.status(200).json({ message: 'Login Success', user: users[0] });
        }

    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Server Error' });
    }
};

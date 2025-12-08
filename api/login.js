const db = require('../db');
const bcrypt = require('bcryptjs'); // নিশ্চিত করুন package.json-এ এটি আছে

module.exports = async (req, res) => {
    // CORS Headers...
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { email, password } = req.body;

    try {
        const [users] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);

        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = users[0];

        // ১. Bcrypt চেক
        const isMatch = await bcrypt.compare(password, user.password);
        
        // ২. যদি Bcrypt ফেল করে, তবে প্লেইন টেক্সট চেক (ব্যাকআপ)
        // এটি পুরনো ইউজারদের লগইন করতে সাহায্য করবে
        if (!isMatch && user.password !== password) {
            return res.status(401).json({ error: 'Invalid password' });
        }

        // সফল হলে
        return res.status(200).json({
            success: true,
            message: 'Login successful',
            user: { id: user.id, username: user.username, role: user.role }
        });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};

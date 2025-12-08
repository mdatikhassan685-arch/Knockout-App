const pool = require('../db');

module.exports = async (req, res) => {
    // CORS Headers...
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { email, password } = req.body;

    try {
        const [rows] = await pool.execute('SELECT * FROM users WHERE email = ?', [email]);

        if (rows.length > 0) {
            const user = rows[0];

            // ১. স্ট্যাটাস চেক (NEW)
            if (user.status === 'blocked') {
                return res.status(403).json({ error: 'Your account has been BLOCKED by Admin.' });
            }
            if (user.status === 'suspended') {
                return res.status(403).json({ error: 'Your account is currently SUSPENDED.' });
            }

            // ২. পাসওয়ার্ড চেক
            if (user.password === password) {
                return res.status(200).json({
                    success: true,
                    message: 'Login successful',
                    user: {
                        id: user.id,
                        username: user.username,
                        email: user.email,
                        role: user.role,
                        balance: user.wallet_balance
                    }
                });
            } else {
                return res.status(401).json({ error: 'Invalid password' });
            }
        } else {
            return res.status(404).json({ error: 'User not found' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

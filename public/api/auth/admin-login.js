const pool = require('../../db'); // db.js দুই ফোল্ডার পিছনে আছে

module.exports = async (req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { email, token } = req.body;

    if (!email || !token) {
        return res.status(400).json({ error: 'Missing credentials' });
    }

    try {
        // অ্যাডমিন চেক: ইমেইল মিলবে, রোল 'admin' হবে, এবং টোকেন মিলবে
        const [rows] = await pool.execute(
            'SELECT * FROM users WHERE email = ? AND role = "admin" AND admin_token = ?', 
            [email, token]
        );

        if (rows.length > 0) {
            const admin = rows[0];
            return res.status(200).json({
                success: true,
                message: 'Admin Access Granted',
                admin: {
                    id: admin.id,
                    username: admin.username,
                    role: 'admin'
                }
            });
        } else {
            return res.status(401).json({ success: false, error: 'Unauthorized Access' });
        }
    } catch (error) {
        console.error('Admin Login Error:', error);
        return res.status(500).json({ error: 'Server Error' });
    }
};

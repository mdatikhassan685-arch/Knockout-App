const pool = require('../db');

module.exports = async (req, res) => {
    // CORS Headers (মোবাইল অ্যাপের জন্য জরুরি)
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { email, password } = req.body;

    try {
        const [rows] = await pool.execute('SELECT * FROM users WHERE email = ?', [email]);

        if (rows.length > 0) {
            const user = rows[0];
            // সাধারণ পাসওয়ার্ড চেক (পরে এনক্রিপশন ঠিক করা হবে)
            // যদি আপনার PHP অ্যাপে password_hash ব্যবহার করা থাকে, তবে এখানে bcrypt লাগবে।
            // আপাতত সাধারণ টেক্সট চেক:
            if (user.password === password) { 
                res.status(200).json({ success: true, message: 'Login successful', user });
            } else {
                res.status(401).json({ success: false, message: 'Wrong password' });
            }
        } else {
            res.status(404).json({ success: false, message: 'User not found' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

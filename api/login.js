const db = require('../db'); // পাথ ঠিক করা হয়েছে (../../ নয়, ../ হবে)
const bcrypt = require('bcryptjs');

module.exports = async (req, res) => {
    // CORS
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

        // আপনার পুরনো অ্যাপে পাসওয়ার্ড এনক্রিপ্ট করা ছিল কিনা চেক করুন
        // যদি সাধারণ টেক্সট হয়, তবে bcrypt.compare কাজ করবে না।
        // আপাতত সহজ চেক:
        if (user.password === password) {
             return res.status(200).json({
                success: true,
                message: 'Login successful',
                user: { id: user.id, username: user.username, role: user.role }
            });
        } 
        
        // যদি bcrypt হয় (ভবিষ্যতের জন্য):
        // const isMatch = await bcrypt.compare(password, user.password);
        // if (isMatch) ...

        return res.status(401).json({ error: 'Wrong password' });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: error.message });
    }
};

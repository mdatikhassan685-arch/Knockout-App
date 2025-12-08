const pool = require('../../db');

module.exports = async (req, res) => {
    // CORS & Method Check... (আগের মতো)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { catId } = req.body;

    try {
        // ১. ক্যাটাগরি ইনফো
        const [cat] = await pool.execute('SELECT title FROM tournaments WHERE id = ?', [catId]);
        
        // ২. টুর্নামেন্ট লিস্ট (ওই ক্যাটাগরির আন্ডারে)
        const [tournaments] = await pool.execute(
            'SELECT * FROM tournaments WHERE parent_id = ? AND is_category = 0 ORDER BY id DESC', 
            [catId]
        );

        res.json({
            success: true,
            category: cat[0],
            tournaments
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

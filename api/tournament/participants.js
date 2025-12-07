const pool = require('../../db');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    
    const { tournamentId, userId } = req.body;

    try {
        // ১. সব কোয়ালিফাইড টিমের আইডি বের করা
        const [qRows] = await pool.execute('SELECT DISTINCT team_id FROM round_qualifiers WHERE tournament_id = ?', [tournamentId]);
        const qualifiedIds = qRows.map(row => row.team_id);

        // ২. টুর্নামেন্ট স্ট্যাটাস জানা
        const [tRows] = await pool.execute('SELECT status FROM tournaments WHERE id = ?', [tournamentId]);
        const tournamentStatus = tRows[0]?.status || 'open';

        // ৩. সব টিম এবং লিডারের নাম আনা
        const [teams] = await pool.execute(`
            SELECT t.*, u.username as leader_username 
            FROM teams t 
            JOIN users u ON t.leader_user_id = u.id 
            WHERE t.tournament_id = ? 
            ORDER BY t.group_name ASC, t.team_name ASC
        `, [tournamentId]);

        let grouped = {};
        let ungrouped = [];
        let eliminated = [];
        let userTeamId = null;

        for (const team of teams) {
            if (team.leader_user_id === userId) {
                userTeamId = team.id;
            }

            // মেম্বার লোড করা
            const [members] = await pool.execute('SELECT in_game_name, game_level FROM team_members WHERE team_id = ?', [team.id]);
            team.members = members;

            // স্ট্যাটাস লজিক
            let status = 'active';
            if (team.is_eliminated == 1) {
                status = 'eliminated';
            } else if (qualifiedIds.includes(team.id)) {
                status = 'qualified';
            } else if (qualifiedIds.length > 0 || tournamentStatus !== 'open') {
                status = 'eliminated'; // অটোমেটিক এলিমিনেশন
            }

            team.status = status;

            // গ্রুপিং
            if (status === 'eliminated') {
                eliminated.push(team);
            } else if (team.group_name) {
                if (!grouped[team.group_name]) grouped[team.group_name] = [];
                grouped[team.group_name].push(team);
            } else {
                ungrouped.push(team);
            }
        }

        res.status(200).json({
            success: true,
            grouped,
            ungrouped,
            eliminated,
            userTeamId
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

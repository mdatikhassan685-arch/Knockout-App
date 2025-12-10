const mysql = require('mysql2');
require('dotenv').config();

// গ্লোবাল কানেকশন পুল
let pool;

if (!pool) {
    pool = mysql.createPool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: process.env.DB_PORT || 4000, // এখানে পরিবর্তন করা হয়েছে
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        ssl: {
            minVersion: 'TLSv1.2',
            rejectUnauthorized: true
        }
    });
}

const db = pool.promise();

module.exports = db;

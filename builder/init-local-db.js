const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sql = require('mssql');
const dotenv = require('dotenv');

const configDir = process.env.HOMELINK_CONFIG_DIR;
if (!configDir) throw new Error('HOMELINK_CONFIG_DIR is required');
const saPassword = dotenv.parse(fs.readFileSync(path.join(configDir, 'sqlserver.env'))).MSSQL_SA_PASSWORD;
if (!saPassword) throw new Error('SQL Server administrator password is missing');
const appPassword = `Hl${crypto.randomBytes(24).toString('hex')}!1a`;
const poolConfig = {
    server: '127.0.0.1', user: 'sa', password: saPassword, database: 'master',
    connectionTimeout: 2000, requestTimeout: 5000,
    options: { encrypt: true, trustServerCertificate: true }
};

async function initialize() {
    let pool;
    let lastError;
    const deadline = Date.now() + 120000;
    while (!pool && Date.now() < deadline) {
        const candidate = new sql.ConnectionPool(poolConfig);
        try {
            pool = await candidate.connect();
        } catch (error) {
            lastError = error;
            if (candidate.connected) await candidate.close();
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    if (!pool) throw new Error(`SQL Server did not become ready: ${lastError && lastError.message}`);
    try {
        const check = await pool.request().query("SELECT DB_ID('DelovaHub') AS db, SUSER_ID('homelink_app') AS loginId");
        if (check.recordset[0].db !== null || check.recordset[0].loginId !== null) {
            throw new Error('Database or login already exists; no changes made');
        }
        fs.writeFileSync(path.join(configDir, 'app.env'),
            `DB_SERVER=127.0.0.1\nDB_PORT=1433\nDB_DATABASE=DelovaHub\nDB_USER=homelink_app\nDB_PASSWORD=${appPassword}\nDB_ENCRYPT=true\nDB_TRUST_CERT=true\nDISABLE_DYNAMIC_IP=true\n`,
            { mode: 0o600, flag: 'wx' });
        await pool.request().query('CREATE DATABASE [DelovaHub]');
        await pool.request().query(`CREATE LOGIN [homelink_app] WITH PASSWORD = '${appPassword}', CHECK_POLICY = ON`);
        await pool.request().query('USE [DelovaHub]; CREATE USER [homelink_app] FOR LOGIN [homelink_app]; ALTER ROLE [db_owner] ADD MEMBER [homelink_app]');
        console.log('Local HomeLink database and user created.');
    } finally {
        await pool.close();
    }
}

initialize().catch(error => {
    console.error('Local database setup failed:', error.message);
    process.exitCode = 1;
});

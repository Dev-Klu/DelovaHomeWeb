async function registerLocalUser(db, pool, { username, passwordHash, hubId }) {
    const transaction = new db.sql.Transaction(pool);
    await transaction.begin(db.sql.ISOLATION_LEVEL.SERIALIZABLE);
    try {
        const users = await new db.sql.Request(transaction)
            .input('hubId', db.sql.NVarChar(255), hubId)
            .query('SELECT COUNT(1) AS cnt FROM Users WITH (UPDLOCK, HOLDLOCK) WHERE HubID = @hubId');
        const role = users.recordset[0].cnt === 0 ? 'Admin' : 'User';
        await new db.sql.Request(transaction)
            .input('username', db.sql.NVarChar(255), username)
            .input('passwordHash', db.sql.NVarChar(255), passwordHash)
            .input('hubId', db.sql.NVarChar(255), hubId)
            .input('role', db.sql.NVarChar(50), role)
            .query('INSERT INTO Users (Username, PasswordHash, HubID, Role) VALUES (@username, @passwordHash, @hubId, @role)');
        await transaction.commit();
    } catch (error) {
        try {
            await transaction.rollback();
        } catch (rollbackError) {
            console.error('Registration rollback error:', rollbackError);
        }
        throw error;
    }
}

module.exports = registerLocalUser;

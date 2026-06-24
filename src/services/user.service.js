 const pool = require("../config/db");
 
 async function getAllUsers() {
    const result = await pool.query("SELECT * FROM users");
    return result.rows;
 };
 async function getUserById(id) {
     const result = await pool.query("SELECT * FROM users WHERE id = $1",[id]);
     return result.rows[0];
 };
 async function createUser(name,email) {
     const result = await pool.query("INSERT INTO users (name,email) VALUES ($1,$2) RETURNING *",[name,email]);
     return result.rows[0];
 };
 async function updateUser(id,name,email) {
     const result = await pool.query("UPDATE users SET name = $1, email = $2 WHERE id = $3 RETURNING *",[name,email,id]);
     return result.rows[0];
 };
 async function deleteUser(id) {
     const result = await pool.query("DELETE FROM users WHERE id = $1 RETURNING *",[id]);
     return result.rows[0];
 };


 module.exports = {
    getAllUsers,
    getUserById,
    createUser,
    updateUser,
    deleteUser
 };
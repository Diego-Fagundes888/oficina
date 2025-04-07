// src/routes/auth.js
const express = require('express');
const { login, logout, cadastrarUsuario } = require('../controllers/authController');
const verificarAutenticacao = require('../middleware/auth');

const router = express.Router();

router.post('/login', login);
router.get('/logout', logout);
router.post('/cadastrar', verificarAutenticacao, cadastrarUsuario); // Protegido para apenas admins cadastrarem

module.exports = router;
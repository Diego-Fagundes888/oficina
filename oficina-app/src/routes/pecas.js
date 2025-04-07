// src/routes/pecas.js
const express = require('express');
const verificarAutenticacao = require('../middleware/auth');
const { 
  listarPecas, 
  cadastrarPeca, 
  obterPeca, 
  atualizarPeca, 
  excluirPeca 
} = require('../controllers/pecasController');

const router = express.Router();

// Aplicar middleware de autenticação em todas as rotas
router.use(verificarAutenticacao);

router.get('/', listarPecas);
router.post('/', cadastrarPeca);
router.get('/:id', obterPeca);
router.put('/:id', atualizarPeca);
router.delete('/:id', excluirPeca);

module.exports = router;
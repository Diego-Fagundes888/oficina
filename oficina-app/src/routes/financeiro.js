// src/routes/financeiro.js
const express = require('express');
const verificarAutenticacao = require('../middleware/auth');
const { 
  listarMovimentacoes, 
  registrarMovimentacao, 
  obterResumoFinanceiro, 
  excluirMovimentacao 
} = require('../controllers/financeiroController');

const router = express.Router();

// Aplicar middleware de autenticação em todas as rotas
router.use(verificarAutenticacao);

router.get('/', listarMovimentacoes);
router.post('/', registrarMovimentacao);
router.get('/resumo', obterResumoFinanceiro);
router.delete('/:id', excluirMovimentacao);

module.exports = router;
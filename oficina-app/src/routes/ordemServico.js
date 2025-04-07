// src/routes/ordemServico.js
const express = require('express');
const verificarAutenticacao = require('../middleware/auth');
const { 
  criarOrdemServico, 
  listarOrdensServico, 
  obterOrdemServico, 
  atualizarOrdemServico, 
  excluirOrdemServico,
  finalizarOrdemServico
} = require('../controllers/ordemServicoController');

const router = express.Router();

// Aplicar middleware de autenticação em todas as rotas
router.use(verificarAutenticacao);

router.post('/', criarOrdemServico);
router.get('/', listarOrdensServico);
router.get('/:id', obterOrdemServico);
router.put('/:id', atualizarOrdemServico);
router.delete('/:id', excluirOrdemServico);
router.put('/:id/finalizar', finalizarOrdemServico);

module.exports = router;
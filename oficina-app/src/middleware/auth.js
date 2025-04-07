// src/middleware/auth.js
function verificarAutenticacao(req, res, next) {
    if (req.session && req.session.usuarioId) {
      // Usuário está autenticado
      return next();
    } else {
      // Usuário não está autenticado
      res.status(401).json({ mensagem: 'Acesso negado. Por favor, faça login.' });
    }
  }
  
  module.exports = verificarAutenticacao;
// src/controllers/authController.js
const { db } = require('../database/config');

// Login do usuário
function login(req, res) {
  const { email, senha } = req.body;

  if (!email || !senha) {
    return res.status(400).json({ mensagem: 'Email e senha são obrigatórios' });
  }

  db.get('SELECT * FROM usuarios WHERE email = ?', [email], (err, usuario) => {
    if (err) {
      return res.status(500).json({ mensagem: 'Erro ao buscar usuário' });
    }

    if (!usuario) {
      return res.status(401).json({ mensagem: 'Email ou senha incorretos' });
    }

    // Em um ambiente de produção, usaríamos bcrypt para comparar senhas
    if (usuario.senha !== senha) {
      return res.status(401).json({ mensagem: 'Email ou senha incorretos' });
    }

    // Criar sessão para o usuário
    req.session.usuarioId = usuario.id;
    req.session.usuarioNome = usuario.nome;
    req.session.usuarioCargo = usuario.cargo;
    
    res.json({
      mensagem: 'Login realizado com sucesso',
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        cargo: usuario.cargo
      }
    });
  });
}

// Logout do usuário
function logout(req, res) {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ mensagem: 'Erro ao realizar logout' });
    }
    res.json({ mensagem: 'Logout realizado com sucesso' });
  });
}

// Cadastrar novo usuário
function cadastrarUsuario(req, res) {
  const { nome, email, senha, cargo } = req.body;

  if (!nome || !email || !senha) {
    return res.status(400).json({ mensagem: 'Nome, email e senha são obrigatórios' });
  }

  db.get('SELECT * FROM usuarios WHERE email = ?', [email], (err, usuario) => {
    if (err) {
      return res.status(500).json({ mensagem: 'Erro ao verificar email' });
    }

    if (usuario) {
      return res.status(400).json({ mensagem: 'Email já cadastrado' });
    }

    // Em um ambiente de produção, deveríamos criptografar a senha com bcrypt
    db.run(
      'INSERT INTO usuarios (nome, email, senha, cargo) VALUES (?, ?, ?, ?)',
      [nome, email, senha, cargo || 'funcionário'],
      function(err) {
        if (err) {
          return res.status(500).json({ mensagem: 'Erro ao cadastrar usuário' });
        }

        res.status(201).json({
          mensagem: 'Usuário cadastrado com sucesso',
          usuarioId: this.lastID
        });
      }
    );
  });
}

module.exports = {
  login,
  logout,
  cadastrarUsuario
};
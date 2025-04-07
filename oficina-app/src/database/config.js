// src/database/config.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.resolve(__dirname, 'database.db');

// Criar instância do banco de dados
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Erro ao conectar ao banco de dados:', err.message);
  } else {
    console.log('Conectado ao banco de dados SQLite.');
  }
});

// Inicializa o banco de dados com as tabelas necessárias
function initializeDatabase() {
  db.serialize(() => {
    // Tabela de usuários
    db.run(`CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      senha TEXT NOT NULL,
      cargo TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Tabela de ordens de serviço
    db.run(`CREATE TABLE IF NOT EXISTS ordem_servico (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_nome TEXT NOT NULL,
      veiculo_modelo TEXT NOT NULL,
      veiculo_ano TEXT,
      veiculo_placa TEXT NOT NULL,
      tipo_servico TEXT NOT NULL,
      descricao TEXT,
      valor_pecas REAL DEFAULT 0,
      valor_mao_obra REAL DEFAULT 0,
      valor_total REAL DEFAULT 0,
      status TEXT DEFAULT 'Em andamento',
      data_criacao DATETIME DEFAULT CURRENT_TIMESTAMP,
      data_finalizacao DATETIME
    )`);

    // Tabela de peças
    db.run(`CREATE TABLE IF NOT EXISTS pecas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      preco_compra REAL NOT NULL,
      preco_venda REAL NOT NULL,
      quantidade INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Tabela de peças usadas em ordem de serviço
    db.run(`CREATE TABLE IF NOT EXISTS os_pecas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ordem_servico_id INTEGER,
      peca_id INTEGER,
      quantidade INTEGER,
      valor_unitario REAL,
      valor_total REAL,
      FOREIGN KEY (ordem_servico_id) REFERENCES ordem_servico (id),
      FOREIGN KEY (peca_id) REFERENCES pecas (id)
    )`);

    // Tabela financeira
    db.run(`CREATE TABLE IF NOT EXISTS financeiro (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT NOT NULL,
      descricao TEXT,
      valor REAL NOT NULL,
      data DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Tabela de agenda
    db.run(`CREATE TABLE IF NOT EXISTS agenda (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_nome TEXT NOT NULL,
      veiculo_modelo TEXT NOT NULL,
      veiculo_placa TEXT,
      servico TEXT,
      data DATE NOT NULL,
      hora TIME NOT NULL,
      observacoes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    
    // Inserir um usuário administrador padrão se não existir
    db.get(`SELECT * FROM usuarios WHERE email = 'admin@oficina.com'`, (err, row) => {
      if (!row) {
        // Senha: admin123 (em produção deveria ser criptografada)
        db.run(`INSERT INTO usuarios (nome, email, senha, cargo) VALUES ('Administrador', 'admin@oficina.com', 'admin123', 'admin')`);
      }
    });
  });
}

module.exports = {
  db,
  initializeDatabase
};
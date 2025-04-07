// server.js
const express = require('express');
const path = require('path');
const cors = require('cors');
const session = require('express-session');
const { initializeDatabase } = require('./src/database/config');

// Importação das rotas
const authRoutes = require('./src/routes/auth');
const ordemServicoRoutes = require('./src/routes/ordemServico');
const financeiroRoutes = require('./src/routes/financeiro');
const pecasRoutes = require('./src/routes/pecas');
const agendaRoutes = require('./src/routes/agenda');

const app = express();
const PORT = process.env.PORT || 3000;

// Inicialização do banco de dados
initializeDatabase();

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: 'oficina_mecanica_secret_key',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24 horas
}));

// Roteamento para o frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'dashboard.html'));
});

app.get('/ordem-servico', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'ordemServico.html'));
});

app.get('/historico', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'historico.html'));
});

app.get('/financeiro', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'financeiro.html'));
});

app.get('/pecas', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'pecas.html'));
});

app.get('/agenda', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'agenda.html'));
});

// Rotas da API
app.use('/api/auth', authRoutes);
app.use('/api/ordem-servico', ordemServicoRoutes);
app.use('/api/financeiro', financeiroRoutes);
app.use('/api/pecas', pecasRoutes);
app.use('/api/agenda', agendaRoutes);

// Iniciar o servidor
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
// src/controllers/financeiroController.js
const { db } = require('../database/config');

// Listar movimentações financeiras com filtros opcionais
function listarMovimentacoes(req, res) {
  const { 
    tipo, 
    data_inicio, 
    data_fim, 
    page = 1, 
    limit = 10 
  } = req.query;
  
  let query = 'SELECT * FROM financeiro WHERE 1=1';
  const params = [];
  
  // Aplicar filtros
  if (tipo) {
    query += ' AND tipo = ?';
    params.push(tipo);
  }
  
  if (data_inicio) {
    query += ' AND date(data) >= date(?)';
    params.push(data_inicio);
  }
  
  if (data_fim) {
    query += ' AND date(data) <= date(?)';
    params.push(data_fim);
  }
  
  // Ordenação e paginação
  const offset = (page - 1) * limit;
  query += ' ORDER BY data DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);
  
  db.all(query, params, (err, movimentacoes) => {
    if (err) {
      return res.status(500).json({ 
        mensagem: 'Erro ao listar movimentações financeiras', 
        erro: err.message 
      });
    }
    
    // Contar total de registros para paginação
    let countQuery = 'SELECT COUNT(*) as total FROM financeiro WHERE 1=1';
    const countParams = [...params];
    countParams.pop(); // Remove LIMIT
    countParams.pop(); // Remove OFFSET
    
    if (tipo) countQuery += ' AND tipo = ?';
    if (data_inicio) countQuery += ' AND date(data) >= date(?)';
    if (data_fim) countQuery += ' AND date(data) <= date(?)';
    
    db.get(countQuery, countParams, (err, row) => {
      if (err) {
        return res.status(500).json({ 
          mensagem: 'Erro ao contar movimentações financeiras', 
          erro: err.message 
        });
      }
      
      res.json({
        total: row.total,
        pagina_atual: parseInt(page),
        total_paginas: Math.ceil(row.total / limit),
        resultados: movimentacoes
      });
    });
  });
}

// Registrar nova movimentação financeira
function registrarMovimentacao(req, res) {
  const { tipo, descricao, valor } = req.body;
  
  // Validação básica
  if (!tipo || !descricao || !valor) {
    return res.status(400).json({ 
      mensagem: 'Tipo, descrição e valor são obrigatórios' 
    });
  }
  
  if (tipo !== 'entrada' && tipo !== 'saida') {
    return res.status(400).json({ 
      mensagem: 'Tipo deve ser "entrada" ou "saida"' 
    });
  }
  
  if (isNaN(valor) || parseFloat(valor) <= 0) {
    return res.status(400).json({ 
      mensagem: 'Valor deve ser um número positivo' 
    });
  }
  
  db.run(
    'INSERT INTO financeiro (tipo, descricao, valor) VALUES (?, ?, ?)',
    [tipo, descricao, parseFloat(valor)],
    function(err) {
      if (err) {
        return res.status(500).json({ 
          mensagem: 'Erro ao registrar movimentação financeira', 
          erro: err.message 
        });
      }
      
      res.status(201).json({
        mensagem: 'Movimentação financeira registrada com sucesso',
        id: this.lastID
      });
    }
  );
}

// Obter resumo financeiro por período
function obterResumoFinanceiro(req, res) {
  const { periodo = 'mes' } = req.query;
  
  let dataInicio, dataFim;
  const hoje = new Date();
  
  // Definir período de consulta
  switch (periodo) {
    case 'dia':
      dataInicio = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
      dataFim = hoje;
      break;
    case 'semana':
      dataInicio = new Date(hoje);
      dataInicio.setDate(hoje.getDate() - hoje.getDay());
      dataFim = hoje;
      break;
    case 'mes':
      dataInicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
      dataFim = hoje;
      break;
    case 'ano':
      dataInicio = new Date(hoje.getFullYear(), 0, 1);
      dataFim = hoje;
      break;
    default:
      dataInicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
      dataFim = hoje;
  }
  
  const inicioBusca = dataInicio.toISOString().split('T')[0];
  const fimBusca = dataFim.toISOString().split('T')[0];
  
  // Buscar entradas
  db.get(
    `SELECT COALESCE(SUM(valor), 0) as total
     FROM financeiro 
     WHERE tipo = 'entrada' AND date(data) BETWEEN date(?) AND date(?)`,
    [inicioBusca, fimBusca],
    (err, entradasRow) => {
      if (err) {
        return res.status(500).json({ 
          mensagem: 'Erro ao calcular entradas', 
          erro: err.message 
        });
      }
      
      // Buscar saídas
      db.get(
        `SELECT COALESCE(SUM(valor), 0) as total
         FROM financeiro 
         WHERE tipo = 'saida' AND date(data) BETWEEN date(?) AND date(?)`,
        [inicioBusca, fimBusca],
        (err, saidasRow) => {
          if (err) {
            return res.status(500).json({ 
              mensagem: 'Erro ao calcular saídas', 
              erro: err.message 
            });
          }
          
          // Calcular total de OSs e serviços por período
          db.get(
            `SELECT COUNT(*) as total_os, 
                    COUNT(CASE WHEN status = 'Finalizada' THEN 1 END) as os_finalizadas
             FROM ordem_servico
             WHERE date(data_criacao) BETWEEN date(?) AND date(?)`,
            [inicioBusca, fimBusca],
            (err, osRow) => {
              if (err) {
                return res.status(500).json({ 
                  mensagem: 'Erro ao calcular dados de OS', 
                  erro: err.message 
                });
              }
              
              const totalEntradas = entradasRow.total || 0;
              const totalSaidas = saidasRow.total || 0;
              const lucroLiquido = totalEntradas - totalSaidas;
              
              res.json({
                periodo: periodo,
                data_inicio: inicioBusca,
                data_fim: fimBusca,
                total_entradas: totalEntradas,
                total_saidas: totalSaidas,
                lucro_liquido: lucroLiquido,
                total_os: osRow.total_os,
                os_finalizadas: osRow.os_finalizadas
              });
            }
          );
        }
      );
    }
  );
}

// Excluir movimentação financeira
function excluirMovimentacao(req, res) {
  const { id } = req.params;
  
  db.get('SELECT * FROM financeiro WHERE id = ?', [id], (err, movimentacao) => {
    if (err) {
      return res.status(500).json({ 
        mensagem: 'Erro ao verificar movimentação financeira', 
        erro: err.message 
      });
    }
    
    if (!movimentacao) {
      return res.status(404).json({ mensagem: 'Movimentação financeira não encontrada' });
    }
    
    // Verificar se é uma movimentação automática de OS finalizada
    if (movimentacao.descricao.startsWith('Ordem de Serviço #')) {
      return res.status(400).json({ 
        mensagem: 'Não é possível excluir movimentações geradas automaticamente por OSs' 
      });
    }
    
    db.run('DELETE FROM financeiro WHERE id = ?', [id], function(err) {
      if (err) {
        return res.status(500).json({ 
          mensagem: 'Erro ao excluir movimentação financeira', 
          erro: err.message 
        });
      }
      
      res.json({ mensagem: 'Movimentação financeira excluída com sucesso' });
    });
  });
}

module.exports = {
  listarMovimentacoes,
  registrarMovimentacao,
  obterResumoFinanceiro,
  excluirMovimentacao
};
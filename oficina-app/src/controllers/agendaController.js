// src/controllers/agendaController.js
const { db } = require('../database/config');

// Listar agendamentos com filtros opcionais
function listarAgendamentos(req, res) {
  const { 
    cliente, 
    data_inicio, 
    data_fim, 
    page = 1, 
    limit = 10 
  } = req.query;
  
  let query = 'SELECT * FROM agenda WHERE 1=1';
  const params = [];
  
  // Aplicar filtros
  if (cliente) {
    query += ' AND cliente_nome LIKE ?';
    params.push(`%${cliente}%`);
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
  query += ' ORDER BY data ASC, hora ASC LIMIT ? OFFSET ?';
  params.push(limit, offset);
  
  db.all(query, params, (err, agendamentos) => {
    if (err) {
      return res.status(500).json({ 
        mensagem: 'Erro ao listar agendamentos', 
        erro: err.message 
      });
    }
    
    // Contar total de registros para paginação
    let countQuery = 'SELECT COUNT(*) as total FROM agenda WHERE 1=1';
    const countParams = [...params];
    countParams.pop(); // Remove LIMIT
    countParams.pop(); // Remove OFFSET
    
    if (cliente) countQuery += ' AND cliente_nome LIKE ?';
    if (data_inicio) countQuery += ' AND date(data) >= date(?)';
    if (data_fim) countQuery += ' AND date(data) <= date(?)';
    
    db.get(countQuery, countParams, (err, row) => {
      if (err) {
        return res.status(500).json({ 
          mensagem: 'Erro ao contar agendamentos', 
          erro: err.message 
        });
      }
      
      res.json({
        total: row.total,
        pagina_atual: parseInt(page),
        total_paginas: Math.ceil(row.total / limit),
        resultados: agendamentos
      });
    });
  });
}

// Obter agendamentos por dia
function listarAgendamentosPorDia(req, res) {
  const { data } = req.params;

  if (!data) {
    return res.status(400).json({ mensagem: 'Data é obrigatória' });
  }

  db.all(
    'SELECT * FROM agenda WHERE date(data) = date(?) ORDER BY hora ASC',
    [data],
    (err, agendamentos) => {
      if (err) {
        return res.status(500).json({ 
          mensagem: 'Erro ao listar agendamentos', 
          erro: err.message 
        });
      }
      
      res.json(agendamentos);
    }
  );
}

// Criar novo agendamento
function criarAgendamento(req, res) {
  const { 
    cliente_nome, 
    veiculo_modelo, 
    veiculo_placa, 
    servico, 
    data, 
    hora, 
    observacoes 
  } = req.body;
  
  // Validação básica
  if (!cliente_nome || !veiculo_modelo || !data || !hora || !servico) {
    return res.status(400).json({ 
      mensagem: 'Cliente, veículo, serviço, data e hora são obrigatórios' 
    });
  }
  
  // Validar formato da data (YYYY-MM-DD)
  const dataRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dataRegex.test(data)) {
    return res.status(400).json({ 
      mensagem: 'Formato de data inválido. Use o formato YYYY-MM-DD' 
    });
  }
  
  // Validar formato da hora (HH:MM)
  const horaRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
  if (!horaRegex.test(hora)) {
    return res.status(400).json({ 
      mensagem: 'Formato de hora inválido. Use o formato HH:MM' 
    });
  }
  
  // Verificar disponibilidade de horário
  db.get(
    'SELECT * FROM agenda WHERE data = ? AND hora = ?',
    [data, hora],
    (err, agendamentoExistente) => {
      if (err) {
        return res.status(500).json({ 
          mensagem: 'Erro ao verificar disponibilidade', 
          erro: err.message 
        });
      }
      
      if (agendamentoExistente) {
        return res.status(400).json({ 
          mensagem: 'Horário já agendado. Por favor, escolha outro horário.' 
        });
      }
      
      // Inserir novo agendamento
      db.run(
        `INSERT INTO agenda (
          cliente_nome, veiculo_modelo, veiculo_placa, 
          servico, data, hora, observacoes
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [cliente_nome, veiculo_modelo, veiculo_placa, servico, data, hora, observacoes || ''],
        function(err) {
          if (err) {
            return res.status(500).json({ 
              mensagem: 'Erro ao criar agendamento', 
              erro: err.message 
            });
          }
          
          res.status(201).json({
            mensagem: 'Agendamento criado com sucesso',
            id: this.lastID
          });
        }
      );
    }
  );
}

// Obter detalhes de um agendamento
function obterAgendamento(req, res) {
  const { id } = req.params;
  
  db.get('SELECT * FROM agenda WHERE id = ?', [id], (err, agendamento) => {
    if (err) {
      return res.status(500).json({ 
        mensagem: 'Erro ao buscar agendamento', 
        erro: err.message 
      });
    }
    
    if (!agendamento) {
      return res.status(404).json({ mensagem: 'Agendamento não encontrado' });
    }
    
    res.json(agendamento);
  });
}

// Atualizar um agendamento
function atualizarAgendamento(req, res) {
  const { id } = req.params;
  const { 
    cliente_nome, 
    veiculo_modelo, 
    veiculo_placa, 
    servico, 
    data, 
    hora, 
    observacoes 
  } = req.body;
  
  // Verificar se o agendamento existe
  db.get('SELECT * FROM agenda WHERE id = ?', [id], (err, agendamento) => {
    if (err) {
      return res.status(500).json({ 
        mensagem: 'Erro ao verificar agendamento', 
        erro: err.message 
      });
    }
    
    if (!agendamento) {
      return res.status(404).json({ mensagem: 'Agendamento não encontrado' });
    }
    
    // Verificar se o novo horário conflita com outro agendamento
    if (data && hora) {
      db.get(
        'SELECT * FROM agenda WHERE data = ? AND hora = ? AND id != ?',
        [data, hora, id],
        (err, conflito) => {
          if (err) {
            return res.status(500).json({ 
              mensagem: 'Erro ao verificar disponibilidade', 
              erro: err.message 
            });
          }
          
          if (conflito) {
            return res.status(400).json({ 
              mensagem: 'Horário já agendado. Por favor, escolha outro horário.' 
            });
          }
          
          executarAtualizacao();
        }
      );
    } else {
      executarAtualizacao();
    }
    
    function executarAtualizacao() {
      // Construir query de atualização dinâmica
      const campos = [];
      const valores = [];
      
      if (cliente_nome) {
        campos.push('cliente_nome = ?');
        valores.push(cliente_nome);
      }
      
      if (veiculo_modelo) {
        campos.push('veiculo_modelo = ?');
        valores.push(veiculo_modelo);
      }
      
      if (veiculo_placa) {
        campos.push('veiculo_placa = ?');
        valores.push(veiculo_placa);
      }
      
      if (servico) {
        campos.push('servico = ?');
        valores.push(servico);
      }
      
      if (data) {
        campos.push('data = ?');
        valores.push(data);
      }
      
      if (hora) {
        campos.push('hora = ?');
        valores.push(hora);
      }
      
      if (observacoes !== undefined) {
        campos.push('observacoes = ?');
        valores.push(observacoes);
      }
      
      if (campos.length === 0) {
        return res.status(400).json({ mensagem: 'Nenhum dado fornecido para atualização' });
      }
      
      // Adicionar ID para WHERE
      valores.push(id);
      
      // Executar update
      db.run(
        `UPDATE agenda SET ${campos.join(', ')} WHERE id = ?`,
        valores,
        function(err) {
          if (err) {
            return res.status(500).json({ 
              mensagem: 'Erro ao atualizar agendamento', 
              erro: err.message 
            });
          }
          
          res.json({ 
            mensagem: 'Agendamento atualizado com sucesso', 
            id: id 
          });
        }
      );
    }
  });
}

// Excluir um agendamento
function excluirAgendamento(req, res) {
  const { id } = req.params;
  
  // Verificar se o agendamento existe
  db.get('SELECT * FROM agenda WHERE id = ?', [id], (err, agendamento) => {
    if (err) {
      return res.status(500).json({ 
        mensagem: 'Erro ao verificar agendamento', 
        erro: err.message 
      });
    }
    
    if (!agendamento) {
      return res.status(404).json({ mensagem: 'Agendamento não encontrado' });
    }
    
    // Excluir agendamento
    db.run('DELETE FROM agenda WHERE id = ?', [id], function(err) {
      if (err) {
        return res.status(500).json({ 
          mensagem: 'Erro ao excluir agendamento', 
          erro: err.message 
        });
      }
      
      res.json({ mensagem: 'Agendamento excluído com sucesso' });
    });
  });
}

// Converter agendamento em ordem de serviço
function converterEmOrdemServico(req, res) {
  const { id } = req.params;
  
  // Buscar informações do agendamento
  db.get('SELECT * FROM agenda WHERE id = ?', [id], (err, agendamento) => {
    if (err) {
      return res.status(500).json({ 
        mensagem: 'Erro ao buscar agendamento', 
        erro: err.message 
      });
    }
    
    if (!agendamento) {
      return res.status(404).json({ mensagem: 'Agendamento não encontrado' });
    }
    
    // Criar ordem de serviço com base no agendamento
    db.run(
      `INSERT INTO ordem_servico (
        cliente_nome, veiculo_modelo, veiculo_placa, 
        tipo_servico, descricao, valor_mao_obra, valor_pecas, valor_total
      ) VALUES (?, ?, ?, ?, ?, 0, 0, 0)`,
      [
        agendamento.cliente_nome,
        agendamento.veiculo_modelo,
        agendamento.veiculo_placa,
        agendamento.servico,
        agendamento.observacoes || ''
      ],
      function(err) {
        if (err
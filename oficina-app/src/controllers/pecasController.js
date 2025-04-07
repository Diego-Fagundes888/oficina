// src/controllers/pecasController.js
const { db } = require('../database/config');

// Listar todas as peças com filtros opcionais
function listarPecas(req, res) {
  const { 
    nome, 
    estoque_min, 
    estoque_max, 
    page = 1, 
    limit = 10 
  } = req.query;
  
  let query = 'SELECT * FROM pecas WHERE 1=1';
  const params = [];
  
  // Aplicar filtros
  if (nome) {
    query += ' AND nome LIKE ?';
    params.push(`%${nome}%`);
  }
  
  if (estoque_min) {
    query += ' AND quantidade >= ?';
    params.push(estoque_min);
  }
  
  if (estoque_max) {
    query += ' AND quantidade <= ?';
    params.push(estoque_max);
  }
  
  // Ordenação e paginação
  const offset = (page - 1) * limit;
  query += ' ORDER BY nome ASC LIMIT ? OFFSET ?';
  params.push(limit, offset);
  
  db.all(query, params, (err, pecas) => {
    if (err) {
      return res.status(500).json({ 
        mensagem: 'Erro ao listar peças', 
        erro: err.message 
      });
    }
    
    // Contar total de registros para paginação
    let countQuery = 'SELECT COUNT(*) as total FROM pecas WHERE 1=1';
    const countParams = [...params];
    countParams.pop(); // Remove LIMIT
    countParams.pop(); // Remove OFFSET
    
    if (nome) countQuery += ' AND nome LIKE ?';
    if (estoque_min) countQuery += ' AND quantidade >= ?';
    if (estoque_max) countQuery += ' AND quantidade <= ?';
    
    db.get(countQuery, countParams, (err, row) => {
      if (err) {
        return res.status(500).json({ 
          mensagem: 'Erro ao contar peças', 
          erro: err.message 
        });
      }
      
      res.json({
        total: row.total,
        pagina_atual: parseInt(page),
        total_paginas: Math.ceil(row.total / limit),
        resultados: pecas
      });
    });
  });
}

// Cadastrar nova peça
function cadastrarPeca(req, res) {
  const { 
    nome, 
    preco_compra, 
    preco_venda, 
    quantidade = 0 
  } = req.body;
  
  // Validação básica
  if (!nome || !preco_compra || !preco_venda) {
    return res.status(400).json({ 
      mensagem: 'Nome, preço de compra e preço de venda são obrigatórios' 
    });
  }
  
  if (isNaN(preco_compra) || parseFloat(preco_compra) <= 0) {
    return res.status(400).json({ 
      mensagem: 'Preço de compra deve ser um número positivo' 
    });
  }
  
  if (isNaN(preco_venda) || parseFloat(preco_venda) <= 0) {
    return res.status(400).json({ 
      mensagem: 'Preço de venda deve ser um número positivo' 
    });
  }
  
  // Verificar se a peça já existe
  db.get('SELECT * FROM pecas WHERE nome = ?', [nome], (err, peca) => {
    if (err) {
      return res.status(500).json({ 
        mensagem: 'Erro ao verificar peça existente', 
        erro: err.message 
      });
    }
    
    if (peca) {
      return res.status(400).json({ 
        mensagem: 'Já existe uma peça cadastrada com este nome' 
      });
    }
    
    // Inserir nova peça
    db.run(
      'INSERT INTO pecas (nome, preco_compra, preco_venda, quantidade) VALUES (?, ?, ?, ?)',
      [nome, parseFloat(preco_compra), parseFloat(preco_venda), parseInt(quantidade)],
      function(err) {
        if (err) {
          return res.status(500).json({ 
            mensagem: 'Erro ao cadastrar peça', 
            erro: err.message 
          });
        }
        
        // Se houver entrada de estoque, registrar no financeiro
        if (parseInt(quantidade) > 0) {
          const valorTotal = parseFloat(preco_compra) * parseInt(quantidade);
          
          db.run(
            'INSERT INTO financeiro (tipo, descricao, valor) VALUES (?, ?, ?)',
            ['saida', `Compra inicial: ${quantidade} unidades de ${nome}`, valorTotal],
            function(err) {
              if (err) {
                console.error('Erro ao registrar saída financeira:', err);
              }
            }
          );
        }
        
        res.status(201).json({
          mensagem: 'Peça cadastrada com sucesso',
          id: this.lastID
        });
      }
    );
  });
}

// Obter detalhes de uma peça específica
function obterPeca(req, res) {
  const { id } = req.params;
  
  db.get('SELECT * FROM pecas WHERE id = ?', [id], (err, peca) => {
    if (err) {
      return res.status(500).json({ 
        mensagem: 'Erro ao buscar peça', 
        erro: err.message 
      });
    }
    
    if (!peca) {
      return res.status(404).json({ mensagem: 'Peça não encontrada' });
    }
    
    // Buscar histórico de uso da peça em OSs
    db.all(`
      SELECT op.*, os.cliente_nome, os.data_criacao
      FROM os_pecas op
      JOIN ordem_servico os ON op.ordem_servico_id = os.id
      WHERE op.peca_id = ?
      ORDER BY os.data_criacao DESC
      LIMIT 10
    `, [id], (err, historico) => {
      if (err) {
        return res.status(500).json({ 
          mensagem: 'Erro ao buscar histórico da peça', 
          erro: err.message 
        });
      }
      
      res.json({
        ...peca,
        historico: historico || []
      });
    });
  });
}

// Atualizar dados de uma peça
function atualizarPeca(req, res) {
  const { id } = req.params;
  const { 
    nome, 
    preco_compra, 
    preco_venda 
  } = req.body;
  
  // Validação básica
  if (!nome && !preco_compra && !preco_venda) {
    return res.status(400).json({ 
      mensagem: 'Nenhum dado fornecido para atualização' 
    });
  }
  
  // Verificar se a peça existe
  db.get('SELECT * FROM pecas WHERE id = ?', [id], (err, peca) => {
    if (err) {
      return res.status(500).json({ 
        mensagem: 'Erro ao verificar peça', 
        erro: err.message 
      });
    }
    
    if (!peca) {
      return res.status(404).json({ mensagem: 'Peça não encontrada' });
    }
    
    // Verificar se o novo nome já existe em outra peça
    if (nome && nome !== peca.nome) {
      db.get('SELECT * FROM pecas WHERE nome = ? AND id != ?', [nome, id], (err, pecaExistente) => {
        if (err) {
          return res.status(500).json({ 
            mensagem: 'Erro ao verificar nome da peça', 
            erro: err.message 
          });
        }
        
        if (pecaExistente) {
          return res.status(400).json({ 
            mensagem: 'Já existe outra peça com este nome' 
          });
        }
        
        executarAtualizacao();
      });
    } else {
      executarAtualizacao();
    }
    
    function executarAtualizacao() {
      // Construir query de atualização dinâmica
      const campos = [];
      const valores = [];
      
      if (nome) {
        campos.push('nome = ?');
        valores.push(nome);
      }
      
      if (preco_compra) {
        campos.push('preco_compra = ?');
        valores.push(parseFloat(preco_compra));
      }
      
      if (preco_venda) {
        campos.push('preco_venda = ?');
        valores.push(parseFloat(preco_venda));
      }
      
      // Adicionar ID para WHERE
      valores.push(id);
      
      // Executar update
      db.run(
        `UPDATE pecas SET ${campos.join(', ')} WHERE id = ?`,
        valores,
        function(err) {
          if (err) {
            return res.status(500).json({ 
              mensagem: 'Erro ao atualizar peça', 
              erro: err.message 
            });
          }
          
          res.json({ 
            mensagem: 'Peça atualizada com sucesso', 
            id: id 
          });
        }
      );
    }
  });
}

// Atualizar estoque de uma peça
function atualizarEstoque(req, res) {
  const { id } = req.params;
  const { 
    quantidade, 
    operacao, 
    motivo 
  } = req.body;
  
  // Validação básica
  if (!quantidade || !operacao) {
    return res.status(400).json({ 
      mensagem: 'Quantidade e tipo de operação são obrigatórios' 
    });
  }
  
  if (isNaN(quantidade) || parseInt(quantidade) <= 0) {
    return res.status(400).json({ 
      mensagem: 'Quantidade deve ser um número inteiro positivo' 
    });
  }
  
  if (operacao !== 'entrada' && operacao !== 'saida') {
    return res.status(400).json({ 
      mensagem: 'Operação deve ser "entrada" ou "saida"' 
    });
  }
  
  // Verificar se a peça existe
  db.get('SELECT * FROM pecas WHERE id = ?', [id], (err, peca) => {
    if (err) {
      return res.status(500).json({ 
        mensagem: 'Erro ao verificar peça', 
        erro: err.message 
      });
    }
    
    if (!peca) {
      return res.status(404).json({ mensagem: 'Peça não encontrada' });
    }
    
    // Calcular nova quantidade
    let novaQuantidade;
    if (operacao === 'entrada') {
      novaQuantidade = peca.quantidade + parseInt(quantidade);
    } else {
      novaQuantidade = peca.quantidade - parseInt(quantidade);
      
      // Verificar se há estoque suficiente
      if (novaQuantidade < 0) {
        return res.status(400).json({ 
          mensagem: 'Estoque insuficiente para esta operação' 
        });
      }
    }
    
    // Iniciar transação
    db.serialize(() => {
      db.run('BEGIN TRANSACTION');
      
      // Atualizar estoque
      db.run(
        'UPDATE pecas SET quantidade = ? WHERE id = ?',
        [novaQuantidade, id],
        function(err) {
          if (err) {
            db.run('ROLLBACK');
            return res.status(500).json({ 
              mensagem: 'Erro ao atualizar estoque', 
              erro: err.message 
            });
          }
          
          // Registrar movimentação financeira se for entrada de estoque
          if (operacao === 'entrada') {
            const valorTotal = parseFloat(peca.preco_compra) * parseInt(quantidade);
            
            db.run(
              'INSERT INTO financeiro (tipo, descricao, valor) VALUES (?, ?, ?)',
              ['saida', motivo || `Compra de ${quantidade} unidades de ${peca.nome}`, valorTotal],
              function(err) {
                if (err) {
                  db.run('ROLLBACK');
                  return res.status(500).json({ 
                    mensagem: 'Erro ao registrar movimentação financeira', 
                    erro: err.message 
                  });
                }
                
                db.run('COMMIT');
                res.json({
                  mensagem: 'Estoque atualizado com sucesso',
                  quantidade_anterior: peca.quantidade,
                  quantidade_atual: novaQuantidade,
                  operacao: operacao
                });
              }
            );
          } else {
            // Se for saída manual, não precisa registrar financeiro (já é feito em OSs)
            db.run('COMMIT');
            res.json({
              mensagem: 'Estoque atualizado com sucesso',
              quantidade_anterior: peca.quantidade,
              quantidade_atual: novaQuantidade,
              operacao: operacao
            });
          }
        }
      );
    });
  });
}

// Excluir uma peça
function excluirPeca(req, res) {
  const { id } = req.params;
  
  // Verificar se a peça existe
  db.get('SELECT * FROM pecas WHERE id = ?', [id], (err, peca) => {
    if (err) {
      return res.status(500).json({ 
        mensagem: 'Erro ao verificar peça', 
        erro: err.message 
      });
    }
    
    if (!peca) {
      return res.status(404).json({ mensagem: 'Peça não encontrada' });
    }
    
    // Verificar se a peça está sendo usada em alguma OS
    db.get('SELECT COUNT(*) as total FROM os_pecas WHERE peca_id = ?', [id], (err, result) => {
      if (err) {
        return res.status(500).json({ 
          mensagem: 'Erro ao verificar uso da peça', 
          erro: err.message 
        });
      }
      
      if (result.total > 0) {
        return res.status(400).json({ 
          mensagem: 'Não é possível excluir a peça pois ela está sendo usada em ordens de serviço' 
        });
      }
      
      // Excluir a peça
      db.run('DELETE FROM pecas WHERE id = ?', [id], function(err) {
        if (err) {
          return res.status(500).json({ 
            mensagem: 'Erro ao excluir peça', 
            erro: err.message 
          });
        }
        
        res.json({ mensagem: 'Peça excluída com sucesso' });
      });
    });
  });
}

module.exports = {
  listarPecas,
  cadastrarPeca,
  obterPeca,
  atualizarPeca,
  atualizarEstoque,
  excluirPeca
};
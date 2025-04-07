// src/controllers/ordemServicoController.js
const { db } = require('../database/config');

// Criar uma nova ordem de serviço
function criarOrdemServico(req, res) {
  const {
    cliente_nome,
    veiculo_modelo,
    veiculo_ano,
    veiculo_placa,
    tipo_servico,
    descricao,
    valor_mao_obra,
    pecas
  } = req.body;

  // Validação básica
  if (!cliente_nome || !veiculo_modelo || !veiculo_placa || !tipo_servico) {
    return res.status(400).json({ mensagem: 'Dados obrigatórios não fornecidos' });
  }

  // Inicia transação
  db.serialize(() => {
    db.run('BEGIN TRANSACTION');

    // 1. Inserir a OS
    db.run(
      `INSERT INTO ordem_servico (
        cliente_nome, veiculo_modelo, veiculo_ano, veiculo_placa, 
        tipo_servico, descricao, valor_mao_obra, valor_pecas, valor_total
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
      [
        cliente_nome, veiculo_modelo, veiculo_ano, veiculo_placa, 
        tipo_servico, descricao, valor_mao_obra || 0, valor_mao_obra || 0
      ],
      function(err) {
        if (err) {
          db.run('ROLLBACK');
          return res.status(500).json({ mensagem: 'Erro ao criar ordem de serviço', erro: err.message });
        }

        const ordemServicoId = this.lastID;
        let valorTotalPecas = 0;

        // 2. Se não há peças, finalizamos a transação aqui
        if (!pecas || pecas.length === 0) {
          db.run('COMMIT');
          return res.status(201).json({ 
            mensagem: 'Ordem de serviço criada com sucesso', 
            id: ordemServicoId 
          });
        }

        // Contador para gerenciar processamento assíncrono das peças
        let processadas = 0;
        
        // 3. Processar cada peça
        pecas.forEach(peca => {
          // Calcular o valor total da peça
          const valorPeca = (peca.valor_unitario || 0) * (peca.quantidade || 0);
          valorTotalPecas += valorPeca;
          
          // Inserir relação de peça na OS
          db.run(
            `INSERT INTO os_pecas (
              ordem_servico_id, peca_id, quantidade, valor_unitario, valor_total
            ) VALUES (?, ?, ?, ?, ?)`,
            [
              ordemServicoId, peca.id, peca.quantidade, 
              peca.valor_unitario, valorPeca
            ],
            function(err) {
              if (err) {
                db.run('ROLLBACK');
                return res.status(500).json({ 
                  mensagem: 'Erro ao adicionar peças à OS', 
                  erro: err.message 
                });
              }
              
              // Atualizar estoque da peça
              db.run(
                'UPDATE pecas SET quantidade = quantidade - ? WHERE id = ?',
                [peca.quantidade, peca.id],
                function(err) {
                  if (err) {
                    db.run('ROLLBACK');
                    return res.status(500).json({ 
                      mensagem: 'Erro ao atualizar estoque', 
                      erro: err.message 
                    });
                  }
                  
                  processadas++;
                  
                  // Todas as peças foram processadas? 
                  if (processadas === pecas.length) {
                    // Atualizar o valor total da OS
                    const valorTotal = parseFloat(valor_mao_obra || 0) + valorTotalPecas;
                    
                    db.run(
                      'UPDATE ordem_servico SET valor_pecas = ?, valor_total = ? WHERE id = ?',
                      [valorTotalPecas, valorTotal, ordemServicoId],
                      function(err) {
                        if (err) {
                          db.run('ROLLBACK');
                          return res.status(500).json({ 
                            mensagem: 'Erro ao atualizar valores da OS', 
                            erro: err.message 
                          });
                        }
                        
                        db.run('COMMIT');
                        res.status(201).json({ 
                          mensagem: 'Ordem de serviço criada com sucesso', 
                          id: ordemServicoId 
                        });
                      }
                    );
                  }
                }
              );
            }
          );
        });
      }
    );
  });
}

// Listar todas as ordens de serviço com filtros opcionais
function listarOrdensServico(req, res) {
  const { 
    cliente, placa, status, 
    data_inicio, data_fim, 
    page = 1, limit = 10 
  } = req.query;
  
  let query = 'SELECT * FROM ordem_servico WHERE 1=1';
  const params = [];
  
  // Aplicar filtros
  if (cliente) {
    query += ' AND cliente_nome LIKE ?';
    params.push(`%${cliente}%`);
  }
  
  if (placa) {
    query += ' AND veiculo_placa LIKE ?';
    params.push(`%${placa}%`);
  }
  
  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }
  
  if (data_inicio) {
    query += ' AND date(data_criacao) >= date(?)';
    params.push(data_inicio);
  }
  
  if (data_fim) {
    query += ' AND date(data_criacao) <= date(?)';
    params.push(data_fim);
  }
  
  // Ordenação e paginação
  const offset = (page - 1) * limit;
  query += ' ORDER BY data_criacao DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);
  
  db.all(query, params, (err, ordensServico) => {
    if (err) {
      return res.status(500).json({ 
        mensagem: 'Erro ao listar ordens de serviço', 
        erro: err.message 
      });
    }
    
    // Contar total de registros para paginação
    let countQuery = `SELECT COUNT(*) as total FROM ordem_servico WHERE 1=1`;
    const countParams = [...params];
    countParams.pop(); // Remove LIMIT
    countParams.pop(); // Remove OFFSET
    
    if (cliente) countQuery += ' AND cliente_nome LIKE ?';
    if (placa) countQuery += ' AND veiculo_placa LIKE ?';
    if (status) countQuery += ' AND status = ?';
    if (data_inicio) countQuery += ' AND date(data_criacao) >= date(?)';
    if (data_fim) countQuery += ' AND date(data_criacao) <= date(?)';
    
    db.get(countQuery, countParams, (err, row) => {
      if (err) {
        return res.status(500).json({ 
          mensagem: 'Erro ao contar ordens de serviço', 
          erro: err.message 
        });
      }
      
      res.json({
        total: row.total,
        pagina_atual: page,
        total_paginas: Math.ceil(row.total / limit),
        resultados: ordensServico
      });
    });
  });
}

// Obter uma ordem de serviço específica com suas peças
function obterOrdemServico(req, res) {
  const { id } = req.params;
  
  // Buscar OS
  db.get('SELECT * FROM ordem_servico WHERE id = ?', [id], (err, ordemServico) => {
    if (err) {
      return res.status(500).json({ 
        mensagem: 'Erro ao buscar ordem de serviço', 
        erro: err.message 
      });
    }
    
    if (!ordemServico) {
      return res.status(404).json({ mensagem: 'Ordem de serviço não encontrada' });
    }
    
    // Buscar peças associadas
    db.all(`
      SELECT op.*, p.nome as peca_nome
      FROM os_pecas op
      JOIN pecas p ON op.peca_id = p.id
      WHERE op.ordem_servico_id = ?
    `, [id], (err, pecas) => {
      if (err) {
        return res.status(500).json({ 
          mensagem: 'Erro ao buscar peças da OS', 
          erro: err.message 
        });
      }
      
      // Retornar OS com peças
      res.json({
        ...ordemServico,
        pecas: pecas || []
      });
    });
  });
}

// Atualizar uma ordem de serviço
function atualizarOrdemServico(req, res) {
  const { id } = req.params;
  const {
    cliente_nome,
    veiculo_modelo,
    veiculo_ano,
    veiculo_placa,
    tipo_servico,
    descricao,
    valor_mao_obra,
    status,
    pecas
  } = req.body;
  
  // Verificar se a OS existe
  db.get('SELECT * FROM ordem_servico WHERE id = ?', [id], (err, ordemServico) => {
    if (err) {
      return res.status(500).json({ 
        mensagem: 'Erro ao verificar ordem de serviço', 
        erro: err.message 
      });
    }
    
    if (!ordemServico) {
      return res.status(404).json({ mensagem: 'Ordem de serviço não encontrada' });
    }
    
    // Não atualizar se a OS já foi finalizada
    if (ordemServico.status === 'Finalizada' && status !== 'Finalizada') {
      return res.status(400).json({ 
        mensagem: 'Não é possível modificar uma ordem de serviço finalizada' 
      });
    }
    
    // Inicia transação
    db.serialize(() => {
      db.run('BEGIN TRANSACTION');
      
      // 1. Atualizar os dados básicos da OS
      db.run(`
        UPDATE ordem_servico
        SET cliente_nome = ?, veiculo_modelo = ?, veiculo_ano = ?,
            veiculo_placa = ?, tipo_servico = ?, descricao = ?,
            valor_mao_obra = ?, status = ?
        WHERE id = ?
      `, [
        cliente_nome || ordemServico.cliente_nome,
        veiculo_modelo || ordemServico.veiculo_modelo,
        veiculo_ano || ordemServico.veiculo_ano,
        veiculo_placa || ordemServico.veiculo_placa,
        tipo_servico || ordemServico.tipo_servico,
        descricao || ordemServico.descricao,
        valor_mao_obra || ordemServico.valor_mao_obra,
        status || ordemServico.status,
        id
      ], function(err) {
        if (err) {
          db.run('ROLLBACK');
          return res.status(500).json({ 
            mensagem: 'Erro ao atualizar ordem de serviço', 
            erro: err.message 
          });
        }
        
        // Se não há alteração nas peças, finalizamos a transação
        if (!pecas || pecas.length === 0) {
          db.run('COMMIT');
          return res.json({ 
            mensagem: 'Ordem de serviço atualizada com sucesso', 
            id: id 
          });
        }
        
        // 2. Recuperar peças anteriores para atualizar estoque
        db.all('SELECT * FROM os_pecas WHERE ordem_servico_id = ?', [id], (err, pecasAnteriores) => {
          if (err) {
            db.run('ROLLBACK');
            return res.status(500).json({ 
              mensagem: 'Erro ao buscar peças anteriores', 
              erro: err.message 
            });
          }
          
          // 3. Devolver peças ao estoque
          let pecasProcessadas = 0;
          
          if (pecasAnteriores.length === 0) {
            // Não havia peças anteriores, prosseguir
            atualizarNovasPecas();
          } else {
            pecasAnteriores.forEach(peca => {
              db.run(
                'UPDATE pecas SET quantidade = quantidade + ? WHERE id = ?',
                [peca.quantidade, peca.peca_id],
                function(err) {
                  if (err) {
                    db.run('ROLLBACK');
                    return res.status(500).json({ 
                      mensagem: 'Erro ao devolver peças ao estoque', 
                      erro: err.message 
                    });
                  }
                  
                  pecasProcessadas++;
                  if (pecasProcessadas === pecasAnteriores.length) {
                    // 4. Remover peças antigas da OS
                    db.run(
                      'DELETE FROM os_pecas WHERE ordem_servico_id = ?',
                      [id],
                      function(err) {
                        if (err) {
                          db.run('ROLLBACK');
                          return res.status(500).json({ 
                            mensagem: 'Erro ao remover peças antigas', 
                            erro: err.message 
                          });
                        }
                        
                        // 5. Prosseguir com a atualização das novas peças
                        atualizarNovasPecas();
                      }
                    );
                }
            }
          );
        });
      }
      
      // Função para adicionar novas peças
      function atualizarNovasPecas() {
        let valorTotalPecas = 0;
        let pecasAdicionadas = 0;
        
        // Adicionar novas peças
        pecas.forEach(peca => {
          const valorPeca = (peca.valor_unitario || 0) * (peca.quantidade || 0);
          valorTotalPecas += valorPeca;
          
          // Inserir peça na OS
          db.run(
            `INSERT INTO os_pecas (
              ordem_servico_id, peca_id, quantidade, valor_unitario, valor_total
            ) VALUES (?, ?, ?, ?, ?)`,
            [id, peca.id, peca.quantidade, peca.valor_unitario, valorPeca],
            function(err) {
              if (err) {
                db.run('ROLLBACK');
                return res.status(500).json({ 
                  mensagem: 'Erro ao adicionar peças à OS', 
                  erro: err.message 
                });
              }
              
              // Atualizar estoque
              db.run(
                'UPDATE pecas SET quantidade = quantidade - ? WHERE id = ?',
                [peca.quantidade, peca.id],
                function(err) {
                  if (err) {
                    db.run('ROLLBACK');
                    return res.status(500).json({ 
                      mensagem: 'Erro ao atualizar estoque', 
                      erro: err.message 
                    });
                  }
                  
                  pecasAdicionadas++;
                  
                  if (pecasAdicionadas === pecas.length) {
                    // Todas as peças foram processadas, atualizar total da OS
                    const valorTotal = parseFloat(valor_mao_obra || ordemServico.valor_mao_obra) + valorTotalPecas;
                    
                    db.run(
                      'UPDATE ordem_servico SET valor_pecas = ?, valor_total = ? WHERE id = ?',
                      [valorTotalPecas, valorTotal, id],
                      function(err) {
                        if (err) {
                          db.run('ROLLBACK');
                          return res.status(500).json({ 
                            mensagem: 'Erro ao atualizar valores da OS', 
                            erro: err.message 
                          });
                        }
                        
                        // Finalizar transação
                        db.run('COMMIT');
                        res.json({ 
                          mensagem: 'Ordem de serviço atualizada com sucesso', 
                          id: id 
                        });
                      }
                    );
                  }
                }
              );
            }
          );
        });
      }
    });
  });
});
});
}

// Excluir uma ordem de serviço
function excluirOrdemServico(req, res) {
const { id } = req.params;

// Verificar se a OS existe
db.get('SELECT * FROM ordem_servico WHERE id = ?', [id], (err, ordemServico) => {
if (err) {
  return res.status(500).json({ 
    mensagem: 'Erro ao verificar ordem de serviço', 
    erro: err.message 
  });
}

if (!ordemServico) {
  return res.status(404).json({ mensagem: 'Ordem de serviço não encontrada' });
}

// Não excluir se a OS já foi finalizada
if (ordemServico.status === 'Finalizada') {
  return res.status(400).json({ 
    mensagem: 'Não é possível excluir uma ordem de serviço finalizada' 
  });
}

// Iniciar transação
db.serialize(() => {
  db.run('BEGIN TRANSACTION');
  
  // 1. Recuperar peças para devolver ao estoque
  db.all('SELECT * FROM os_pecas WHERE ordem_servico_id = ?', [id], (err, pecas) => {
    if (err) {
      db.run('ROLLBACK');
      return res.status(500).json({ 
        mensagem: 'Erro ao buscar peças da OS', 
        erro: err.message 
      });
    }
    
    // 2. Se não há peças, excluir diretamente
    if (pecas.length === 0) {
      excluirOS();
      return;
    }
    
    // 3. Devolver peças ao estoque
    let pecasProcessadas = 0;
    
    pecas.forEach(peca => {
      db. run(
        'UPDATE pecas SET quantidade = quantidade + ? WHERE id = ?',
        [peca.quantidade, peca.peca_id],
        function(err) {
          if (err) {
            db.run('ROLLBACK');
            return res.status(500).json({ 
              mensagem: 'Erro ao devolver peças ao estoque', 
              erro: err.message 
            });
          }
          
          pecasProcessadas++;
          
          if (pecasProcessadas === pecas.length) {
            // 4. Excluir relacionamento de peças
            db.run(
              'DELETE FROM os_pecas WHERE ordem_servico_id = ?',
              [id],
              function(err) {
                if (err) {
                  db.run('ROLLBACK');
                  return res.status(500).json({ 
                    mensagem: 'Erro ao excluir peças da OS', 
                    erro: err.message 
                  });
                }
                
                // 5. Prosseguir com exclusão da OS
                excluirOS();
              }
            );
          }
        }
      );
    });
  });
  
  // Função para excluir a OS
  function excluirOS() {
    db.run('DELETE FROM ordem_servico WHERE id = ?', [id], function(err) {
      if (err) {
        db.run('ROLLBACK');
        return res.status(500).json({ 
          mensagem: 'Erro ao excluir ordem de serviço', 
          erro: err.message 
        });
      }
      
      // Finalizar transação
      db.run('COMMIT');
      res.json({ mensagem: 'Ordem de serviço excluída com sucesso' });
    });
  }
});
});
}

// Finalizar uma ordem de serviço
function finalizarOrdemServico(req, res) {
const { id } = req.params;

// Verificar se a OS existe
db.get('SELECT * FROM ordem_servico WHERE id = ?', [id], (err, ordemServico) => {
if (err) {
  return res.status(500).json({ 
    mensagem: 'Erro ao verificar ordem de serviço', 
    erro: err.message 
  });
}

if (!ordemServico) {
  return res.status(404).json({ mensagem: 'Ordem de serviço não encontrada' });
}

// Verificar se já está finalizada
if (ordemServico.status === 'Finalizada') {
  return res.status(400).json({ mensagem: 'Ordem de serviço já finalizada' });
}

// Atualizar status e data de finalização
db.run(
  `UPDATE ordem_servico 
   SET status = 'Finalizada', data_finalizacao = CURRENT_TIMESTAMP 
   WHERE id = ?`,
  [id],
  function(err) {
    if (err) {
      return res.status(500).json({ 
        mensagem: 'Erro ao finalizar ordem de serviço', 
        erro: err.message 
      });
    }
    
    // Registrar entrada financeira
    db.run(
      `INSERT INTO financeiro (tipo, descricao, valor) 
       VALUES ('entrada', ?, ?)`,
      [`Ordem de Serviço #${id}`, ordemServico.valor_total],
      function(err) {
        if (err) {
          return res.status(500).json({ 
            mensagem: 'Erro ao registrar receita', 
            erro: err.message 
          });
        }
        
        res.json({ 
          mensagem: 'Ordem de serviço finalizada com sucesso',
          id: id
        });
      }
    );
  }
);
});
}

module.exports = {
criarOrdemServico,
listarOrdensServico,
obterOrdemServico,
atualizarOrdemServico,
excluirOrdemServico,
finalizarOrdemServico
};
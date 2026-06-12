require('dotenv').config();
const express = require('express');
const cors = require('cors');
const serverless = require('serverless-http'); // Importante para rodar Express na Vercel
const { createClient } = require('@supabase/supabase-js');

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Inicializa o cliente do Supabase no Backend
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const usesPublishableKey = typeof supabaseKey === 'string' && supabaseKey.includes('publishable');

if (!supabaseUrl || !supabaseKey) {
    console.error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY/SUPABASE_KEY precisam estar definidos no .env');
}

const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }
});

function normalizeNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function pickFirst(obj, keys) {
    for (const key of keys) {
        if (obj[key] !== undefined && obj[key] !== null && obj[key] !== '') {
            return obj[key];
        }
    }
    return undefined;
}

function isSupabasePermissionError(error) {
    const message = (error?.message || '').toLowerCase();
    return message.includes('permission denied')
        || message.includes('row level security')
        || message.includes('rls')
        || message.includes('jwt')
        || message.includes('not allowed');
}

// ==========================================
// ROTA 1: BUSCAR TODOS OS PRODUTOS DISPONÍVEIS
// ==========================================
app.get('/api/produtos', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('produtos1')
            .select('*')
            .eq('status', 'disponivel')
            .order('created_at', { ascending: false });

        if (error) throw error;
        
        return res.status(200).json(data);
    } catch (error) {
        return res.status(500).json({ error: 'Erro ao buscar produtos', details: error.message });
    }
});

// ==========================================
// ROTAS PARA CARRINHO
// ==========================================
app.post('/api/carrinho', async (req, res) => {
    try {
        const body = req.body || {};
        const produtoId = pickFirst(body, ['produtoId', 'produto_id', 'id', 'productId']);
        const compradorId = pickFirst(body, ['compradorId', 'comprador_id', 'usuarioId', 'userId']);
        const vendedorId = pickFirst(body, ['vendedorId', 'vendedor_id']);
        const quantidade = normalizeNumber(pickFirst(body, ['quantidade', 'quantity', 'qtd']) ?? 1);
        const valorUnitario = normalizeNumber(pickFirst(body, ['valorUnitario', 'valor_unitario', 'preco', 'price']) ?? 0);
        const valorTotal = normalizeNumber(pickFirst(body, ['valorTotal', 'valor_total']) ?? (valorUnitario * quantidade));

        if (!produtoId) {
            return res.status(400).json({ error: 'ID do produto é obrigatório.' });
        }

        if (usesPublishableKey) {
            return res.status(500).json({
                error: 'Chave do Supabase inválida para escrita.',
                details: 'O valor atual de SUPABASE_KEY está como chave publishable. Para adicionar ao carrinho e finalizar compra, use a chave service_role do Supabase no arquivo .env.'
            });
        }

        const { data, error } = await supabase
            .from('carrinho')
            .insert([
                {
                    produto_id: produtoId,
                    comprador_id: compradorId || null,
                    vendedor_id: vendedorId || null,
                    quantidade: quantidade > 0 ? quantidade : 1,
                    valor_unitario: valorUnitario,
                    valor_total: valorTotal,
                    status: 'ativo'
                }
            ])
            .select('id, produto_id, quantidade, valor_total');

        if (error) {
            if (isSupabasePermissionError(error)) {
                return res.status(403).json({
                    error: 'Permissão negada pelo Supabase.',
                    details: 'Verifique se a chave usada é a service_role e se a tabela carrinho permite inserção.'
                });
            }
            throw error;
        }

        return res.status(201).json({ success: true, message: 'Item adicionado ao carrinho.', item: data?.[0] || null });
    } catch (error) {
        return res.status(500).json({ error: 'Erro ao adicionar item ao carrinho.', details: error.message });
    }
});

app.get('/api/carrinho', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('carrinho')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        return res.status(200).json(data || []);
    } catch (error) {
        return res.status(500).json({ error: 'Erro ao buscar carrinho.', details: error.message });
    }
});

app.post('/api/cart', async (req, res) => {
    return app._router ? app._router.handle(req, res) : res.status(404).json({ error: 'Rota não encontrada.' });
});

// ==========================================
// ROTA 2: REALIZAR A COMPRA DE UM PRODUTO
// ==========================================
app.post('/api/comprar', async (req, res) => {
    try {
        const body = req.body || {};
        const produtoId = pickFirst(body, ['produtoId', 'produto_id', 'id', 'productId']);
        const compradorId = pickFirst(body, ['compradorId', 'comprador_id', 'userId', 'usuarioId']);
        const vendedorId = pickFirst(body, ['vendedorId', 'vendedor_id']);
        const valorTotal = normalizeNumber(pickFirst(body, ['valorTotal', 'valor_total', 'total']) ?? 0);

        if (!produtoId) {
            return res.status(400).json({ error: 'ID do produto é obrigatório.' });
        }

        if (usesPublishableKey) {
            return res.status(500).json({
                error: 'Chave do Supabase inválida para escrita.',
                details: 'O valor atual de SUPABASE_KEY está como chave publishable. Para finalizar a compra, use a chave service_role do Supabase no arquivo .env.'
            });
        }

        const { data: transacao, error: txError } = await supabase
            .from('transacoes')
            .insert([
                {
                    comprador_id: compradorId || null,
                    vendedor_id: vendedorId || null,
                    produto_id: produtoId,
                    valor_total: valorTotal,
                    tipo: 'compra'
                }
            ])
            .select('id');

        if (txError) {
            if (isSupabasePermissionError(txError)) {
                return res.status(403).json({
                    error: 'Permissão negada pelo Supabase.',
                    details: 'Verifique se a chave usada é a service_role e se a tabela transacoes permite inserção.'
                });
            }
            throw txError;
        }

        const { data: produtoAtualizado, error: prodError } = await supabase
            .from('produtos1')
            .update({ status: 'vendido' })
            .eq('id', produtoId)
            .eq('status', 'disponivel')
            .select('id');

        if (prodError) {
            if (isSupabasePermissionError(prodError)) {
                return res.status(403).json({
                    error: 'Permissão negada ao atualizar produto.',
                    details: 'A chave usada não tem permissão para alterar a tabela produtos1.'
                });
            }
            throw prodError;
        }

        if (!produtoAtualizado || produtoAtualizado.length === 0) {
            return res.status(409).json({
                error: 'Produto não está mais disponível para compra.',
                details: 'Ele pode já ter sido vendido ou não existir.'
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Compra processada com sucesso!',
            transacao: transacao?.[0] || null
        });

    } catch (error) {
        return res.status(500).json({ error: 'Erro ao processar transação no servidor', details: error.message });
    }
});

// --- CONFIGURAÇÃO PARA RODAR LOCALMENTE COM O LINK COMPLETO ---
if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`\n==================================================`);
        console.log(`⚽ Backend do Mercado da Copa rodando com sucesso!`);
        console.log(`🔗 API disponível em: http://localhost:${PORT}`);
        console.log(`==================================================\n`);
    });
}

// --- CONFIGURAÇÃO DA VERCEL ---
module.exports = app;
module.exports.handler = serverless(app);
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
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

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
// ROTA 2: REALIZAR A COMPRA DE UM PRODUTO
// ==========================================
app.post('/api/comprar', async (req, res) => {
    const { produtoId, compradorId, vendedorId, valorTotal } = req.body;

    if (!produtoId) {
        return res.status(400).json({ error: 'ID do produto é obrigatório.' });
    }

    try {
        // 1. Registra a transação
        const { data: transacao, error: txError } = await supabase
            .from('transacoes')
            .insert([
                {
                    comprador_id: compradorId || null,
                    vendedor_id: vendedorId || null,
                    produto_id: produtoId,
                    valor_total: valorTotal || 0,
                    tipo: 'compra'
                }
            ])
            .select();

        if (txError) throw txError;

        // 2. Atualiza o status do produto
        const { error: prodError } = await supabase
            .from('produtos1')
            .update({ status: 'vendido' })
            .eq('id', produtoId);

        if (prodError) throw prodError;

        return res.status(200).json({ success: true, message: 'Compra processada com sucesso!' });

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
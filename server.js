require('dotenv').config();

const express = require('express');
const cors = require('cors');
const serverless = require('serverless-http');
const { createClient } = require('@supabase/supabase-js');

const app = express();

app.use(cors());
app.use(express.json());

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
throw new Error(
'SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias.'
);
}

const supabase = createClient(
supabaseUrl,
supabaseKey,
{
auth: {
persistSession: false
}
}
);

// ======================================
// PRODUTOS
// ======================================

app.get('/api/produtos', async (req, res) => {
try {


    const { data, error } = await supabase
        .from('produtos1')
        .select('*')
        .eq('status', 'disponivel')
        .order('created_at', {
            ascending: false
        });

    if (error) throw error;

    return res.status(200).json(data);

} catch (err) {

    console.error(err);

    return res.status(500).json({
        error: err.message
    });

}


});

// ======================================
// ADICIONAR AO CARRINHO
// ======================================

app.post('/api/carrinho', async (req, res) => {
try {


    const {
        produto_id,
        usuario_id,
        quantidade = 1
    } = req.body;

    if (!produto_id) {
        return res.status(400).json({
            error: 'produto_id é obrigatório'
        });
    }

    if (!usuario_id) {
        return res.status(400).json({
            error: 'usuario_id é obrigatório'
        });
    }

    const qtd = Number(quantidade) > 0 ? Number(quantidade) : 1;

    const { data: itemExistente, error: selectError } = await supabase
        .from('carrinho')
        .select('*')
        .eq('produto_id', produto_id)
        .eq('usuario_id', usuario_id)
        .maybeSingle();

    if (selectError) throw selectError;

    if (itemExistente) {
        const novaQuantidade = Number(itemExistente.quantidade || 1) + qtd;

        const { data, error } = await supabase
            .from('carrinho')
            .update({
                quantidade: novaQuantidade
            })
            .eq('id', itemExistente.id)
            .select();

        if (error) throw error;

        return res.status(200).json({
            success: true,
            item: data[0],
            message: 'Quantidade atualizada no carrinho'
        });
    }

    const { data, error } = await supabase
        .from('carrinho')
        .insert([
            {
                produto_id,
                usuario_id,
                quantidade: qtd
            }
        ])
        .select();

    if (error) throw error;

    return res.status(201).json({
        success: true,
        item: data[0]
    });

} catch (err) {

    console.error(err);

    return res.status(500).json({
        error: err.message
    });

}


});

// ======================================
// LISTAR CARRINHO
// ======================================

app.get('/api/carrinho/:usuarioId', async (req, res) => {
try {


    const { usuarioId } = req.params;

    const { data, error } = await supabase
        .from('carrinho')
        .select(`
            *,
            produtos1(*)
        `)
        .eq('usuario_id', usuarioId);

    if (error) throw error;

    return res.status(200).json(data);

} catch (err) {

    console.error(err);

    return res.status(500).json({
        error: err.message
    });

}


});

app.patch('/api/carrinho/:itemId/quantidade', async (req, res) => {
try {
    const { itemId } = req.params;
    const { delta, quantidade } = req.body;

    if (!itemId) {
        return res.status(400).json({ error: 'itemId é obrigatório' });
    }

    const { data: item, error: itemError } = await supabase
        .from('carrinho')
        .select('*')
        .eq('id', itemId)
        .maybeSingle();

    if (itemError) throw itemError;

    if (!item) {
        return res.status(404).json({ error: 'Item do carrinho não encontrado' });
    }

    let novaQuantidade;

    if (typeof quantidade === 'number') {
        novaQuantidade = quantidade;
    } else {
        const deltaValue = Number(delta ?? 1);
        novaQuantidade = Number(item.quantidade || 1) + deltaValue;
    }

    if (!Number.isFinite(novaQuantidade) || novaQuantidade < 1) {
        const { error: deleteError } = await supabase
            .from('carrinho')
            .delete()
            .eq('id', itemId);

        if (deleteError) throw deleteError;

        return res.status(200).json({
            success: true,
            action: 'removido',
            itemId
        });
    }

    const { data, error } = await supabase
        .from('carrinho')
        .update({ quantidade: novaQuantidade })
        .eq('id', itemId)
        .select();

    if (error) throw error;

    return res.status(200).json({
        success: true,
        item: data[0]
    });

} catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
}
});

// ======================================
// COMPRAR PRODUTO
// ======================================

app.post('/api/comprar', async (req, res) => {


try {

    const {
        produto_id,
        comprador_id
    } = req.body;

    if (!produto_id) {
    return res.status(400).json({
        error: 'produto_id é obrigatório'
    });
}

    const { data: produto, error: produtoError } =
        await supabase
            .from('produtos1')
            .select('*')
            .eq('id', produto_id)
            .eq('status', 'disponivel')
            .single();

    if (produtoError || !produto) {
        return res.status(404).json({
            error: 'Produto indisponível'
        });
    }

    const { error: updateError } =
        await supabase
            .from('produtos1')
            .update({
                status: 'vendido'
            })
            .eq('id', produto_id)
            .eq('status', 'disponivel');

    if (updateError) {
        throw updateError;
    }

    const { data: transacao, error: transacaoError } =
        await supabase
            .from('transacoes')
            .insert([
                {
                    comprador_id: null,
                    vendedor_id: produto.vendedor_id,
                    produto_id,
                    tipo: 'compra',
                    valor_total: produto.preco
                }
            ])
            .select();

    if (transacaoError) {
        throw transacaoError;
    }

    await supabase
        .from('carrinho')
        .delete()
        .eq('produto_id', produto_id)
        .eq('usuario_id', comprador_id);

    return res.status(200).json({
        success: true,
        transacao: transacao[0]
    });

}catch (err) {
    console.error('ERRO COMPRA:', err);

    return res.status(500).json({
        success: false,
        error: err.message
    });
}


});

// ======================================
// HEALTH CHECK
// ======================================

app.get('/', (req, res) => {
res.json({
status: 'ok'
});
});

// ======================================
// LOCALHOST
// ======================================

if (process.env.NODE_ENV !== 'production') {


const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {

    console.log(
        `Servidor rodando em http://localhost:${PORT}`
    );

});


}

// ======================================
// VERCEL
// ======================================

module.exports = app;
module.exports.handler = serverless(app);

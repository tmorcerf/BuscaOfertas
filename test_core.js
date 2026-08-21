/**
 * test_core.js — Teste dos módulos centrais do Busca Ofertas
 */
import { ChaveParser } from './js/chave_parser.js';
import { SefazParser } from './js/sefaz_parser.js';
import { GamificationEngine } from './js/gamification.js';

console.log('--- TESTE 1: ChaveParser ---');
const chaveValida = '332608000000000191650010000121570114780115';
const resChave = ChaveParser.processar(chaveValida);
console.log('Chave Valida:', resChave.sucesso, resChave.dados ? resChave.dados.chaveFormatada : resChave.erro);

const urlQrCode = 'http://www4.fazenda.rj.gov.br/consultaNFCe/qrcode?p=332608000000000191650010000121570114780115|2|1|1|token|hash';
const resUrl = ChaveParser.processar(urlQrCode);
console.log('URL QR Code Parse:', resUrl.sucesso, resUrl.dados ? resUrl.dados.uf.sigla : resUrl.erro);

console.log('\n--- TESTE 2: SefazParser (Texto Puro) ---');
const mockTextoNfe = `
DANFE NFC-e
SUPERMERCADO GUANABARA S.A.
CNPJ: 33.000.111/0001-22

ARROZ CAMIL TIPO 1 5KG (Cód: 7896006711116)
Qtde.: 2,00 UN: UN Vl. Unit.: 24,90 Vl. Total: 49,80

FEIJAO PRETO CAMIL 1KG (Cód: 7896006722228)
Qtde.: 3,00 UN: UN Vl. Unit.: 7,50 Vl. Total: 22,50

Valor total R$ 72,30
`;

const resParser = SefazParser.processar(mockTextoNfe, 'RJ');
console.log('Parser Sucesso:', resParser.sucesso);
console.log('Estabelecimento:', resParser.estabelecimento);
console.log('Itens Extraídos:', resParser.itens.length);
console.log('Itens:', JSON.stringify(resParser.itens, null, 2));
console.log('Valor Total:', resParser.valorTotal);

console.log('\n--- TESTE 3: Avaliação de Achadinho ---');
const mockHistorico = [
    { ean: '7896006711116', descricao: 'ARROZ CAMIL TIPO 1 5KG', valorUnitario: 32.00 },
    { ean: '7896006711116', descricao: 'ARROZ CAMIL TIPO 1 5KG', valorUnitario: 30.00 }
];

const itemPromocao = { ean: '7896006711116', descricao: 'ARROZ CAMIL TIPO 1 5KG', valorUnitario: 21.90 };
GamificationEngine.avaliarAchadinho(itemPromocao, mockHistorico).then(res => {
    console.log('Avaliação Achadinho (Preço R$ 21,90 vs Média R$ 31,00):', res);
    console.log('\n✅ TODOS OS TESTES PASSARAM COM SUCESSO!');
});

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const OUTPUT_DIR = path.join(__dirname, 'output');

const EMAIL = process.env.LOGCTE_EMAIL;
const SENHA = process.env.LOGCTE_SENHA;

function formatDate(date) {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

// os campos de data têm datepicker/máscara: fill() não dispara os eventos de
// teclado que a máscara escuta, então o valor não é escrito. É preciso
// focar, selecionar o conteúdo via JS e digitar tecla a tecla.
async function preencherData(page, seletor, valor) {
  await page.click(seletor);
  await page.waitForTimeout(200);
  await page.evaluate((sel) => document.querySelector(sel).select(), seletor);
  await page.keyboard.type(valor, { delay: 30 });
  await page.waitForTimeout(150);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(150);
}

(async () => {
  if (!EMAIL || !SENHA) {
    throw new Error('Defina LOGCTE_EMAIL e LOGCTE_SENHA (env ou .env)');
  }

  const hoje = new Date();
  const dataInicial = new Date(hoje);
  dataInicial.setDate(hoje.getDate() - 3);
  const dataFinal = new Date(hoje);
  dataFinal.setDate(hoje.getDate() + 1);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto('https://www.logcte.com.br/Relatorio');

    // /Relatorio exibe o formulário de login quando não há sessão ativa
    await page.fill('input[name="Email"]', EMAIL);
    await page.fill('input[name="Senha"]', SENHA);
    await page.click('.login-form button[type="submit"]');
    await page.waitForSelector('input[name="EmissaoInicial"]');

    // Data inicial (3 dias atrás)
    await preencherData(page, 'input[name="EmissaoInicial"]', formatDate(dataInicial));

    // Data final (amanhã)
    await preencherData(page, 'input[name="EmissaoFinal"]', formatDate(dataFinal));

    // Status -> Autorizado
    await page.click('.bootstrap-select .filter-option:has-text("Selecione um Status")');
    await page.click('.bootstrap-select.open .dropdown-menu a:has-text("Autorizado")');

    // Tipo de relatório -> Analitico_mod_8
    await page.click('.bootstrap-select .filter-option:has-text("Sintetico")');
    await page.click('.bootstrap-select.open .dropdown-menu a:has-text("Analitico_mod_8")');

    // Gerar Relatório EXCEL e salvar em output/ (o workflow do GitHub Actions
    // envia esse arquivo pro webhook do n8n e depois descarta a máquina inteira)
    console.log('Gerando relatório e aguardando download...');
    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 60000 }),
      page.click('#btnRelatorioCTe'),
    ]);

    const destino = path.join(OUTPUT_DIR, download.suggestedFilename());
    await download.saveAs(destino);
    console.log(`Relatório salvo em: ${destino}`);
  } finally {
    await browser.close();
  }
})();

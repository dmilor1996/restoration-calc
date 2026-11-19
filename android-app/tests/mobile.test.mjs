import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { chromium } from 'playwright-core';
import { summary, visitDate } from '../mobile/ui/demo.js';

test('Демоотчёт включает лишь принятые работы и считает деньги в копейках', () => {
  assert.deepEqual(summary([{status:'active', revenue:9900}, {status:'done',revenue:12345,expenses:123}]),
    {count:1,revenue:12345,expenses:123});
  assert.equal(visitDate(1, new Date(2026,11,31)).getFullYear(), 2027);
});

test('Упакованный интерфейс офлайн, переходы, темы и совместимость заказов', async t => {
  const mime = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.woff2':'font/woff2','.svg':'image/svg+xml'};
  const root = new URL('../www/',import.meta.url);
  const server = createServer((req,res) => {
    const path = new URL(req.url, 'http://localhost').pathname.slice(1) || 'index.html';
    try {
      const bytes = readFileSync(new URL(path,root));
      res.writeHead(200,{'Content-Type':mime[extname(path)] || 'application/octet-stream'}).end(bytes);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  t.after(() => server.close());
  const origin = 'http://127.0.0.1:' + server.address().port;
  const executablePath = process.env.CHROME_BIN || ['/usr/bin/google-chrome','/usr/bin/chromium'].find(existsSync);
  const browser = await chromium.launch({executablePath});
  t.after(() => browser.close());
  const context = await browser.newContext({viewport:{width:360,height:800},colorScheme:'light',serviceWorkers:'block'});
  const external = [], errors = [];
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin === origin) return route.continue();
    external.push(route.request().url());
    return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.setDefaultTimeout(6000);
  await page.goto(origin);
  const order = {id:'legacy-7',updatedAt:10,draft:{client:{name:'Сохранённый заказ'}},totals:{area:2}};
  const oldOrders = JSON.stringify([order]);
  await page.evaluate(s => localStorage.setItem('rc.orders.v1',s), oldOrders);
  const nav = page.getByRole('navigation',{name:'Разделы мастерской'});
  assert.equal(await nav.getByRole('link').count(),5);
  await page.getByText('Демоданные',{exact:true}).waitFor();
  await page.locator('.hero').click();
  await page.getByText('1,53 м²',{exact:true}).waitFor();
  await page.goBack();
  await page.getByRole('heading',{name:'Сегодня'}).waitFor();
  await nav.getByText('Объекты').click();
  await page.getByRole('button',{name:'В плане'}).click();
  assert.equal(await page.locator('.rows .row').count(),1);
  await page.getByText('Буковая лестница').click();
  await page.getByText('4,80 м²',{exact:true}).waitFor();
  await nav.getByText('Мастерская').click();
  await page.getByRole('button',{name:'Расходники'}).click();
  assert.equal(await page.locator('.rows .row').count(),2);
  await page.getByText('3M Xtract 710W').click();
  await page.getByText('Ø 150 мм').waitFor();
  await nav.getByText('Прогресс').click();
  await page.getByText('После прямых расходов').waitFor();
  await page.getByLabel('Выбрать тему').click();
  await page.getByLabel('Тёмная',{exact:true}).check();
  await page.reload();
  assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true);
  assert.equal(await page.evaluate(() => localStorage.getItem('rc.orders.v1')),oldOrders);
  assert.deepEqual(external,[]);
  await nav.getByText('Калькулятор').click();
  await page.locator('.tabs__btn[href="#orders"]').click();
  await page.getByRole('button',{name:/Сохранённый заказ/}).click();
  await page.waitForURL('**/calculator.html#order/legacy-7');
  await page.getByRole('link',{name:'Моя мастерская'}).click();
  await nav.getByText('Объекты').click();
  await page.getByText('Заказы калькулятора').click();
  await page.getByText('Сохранённый заказ',{exact:true}).waitFor();
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('rc.orders.v1'))),[order]);
  assert.deepEqual(errors,[]);
});

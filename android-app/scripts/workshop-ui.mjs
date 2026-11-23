// Interactive debug WebView controls. No extra APK, IME or listening port.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {_android as android} from 'playwright-core';

const serial = process.env.ANDROID_SERIAL || '';
const pkg = 'com.restoration.calc';
const adb = (...args) => execFileSync(process.env.WORKSHOP_ADB || 'adb',
  ['-s', serial, ...args], {encoding:'utf8', timeout:30000});
assert.match(serial, /^emulator-\d+$/);
assert.equal(adb('emu','avd','name').split(/\r?\n/)[0].trim(), 'Workshop_QA_API34');
let devices = await android.devices({omitDriverInstall:true});
try {
  let device = devices.find(d => d.serial() === serial);
  assert.ok(device, 'QA emulator is unavailable');
  device.setDefaultTimeout(20000);
  async function page() {
    const view = await device.webView({pkg});
    const p = await view.page();
    p.setDefaultTimeout(15000);
    return p;
  }
  let p = await page();
  const [action, selector, value] = process.argv.slice(2);
  if (action === 'tree') console.log(await p.locator('body').ariaSnapshot());
  else if (action === 'tap') await p.locator(selector).click();
  else if (action === 'text') await p.locator(selector).fill(value);
  else if (action === 'select') await p.locator(selector).selectOption(value);
  else if (action === 'scroll') await p.locator(selector).scrollIntoViewIfNeeded();
  else if (action === 'smoke') {
    const title = 'Проверка ' + Date.now();
    const client = 'Тестовый клиент';
    const nav = () => p.getByRole('navigation', {name:'Разделы мастерской'});
    await nav().getByRole('link', {name:'Заказы'}).click();
    await p.getByRole('link', {name:'Новый заказ'}).click();
    await p.getByTestId('order-title').fill(title);
    await p.getByLabel('Где выполняется работа').selectOption('workshop');
    await p.getByText('Клиент и детали заказа').click();
    await p.getByLabel('Клиент / контакт').fill(client);
    await p.getByTestId('order-category').selectOption('Лестница');
    await p.getByTestId('order-submit').scrollIntoViewIfNeeded();
    await p.getByTestId('order-submit').click();
    await p.getByRole('heading',{name:title}).waitFor();
    const orderUrl = p.url();
    await p.getByRole('link',{name:'Изменить',exact:true}).click();
    assert.equal(await p.getByTestId('order-category').inputValue(), 'Лестница');
    await p.getByTestId('order-title').fill(title + ' дуб');
    await p.getByTestId('order-submit').click();
    await p.getByRole('heading',{name:title+' дуб'}).waitFor();

    await device.close();
    adb('shell','am','force-stop',pkg);
    adb('shell','am','start','-W','-n',pkg+'/.MainActivity');
    devices = await android.devices({omitDriverInstall:true});
    device = devices.find(d => d.serial() === serial);
    device.setDefaultTimeout(20000);
    p = await page();
    await nav().getByRole('link',{name:'Заказы'}).click();
    await p.getByText(title+' дуб',{exact:true}).click();
    assert.equal(p.url(), orderUrl);
    await p.getByRole('link',{name:'Изменить',exact:true}).click();
    assert.equal(await p.getByTestId('order-category').inputValue(),'Лестница');
    assert.equal(await p.getByLabel('Клиент / контакт').inputValue(),client);
    await nav().getByRole('link',{name:'Калькулятор'}).click();
    assert.ok(await p.getByRole('button',{name:'Создать заказ по расчёту'}).isDisabled());
    await p.getByLabel('Длина, мм').fill('1200');
    await p.getByLabel('Ширина, мм').fill('600');
    await p.getByText('0,72 м²').waitFor();
    await nav().getByRole('link',{name:'Заказы'}).click();
    await p.getByText(title+' дуб',{exact:true}).click();
    await p.getByRole('heading',{name:title+' дуб'}).waitFor();
    console.log('Passed: Russian input, category, client, edit, process death, navigation, quote validation and area.');
  } else throw Error('ui tree | tap SELECTOR | text SELECTOR VALUE | select SELECTOR VALUE | scroll SELECTOR | smoke');
} finally {
  await Promise.all(devices.map(device => device.close()));
}

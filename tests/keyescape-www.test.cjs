const {test} = require('node:test');
const assert = require('node:assert/strict');
const settings = require('../settings.js');
const ux = require('../ux.js');
const base = 'https://keyescape.com';
const www = 'https://www.keyescape.com';

test('www reservations use the existing helper preferences and bundled timetable', () => {
  const rule = require('../keyescape-weekday-fallback-rules.json').rules[0];
  const config = {sites: [www], rules: [rule], enabled: false, keyescapeTimetableEnabled: true};
  assert.equal(settings.helperState(config, www).supported, true);
  assert.equal(settings.helperState(config, www).dateUnlock, true);
  const response = settings.responseConfig(config, www);
  assert.equal(response.enabled, true);
  assert.equal(response.rules[0].site, www);
  assert.equal(response.rules[0].url, www + '/controller/run_proc.php');
  assert.equal(rule.site, base);
  config.helperDisabledSites = [base];
  assert.equal(settings.helperState(config, www).enabled, false);
  assert.equal(settings.responseConfig(config, www).enabled, false);
  assert.equal(settings.helperState(config, 'https://keyescape.com.evil.test').supported, false);
});

test('quick presets accept www reservation links', () => {
  const rule = ux.preset({page: www + '/reservation1.php?zizum_num=1&theme_num=2', name: 'Theme', action: 'patch'});
  assert.equal(rule.site, www);
  assert.equal(rule.pageParams.theme_num, '2');
});

import { expect } from 'chai';
import { describe, it } from 'mocha';

import { createScriptFunction } from '@/vendor/quickjs-executor';

// 复刻 xream/scripts lite/index.js 的写法：脚本内引用全局 lodash。
// 修复前沙箱未注入 lodash，`const _ = lodash` 直接 ReferenceError，
// 表现为「脚本操作不生效」（社区高频问题）。
const LODASH_SCRIPT = `
function operator(proxies = []) {
  return proxies.map((p = {}) => {
    const _ = lodash
    const host = _.get($arguments, 'host')
    if (host) {
      _.set(p, 'servername', host)
      _.set(p, 'name', (_.get(p, 'name') || '') + '[' + host + ']')
    }
    return p
  })
}`;

// 不引用 lodash 的脚本，验证门控注入不影响普通脚本
const PLAIN_SCRIPT = `
function operator(proxies = []) {
  return proxies.map((p = {}) => {
    p.name = (p.name || '') + '-plain'
    return p
  })
}`;

function sampleProxies() {
    return [
        {
            name: '🇭🇰 香港-01',
            type: 'vmess',
            server: '47.243.133.155',
            port: 800,
            network: 'ws',
            'ws-opts': { path: '/x', headers: { Host: 'old.example.com' } },
        },
    ];
}

describe('quickjs-executor', function () {
    this.timeout(60000);

    describe('lodash injection', function () {
        it('injects a working lodash global for scripts that reference it', async function () {
            const fn = createScriptFunction(
                LODASH_SCRIPT,
                'operator',
                { host: 'v3.bdxiguavod.com' },
                {},
            );
            const result = await fn(sampleProxies(), 'ClashMeta', {});

            expect(result).to.be.an('array').with.lengthOf(1);
            expect(result[0].servername).to.equal('v3.bdxiguavod.com');
            expect(result[0].name).to.equal('🇭🇰 香港-01[v3.bdxiguavod.com]');
            // 原对象不应被就地修改（serializeArgs 走 JSON 深拷贝）
            expect(sampleProxies()[0].servername).to.equal(undefined);
        });

        it('still runs scripts that do not reference lodash', async function () {
            const fn = createScriptFunction(PLAIN_SCRIPT, 'operator', {}, {});
            const result = await fn(sampleProxies(), 'ClashMeta', {});

            expect(result).to.be.an('array').with.lengthOf(1);
            expect(result[0].name).to.equal('🇭🇰 香港-01-plain');
        });
    });
});

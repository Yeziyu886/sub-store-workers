/**
 * 本地验证：在 QuickJS 沙箱中注入 lodash 后，xream lite 脚本能否正常工作。
 * 复刻 sub-store-workers 的 quickjs-executor.js 行为：
 *   1. injectAPI: var $arguments = JSON.parse(...)
 *   2. injectLodash: evalCode(lodashSource + ';globalThis.lodash = globalThis._')
 *   3. IIFE 包裹脚本返回 operator
 *   4. 调用 operator(proxies, targetPlatform, context)
 */
const fs = require('fs');
const { newQuickJSWASMModule, RELEASE_SYNC } = require('/tmp/sub-store-workers/node_modules/quickjs-emscripten');

const FORK = '/tmp/sub-store-workers';
const lodashSource = fs.readFileSync(`${FORK}/node_modules/lodash/lodash.min.js`, 'utf8');
const xreamScript = fs.readFileSync('/tmp/xream-lite-index.js', 'utf8');

// 与用户 KV 中"快跑"订阅一致的参数
const $arguments = { host: 'v3.bdxiguavod.com' };

// 来自 KV 缓存的真实节点样本（vmess http + vless ws）
const proxies = [
    {
        name: '🇨🇳 上海市 电信-54321',
        type: 'vmess',
        server: '106.15.107.224',
        port: 54321,
        cipher: 'auto',
        uuid: 'f4587104-415d-468a-b50f-3b9d22d3386d',
        alterId: 0,
        network: 'http',
        'http-opts': { path: ['/'], headers: { Host: ['m.iqiyi.com'] }, method: 'GET' },
        udp: true,
        servername: 'm.iqiyi.com',
    },
    {
        name: '🇭🇰 香港-01',
        type: 'vless',
        server: '47.243.133.155',
        port: 800,
        uuid: '25710db5-0cae-45fe-8723-9032819ddcf5',
        network: 'ws',
        'ws-opts': { path: '/x', headers: { Host: 'old.example.com' } },
        tls: true,
    },
];

(async () => {
    const QuickJS = await newQuickJSWASMModule(RELEASE_SYNC);
    const runtime = QuickJS.newRuntime();
    runtime.setMemoryLimit(64 * 1024 * 1024);
    runtime.setMaxStackSize(2 * 1024 * 1024);
    const context = runtime.newContext();

    function fail(msg) {
        console.error('FAIL:', msg);
        process.exit(1);
    }

    // ---- 1. 注入 $arguments（复刻 injectAPI）----
    let r = context.evalCode(
        'var $arguments = JSON.parse(' + JSON.stringify(JSON.stringify($arguments)) + ');'
    );
    if (r.error) fail('inject $arguments: ' + context.dump(r.error));
    r.value && r.value.dispose();

    // ---- 2. 注入 lodash ----
    let t0 = Date.now();
    r = context.evalCode(lodashSource + '\n;globalThis.lodash = globalThis._;');
    if (r.error) {
        const msg = context.getString(context.getProp(r.error, 'message'));
        fail('inject lodash: ' + msg);
    }
    r.value && r.value.dispose();
    console.log(`lodash 注入耗时: ${Date.now() - t0} ms`);

    // 验证沙箱内 lodash 可用
    r = context.evalCode(
        'JSON.stringify({VERSION: lodash.VERSION, get: typeof lodash.get, set: typeof lodash.set, includes: typeof lodash.includes, startsWith: typeof lodash.startsWith, isArray: typeof lodash.isArray, find: typeof lodash.find})'
    );
    if (r.error) fail('lodash probe: ' + context.dump(r.error));
    console.log('沙箱内 lodash:', context.getString(r.value));
    r.value.dispose();

    // ---- 3. func 模式执行 xream 脚本 ----
    const wrapped = '(function(){\n' + xreamScript + '\nreturn operator;\n})()';
    r = context.evalCode(wrapped);
    if (r.error) {
        const msg = context.getString(context.getProp(r.error, 'message'));
        fail('script eval (复现 lodash is not defined?): ' + msg);
    }
    const fnHandle = r.value;
    if (context.typeof(fnHandle) !== 'function') fail('operator is not a function');

    // ---- 4. 调用 operator(proxies, 'ClashMeta', {}) ----
    const callExpr =
        'JSON.stringify((' + wrapped + ')(JSON.parse(' + JSON.stringify(JSON.stringify(proxies)) + '), "ClashMeta", {}))';
    r = context.evalCode(callExpr);
    if (r.error) {
        const msg = context.getString(context.getProp(r.error, 'message'));
        fail('operator call: ' + msg);
    }
    const resultStr = context.getString(r.value);
    r.value.dispose();
    fnHandle.dispose();

    const result = JSON.parse(resultStr);
    console.log('\n处理后的节点:');
    for (const p of result) {
        console.log(JSON.stringify({
            name: p.name,
            servername: p.servername,
            sni: p.sni,
            'skip-cert-verify': p['skip-cert-verify'],
            network: p.network,
            'http-opts': p['http-opts'],
            'ws-opts': p['ws-opts'],
        }, null, 1));
    }

    // ---- 断言 ----
    const a = result[0];
    const b = result[1];
    const checks = [
        ['vmess servername 改为 host', a.servername === 'v3.bdxiguavod.com'],
        ['vmess sni 改为 host', a.sni === 'v3.bdxiguavod.com'],
        ['vmess skip-cert-verify 开启', a['skip-cert-verify'] === true],
        ['vmess http-opts Host 改为 host', a['http-opts'].headers.Host[0] === 'v3.bdxiguavod.com'],
        ['vless ws Host 改为 host', b['ws-opts'].headers.Host === 'v3.bdxiguavod.com'],
        ['vless servername 改为 host', b.servername === 'v3.bdxiguavod.com'],
        ['节点数量不变', result.length === 2],
    ];
    console.log('\n断言:');
    let ok = true;
    for (const [label, pass] of checks) {
        console.log(`${pass ? '✅' : '❌'} ${label}`);
        if (!pass) ok = false;
    }
    if (!ok) fail('部分断言未通过');
    console.log('\nALL PASSED — lodash 注入方案可行');
})().catch((e) => {
    console.error('UNCAUGHT:', e);
    process.exit(1);
});

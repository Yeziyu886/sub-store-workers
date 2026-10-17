/**
 * mocha 测试入口（`npm test` 经 --require 加载），替代原先直接
 * `--require @babel/register`：
 *
 * 1. @babel/register：ESM 语法 + `@/` 别名（规则见 .babelrc.js）
 * 2. .wasm require 钩子：Node 默认把 .wasm 当 JS 解析会 SyntaxError；
 *    生产构建中该 import 由 Wrangler 处理为 WebAssembly.Module，
 *    这里读取同一份文件编译成 Module，保证测试走与产物一致的代码路径。
 *
 * 注意：module-resolver 不改写已存在的相对路径（./quickjs.wasm 文件
 * 真实存在），因此不能用 .babelrc.js 别名，必须在 require 扩展上处理。
 */
require('@babel/register');

const fs = require('fs');

require.extensions['.wasm'] = function (module, filename) {
    module.exports = new WebAssembly.Module(fs.readFileSync(filename));
};

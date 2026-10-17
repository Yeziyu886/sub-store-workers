/**
 * 测试桩：提供 lodash 完整源码字符串。
 *
 * 与 esbuild.js 的 lodashSourcePlugin 行为一致：读取 node_modules 中
 * lodash.min.js 的原文。路径基于仓库根目录计算，避免解析到仓库外的
 * node_modules（与 ip-address.spec.js 的注释是同样的考量）。
 */
const fs = require('fs');
const path = require('path');

module.exports = fs.readFileSync(
    path.resolve(__dirname, '../../../node_modules/lodash/lodash.min.js'),
    'utf8',
);

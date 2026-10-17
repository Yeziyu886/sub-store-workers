#!/usr/bin/env python3
"""E2E：通过 Pages 公开预览接口验证 xream lite 脚本（lodash 修复）在生产 worker 中生效。

覆盖两种脚本操作配置方式：
  A. inline 模式：args.content = 脚本原文, args.arguments = {host: ...}
     （loadScriptItem 的 else 分支：$arguments = item.args.arguments）
  B. link 模式：args.content = URL + '#' + encodeURIComponent(JSON.stringify({host:...}))
     （loadScriptItem 的 link 分支：从 URL # 片段解析 $arguments）
"""
import json
import urllib.request
from urllib.parse import quote

PAGES = "https://sub-store-act.pages.dev"
SCRIPT_URL = (
    "https://raw.githubusercontent.com/xream/scripts/main/"
    "surge/modules/sub-store-scripts/lite/index.js"
)
HOST = "v3.bdxiguavod.com"
UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)

content = open("/tmp/cached-proxies.yaml", encoding="utf-8").read()
script = open("/tmp/xream-lite-index.js", encoding="utf-8").read()


def run(processors, label):
    body = {
        "name": "e2e-lodash-test",
        "displayName": "e2e-lodash-test",
        "source": "local",
        "content": content,
        "process": processors,
    }
    req = urllib.request.Request(
        PAGES + "/api/preview/sub?target=JSON",
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json", "User-Agent": UA},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        raw = resp.read().decode("utf-8", "replace")
        code = resp.status
    print(f"[{label}] HTTP {code}")
    data = json.loads(raw)
    if data.get("status") != "success":
        print(f"[{label}] FAILED:", json.dumps(data, ensure_ascii=False)[:1500])
        return False
    original = data["data"]["original"]
    processed = data["data"]["processed"]
    print(f"[{label}] 原始节点: {len(original)}  处理后: {len(processed)}")

    ok = fail = 0
    for p in processed:
        if p.get("servername") == HOST:
            ok += 1
        else:
            fail += 1
            if fail <= 3:
                print(
                    f"[{label}] 未改写节点:",
                    json.dumps(
                        {"name": p.get("name"), "servername": p.get("servername")},
                        ensure_ascii=False,
                    ),
                )
    print(f"[{label}] servername 已改写为 {HOST}: {ok}/{len(processed)}")

    if processed:
        s = processed[0]
        print(
            f"[{label}] 样例节点:",
            json.dumps(
                {
                    k: s.get(k)
                    for k in (
                        "name",
                        "type",
                        "servername",
                        "sni",
                        "skip-cert-verify",
                        "network",
                        "http-opts",
                        "ws-opts",
                    )
                },
                ensure_ascii=False,
            ),
        )
    return ok == len(processed) and len(processed) > 0


ok_a = run(
    [
        {
            "type": "Script Operator",
            "args": {"content": script, "arguments": {"host": HOST}},
            "customName": "",
            "id": "e2e.inline",
            "disabled": False,
        }
    ],
    "A-inline",
)

fragment = "#" + quote(json.dumps({"host": HOST}))
ok_b = run(
    [
        {
            "type": "Script Operator",
            "args": {"content": SCRIPT_URL + fragment, "mode": "link"},
            "customName": "",
            "id": "e2e.link",
            "disabled": False,
        }
    ],
    "B-link",
)

if ok_a and ok_b:
    print("\n✅ E2E 全部通过：xream lite 脚本在生产环境完整生效（lodash 注入修复确认）")
else:
    print("\n❌ E2E 未完全通过")
    raise SystemExit(1)

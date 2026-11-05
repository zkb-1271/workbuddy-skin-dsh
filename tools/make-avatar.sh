#!/bin/bash
# 用你自己的图片生成头像（写进 skin/avatar.js，圆角/裁切自动处理）。
# 用法：./tools/make-avatar.sh ~/Pictures/me.jpg
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="${1:-}"
if [ -z "$SRC" ] || [ ! -f "$SRC" ]; then
  echo "用法：./tools/make-avatar.sh 图片路径（jpg/png）"
  exit 1
fi
python3 - "$SRC" "$ROOT" <<'PY'
import base64, sys, os
from PIL import Image
src, root = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGBA')
w, h = im.size
side = min(w, h)
im = im.crop(((w - side)//2, (h - side)//2, (w + side)//2, (h + side)//2)).resize((128, 128), Image.LANCZOS)
out = os.path.join(root, 'skin', 'assets', 'avatar.local.png')
im.save(out)
b64 = base64.b64encode(open(out, 'rb').read()).decode()
js = '''/**
 * 本地头像覆盖（内联 base64，由 tools/make-avatar.sh 生成）。
 * 这个文件不进 Git（.gitignore 已忽略）。
 */
window.__WBDS_AVATAR = 'data:image/png;base64,%s';
''' % b64
open(os.path.join(root, 'skin', 'avatar.local.js'), 'w').write(js)
print('✔ 已写入', out)
PY
echo "→ 重新注入生效：./tools/apply.sh"

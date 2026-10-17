"""Rebuild vendor/jizura-engine.js from a JIZURA checkout (https://github.com/852wa/JIZURA).
The bundle is the engine only: src/*.js in load order, without the editor UI (src/12_ui.js).
usage: python3 build_engine.py /path/to/JIZURA"""
import glob, os, subprocess, sys

if len(sys.argv) != 2:
    sys.exit(__doc__)
src_root = os.path.abspath(sys.argv[1])
vendor = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'vendor')
read = lambda p: open(p, encoding='utf-8').read()

sources = [f for f in sorted(glob.glob(os.path.join(src_root, 'src', '*.js'))) if os.path.basename(f) != '12_ui.js']
if not sources:
    sys.exit(f'no src/*.js under {src_root}')
version = read(os.path.join(src_root, 'VERSION')).strip()
try:
    commit = subprocess.check_output(['git', '-C', src_root, 'rev-parse', 'HEAD'], text=True).strip()
except Exception:
    commit = 'unknown'

header = (f'/*! JIZURA engine v{version} ({commit[:7]}) | MIT License | (c) 2026 hakoniwa\n'
          f' *  https://github.com/852wa/JIZURA — engine only (src/*.js without 12_ui.js), see LICENSE.JIZURA */\n')
js = header + '\n'.join(read(f).replace('@VERSION@', version) for f in sources)
os.makedirs(vendor, exist_ok=True)
open(os.path.join(vendor, 'jizura-engine.js'), 'w', encoding='utf-8').write(js)
open(os.path.join(vendor, 'LICENSE.JIZURA'), 'w', encoding='utf-8').write(read(os.path.join(src_root, 'LICENSE')))
open(os.path.join(vendor, 'VERSION'), 'w', encoding='utf-8').write(f'{version}\n{commit}\n')
print(f'vendor/jizura-engine.js  v{version}  {commit[:7]}  {len(sources)} files  {len(js)} bytes')

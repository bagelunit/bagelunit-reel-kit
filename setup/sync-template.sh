#!/usr/bin/env bash
# Susanoo Reel Kit: keep the template copies up to date.
#
#   bash setup/sync-template.sh
#       Refresh the generic folder you copy from (~/Documents/Claude/Reel Template, or $REEL_TEMPLATE_HOME)
#       from this repo's template/. It is a plain mirror: it holds no brand, so nothing is lost.
#
#   bash setup/sync-template.sh <path-to-a-brand-workspace>            (shows what would change, changes nothing)
#   bash setup/sync-template.sh <path-to-a-brand-workspace> --apply    (does it)
#       Update ONE brand workspace (a copy you already set up) with the newer kit files.
#       It updates only what the kit owns: CLAUDE.md, README.md, LICENSE, docs/, .claude/skills/.
#       It NEVER touches brand/ or reels/ (the brand's own data), except that brand/brand.json gains any
#       NEW setting the template added (existing values are never changed).
#       Files it overwrites are first saved next to them as <name>.bak-<date>.
#       A brand-specific edit you made to CLAUDE.md or a skill WILL be replaced (the .bak keeps it): re-apply it after.
#
#       The dry run also says which kit version the workspace is on, which is current, and what changed in between.
#
# Run this from anywhere. Needs rsync and python3. Never run it on the repo itself.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$REPO/template"
GENERIC="${REEL_TEMPLATE_HOME:-$HOME/Documents/Claude/Reel Template}"
STAMP="$(date +%Y%m%d-%H%M%S)"
KITVER="$(tr -d '[:space:]' < "$REPO/VERSION" 2>/dev/null || echo unknown)"

[ -f "$SRC/CLAUDE.md" ] || { echo "Cannot find template/ next to this script."; exit 1; }
command -v rsync >/dev/null || { echo "rsync not found."; exit 1; }

if [ $# -eq 0 ]; then
  mkdir -p "$GENERIC"
  rsync -a --delete --exclude .DS_Store "$SRC/" "$GENERIC/"
  echo "Refreshed the generic folder: $GENERIC"
  echo "Brand copies already made are NOT changed. Update each with:  bash setup/sync-template.sh <workspace> --apply"
  exit 0
fi

DEST="${1%/}"; MODE="${2:-}"
[ -d "$DEST" ] || { echo "Not a folder: $DEST"; exit 1; }
DEST="$(cd "$DEST" && pwd)"
case "$DEST/" in "$REPO"/*) echo "Refusing: that is inside the kit repo."; exit 1;; esac
[ -f "$DEST/brand/brand.json" ] && [ -f "$DEST/CLAUDE.md" ] || { echo "Not a reel workspace (no CLAUDE.md or brand/brand.json): $DEST"; exit 1; }
[ "$MODE" = "" ] || [ "$MODE" = "--apply" ] || { echo "Unknown option: $MODE (use --apply)"; exit 1; }

# kit-owned paths (relative to the template); brand/ and reels/ are deliberately absent
PATHS=(CLAUDE.md README.md LICENSE docs .claude/skills)

if [ "$MODE" != "--apply" ]; then
  echo "DRY RUN for: $DEST   (nothing changed; add --apply to do it)"
  python3 -I - "$REPO" "$DEST" "$KITVER" <<'PY'
import os,re,sys
repo,dest,kit=sys.argv[1:4]
have="unknown"
f=os.path.join(dest,".kit-version")
if os.path.exists(f): have=open(f).read().strip() or "unknown"
print(f"  kit version: {kit}   this workspace: {have}")
def tup(v): return tuple(int(x) for x in re.findall(r"\d+",v)[:3]) if re.search(r"\d",v) else (0,)
try: log=open(os.path.join(repo,"CHANGELOG.md")).read()
except OSError: log=""
blocks=re.split(r"(?m)^## ",log)[1:]
new=[b for b in blocks if tup(b.split()[0])>tup(have)] if have!="unknown" else blocks[:1]
if have!="unknown" and tup(have)>=tup(kit): print("  (this workspace is already on the newest kit version)")
for b in new: print("\n  What changed in "+b.rstrip().replace("\n","\n  ")+"\n")
PY
  python3 -I - "$SRC" "$DEST" "${PATHS[@]}" <<'PY'
import json,os,sys
src,dst,paths=sys.argv[1],sys.argv[2],sys.argv[3:]
def files(root):
    if os.path.isfile(root): yield root; return
    for d,_,fs in os.walk(root):
        for f in fs:
            if f!=".DS_Store": yield os.path.join(d,f)
add=[];chg=[]
for p in paths:
    for f in files(os.path.join(src,p)):
        rel=os.path.relpath(f,src); g=os.path.join(dst,rel)
        if not os.path.exists(g): add.append(rel)
        elif open(f,"rb").read()!=open(g,"rb").read(): chg.append(rel)
for r in add: print("  new      ",r)
for r in chg: print("  replaced ",r)
if not add and not chg: print("  all kit files are current")
new=json.load(open(os.path.join(src,"brand/brand.json"))); old=json.load(open(os.path.join(dst,"brand/brand.json")))
miss=[k for k in new if k not in old]
print("  brand.json would gain:", ", ".join(miss) if miss else "nothing")
PY
  exit 0
fi

for p in "${PATHS[@]}"; do
  if [ -d "$SRC/$p" ]; then
    mkdir -p "$DEST/$p"
    rsync -rc --backup --suffix=".bak-$STAMP" --exclude .DS_Store "$SRC/$p/" "$DEST/$p/"
  else
    rsync -c --backup --suffix=".bak-$STAMP" "$SRC/$p" "$DEST/$p"
  fi
done

python3 -I - "$SRC/brand/brand.json" "$DEST/brand/brand.json" "$STAMP" <<'PY'
import json,shutil,sys
src,dst,stamp=sys.argv[1:4]
new=json.load(open(src)); old=json.load(open(dst))
added=[k for k in new if k not in old]
for k in added: old[k]=new[k]
if added:
    shutil.copyfile(dst,f"{dst}.bak-{stamp}")
    json.dump(old,open(dst,"w"),indent=2,ensure_ascii=False); open(dst,"a").write("\n")
print("brand.json gained:", ", ".join(added) if added else "nothing (already current)")
PY
date +%Y-%m-%d > "$DEST/.kit-synced"
printf '%s\n' "$KITVER" > "$DEST/.kit-version"
echo "Updated $DEST to kit version $KITVER. Replaced files were saved as *.bak-$STAMP. brand/ and reels/ were not touched."

#!/usr/bin/env python3
"""Fit a small model from THIS brand's own Instagram Insights to the measurements of its reels.

  python3 tools/calibrate.py <insights.csv> [--project-root <reels folder>]

The csv needs one row per reel with columns for the reel (file, reel, video, name or title: a folder name or an mp4
name), average watch time (avg_watch_time_s, "average watch time" ...), skip rate (skip_rate, "skip rate") and
optionally views. Forgiving about formats: 0:09, 9s, 9.4, 41.2%, 0.41, 18.4K, 1,234.

Each reel needs a build/measure.json (run  kit measure <reel>  first). The root defaults to the current folder, then
./reels. The method is a ridge regression (a straight-line fit with a penalty that keeps it from chasing noise) on
standardised measured features, for the average watch fraction (watch time / length) and the skip rate. The penalty is
picked by leave-one-out error: each reel is held out in turn and predicted from the others. That error is the honest
number to trust. It refuses to fit with fewer than MIN_REELS measured reels.

Saves ~/.config/bagelunit-reels/predict-model.json. Reads local files only, no network.
"""
import csv, datetime, json, re, sys
from pathlib import Path
import numpy as np

from kitcore import Flags, HOME_CFG, fail, read_json, find_reel

TOOL = 'calibrate'
MIN_REELS = 8
MODEL_FILE = HOME_CFG / 'predict-model.json'
FEATURES = ['duration_s', 'words_per_s', 'words_per_s_first5', 'first_word_s', 'loudness_range_lu', 'silence_share',
            'cuts_per_min', 'energy_mean', 'energy_first3_ratio', 'static_share', 'static_longest_s',
            'first_strong_change_s']
LAMBDAS = [0.1, 0.3, 1, 3, 10, 30, 100]
NAME_COLS = ('file', 'reel', 'video', 'name', 'title', 'project', 'slug')


def norm(h):
    return re.sub(r'[^a-z0-9]+', '_', h.strip().lower()).strip('_')


def pick_column(headers, *needles):
    for h in headers:
        if all(n in norm(h) for n in needles):
            return h
    return None


def parse_seconds(text):
    t = str(text).strip().lower().replace(',', '')
    if not t:
        return None
    if ':' in t:
        total = 0.0
        for part in t.split(':'):
            total = total * 60 + float(part)
        return total
    m = re.match(r'^(\d+(?:\.\d+)?)\s*(ms|s|sec|secs|seconds?|m|min)?$', t)
    if not m:
        return None
    x = float(m.group(1))
    unit = m.group(2) or 's'
    return x / 1000 if unit == 'ms' else x * 60 if unit in ('m', 'min') else x


def parse_rate(text):
    """41.2%, 41.2 or 0.412 all become 0.412. A bare number above 1 is read as a percent."""
    t = str(text).strip().replace(',', '')
    if not t:
        return None
    pct = t.endswith('%')
    try:
        x = float(t.rstrip('%'))
    except ValueError:
        return None
    return x / 100 if pct or x > 1 else x


def parse_count(text):
    t = str(text).strip().lower().replace(',', '')
    m = re.match(r'^(\d+(?:\.\d+)?)\s*([kmb]?)$', t)
    if not m:
        return None
    return float(m.group(1)) * {'': 1, 'k': 1e3, 'm': 1e6, 'b': 1e9}[m.group(2)]


def read_rows(path):
    text = Path(path).read_text(encoding='utf-8-sig')
    dialect = csv.Sniffer().sniff(text[:2000], delimiters=',;\t') if text.strip() else csv.excel
    rows = list(csv.DictReader(text.splitlines(), dialect=dialect))
    if not rows:
        fail(TOOL, f'{path} has no rows')
    heads = list(rows[0].keys())
    name = next((h for want in NAME_COLS for h in heads if norm(h) == want), None) or pick_column(heads, 'file') or pick_column(heads, 'reel')
    watch = pick_column(heads, 'watch') or pick_column(heads, 'avg', 'time')
    skip = pick_column(heads, 'skip')
    views = pick_column(heads, 'view')
    missing = [label for label, col in (('reel/file', name), ('avg_watch_time_s', watch), ('skip_rate', skip)) if not col]
    if missing:
        fail(TOOL, f'could not find column(s): {", ".join(missing)}. Columns seen: {", ".join(heads)}')
    out = []
    for r in rows:
        out.append(dict(name=(r[name] or '').strip(), watch_s=parse_seconds(r[watch]), skip=parse_rate(r[skip]),
                        views=parse_count(r[views]) if views else None))
    return out


def find_measure(name, roots):
    stem = Path(name).stem if re.search(r'\.\w{2,4}$', name) else name
    stem = stem.strip().strip('/')
    for root in roots:
        found = find_reel(root.parent if root.name == 'reels' else root, stem)   # a dated folder too (reels/2026/11 November/November 12/<slug>)
        for cand in (root / stem, root / 'reels' / stem, *([found] if found else []), Path(name)):
            f = cand / 'build' / 'measure.json'
            if f.is_file():
                return f
    return None


def ridge_loo(X, y, lam):
    """Ridge on standardised X with an unpenalised intercept. Returns coefficients, intercept and leave-one-out predictions
    (exact, from the hat matrix)."""
    n = len(y)
    A = np.hstack([np.ones((n, 1)), X])
    P = np.eye(A.shape[1]) * lam
    P[0, 0] = 0
    H = A @ np.linalg.solve(A.T @ A + P, A.T)
    fit = H @ y
    loo = y - (y - fit) / (1 - np.diag(H))
    beta = np.linalg.solve(A.T @ A + P, A.T @ y)
    return beta[1:], float(beta[0]), loo


def fit_target(X, y):
    best = None
    for lam in LAMBDAS:
        coef, b0, loo = ridge_loo(X, y, lam)
        err = float(np.abs(loo - y).mean())
        if best is None or err < best[0]:
            best = (err, lam, coef, b0, loo)
    return best


def main():
    flags = Flags()
    args = flags.positional()
    if not args:
        print(__doc__)
        raise SystemExit(1)
    csv_path = Path(args[0]).expanduser()
    if not csv_path.is_file():
        fail(TOOL, f'no such file: {csv_path}')
    given = flags.get('project-root')
    roots = [Path(given).expanduser().resolve()] if given and given is not True else [Path.cwd(), Path.cwd() / 'reels']

    data, unmatched, bad = [], [], []
    for r in read_rows(csv_path):
        if not r['name']:
            continue
        mf = find_measure(r['name'], roots)
        if r['watch_s'] is None or r['skip'] is None:
            bad.append(r['name'])
        elif mf is None:
            unmatched.append(r['name'])
        else:
            m = read_json(mf, {}) or {}
            if not m.get('duration_s'):
                unmatched.append(r['name'])
            else:
                data.append((r, m))
    print(f'calibrate: {len(data)} reels with Insights and a measurement ({len(unmatched)} without build/measure.json, {len(bad)} with unreadable numbers)')
    if unmatched:
        print('  no measurement yet (run  kit measure <reel>): ' + ', '.join(unmatched[:12]))
    if bad:
        print('  could not read the numbers for: ' + ', '.join(bad[:12]))
    if len(data) < MIN_REELS:
        fail(TOOL, f'not fitting: {len(data)} reels is too few to say anything honest. Need at least {MIN_REELS} measured reels with Insights, so '
                   f'{MIN_REELS - len(data)} more. (With this few reels any fitted line mostly describes luck.)')

    # features: the fixed list, keeping those present in every reel; a missing first change means "never", so use the length
    cols, raw = [], []
    for name in FEATURES:
        vals = []
        for _, m in data:
            v = m.get(name)
            if v is None and name == 'first_strong_change_s':
                v = m['duration_s']
            vals.append(v)
        if all(v is not None for v in vals) and np.std(vals) > 1e-9:
            cols.append(name)
            raw.append(vals)
    if len(cols) < 2:
        fail(TOOL, 'fewer than 2 measured features vary between these reels, so there is nothing to fit.')
    Xraw = np.array(raw, float).T
    mean, std = Xraw.mean(axis=0), Xraw.std(axis=0)
    X = (Xraw - mean) / std
    dur = np.array([m['duration_s'] for _, m in data])
    frac = np.clip(np.array([r['watch_s'] for r, _ in data]) / dur, 0, 1)
    skip = np.clip(np.array([r['skip'] for r, _ in data]), 0, 1)

    out = {}
    for label, y in (('watch_fraction', frac), ('skip_rate', skip)):
        err, lam, coef, b0, loo = fit_target(X, y)
        base = float(np.abs(y - (y.sum() - y) / (len(y) - 1)).mean())      # leave-one-out error of "always the average"
        out[label] = dict(intercept=b0, coef=dict(zip(cols, [float(c) for c in coef])), lambda_=lam, loo_mae=err,
                          baseline_loo_mae=base, loo_pred=loo)

    watch_err = float(np.abs(out['watch_fraction']['loo_pred'] * dur - frac * dur).mean())
    watch_base = float(np.abs(((frac.sum() - frac) / (len(frac) - 1)) * dur - frac * dur).mean())
    model = dict(version=1, date=datetime.date.today().isoformat(), reels=len(data), features=cols,
                 feature_mean=[float(x) for x in mean], feature_std=[float(x) for x in std],
                 targets={k: {kk: vv for kk, vv in v.items() if kk != 'loo_pred'} for k, v in out.items()},
                 loo_mae_watch_s=watch_err, baseline_loo_mae_watch_s=watch_base,
                 mean_duration_s=float(dur.mean()),
                 note='Ridge regression, standardised features, penalty chosen by leave-one-out error. Describes this brand only.')
    HOME_CFG.mkdir(parents=True, exist_ok=True)
    MODEL_FILE.write_text(json.dumps(model, indent=1), encoding='utf-8')

    sk = out['skip_rate']
    print(f'fitted on {len(data)} reels, {len(cols)} measured features. Saved {MODEL_FILE}')
    print(f'  leave-one-out check (each reel predicted from the other {len(data) - 1}):')
    print(f'  watch time: typically off by {watch_err:.1f} s  (just guessing the average would be off by {watch_base:.1f} s)')
    print(f'  skip rate:  typically off by {sk["loo_mae"] * 100:.1f} points  (guessing the average: {sk["baseline_loo_mae"] * 100:.1f})')
    weak = []
    if watch_err >= watch_base * 0.9:
        weak.append('the watch-time model is not clearly better than guessing the average')
    if sk['loo_mae'] >= sk['baseline_loo_mae'] * 0.9:
        weak.append('the skip-rate model is not clearly better than guessing the average')
    if watch_err > 0.25 * float(dur.mean()):
        weak.append(f'a miss of {watch_err:.1f} s is large for reels about {dur.mean():.0f} s long')
    if sk['loo_mae'] > 0.10:
        weak.append(f'a skip-rate miss of {sk["loo_mae"] * 100:.0f} points is large')
    if weak:
        print('  WARNING: ' + '; '.join(weak) + '. Treat predictions as a rough hint at best; add more reels and refit.')
    elif len(data) < 20:
        print(f'  Note: {len(data)} reels is still a small sample. Ranges are wide on purpose; refit as you add reels.')
    top = sorted(out['watch_fraction']['coef'].items(), key=lambda kv: -abs(kv[1]))[:3]
    print('  features that moved watch time most in this fit (correlation, not proof): ' +
          ', '.join(f'{k} ({"up" if v > 0 else "down"})' for k, v in top))


if __name__ == '__main__':
    main()

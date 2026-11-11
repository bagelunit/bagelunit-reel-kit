#!/usr/bin/env python3
"""Pre-posting estimate for a reel: measured facts, plus a prediction ONLY when a model has been fitted.

  python3 tools/predict.py <project> [video.mp4]

Runs measure first if build/measure.json is missing. If ~/.config/bagelunit-reels/predict-model.json exists (made by
tools/calibrate.py from this brand's own Insights), prints average watch time, watch fraction and skip rate with a range
taken from the leave-one-out error and says how many reels it was fitted on. With no model it prints the measurements
only. Never invents a number. Writes build/predict.json.
"""
import json, sys
from pathlib import Path
import numpy as np

from kitcore import resolve_reel, Flags, HOME_CFG, fail, read_json
import measure

TOOL = 'predict'
NO_MODEL = ('No calibrated model yet: add at least 8 reels of Insights with tools/calibrate.py. '
            'These numbers are measurements, not predictions.')


def feature_vector(model, facts):
    xs, out_of_range = [], []
    for name, mu, sd in zip(model['features'], model['feature_mean'], model['feature_std']):
        v = facts.get(name)
        if v is None and name == 'first_strong_change_s':
            v = facts['duration_s']
        if v is None:
            return None, [name]
        z = (v - mu) / sd
        if abs(z) > 3:
            out_of_range.append(name)
            z = max(-3, min(3, z))
        xs.append(z)
    return np.array(xs), out_of_range


def main():
    flags = Flags()
    args = flags.positional()
    if not args:
        print(__doc__)
        raise SystemExit(1)
    project = resolve_reel(args[0])
    mfile = project / 'build' / 'measure.json'
    if not mfile.is_file():
        measure.run(project, args[1] if len(args) > 1 else None)
    facts = read_json(mfile)
    if not facts:
        fail(TOOL, 'build/measure.json is unreadable; run  kit measure <project>  again')
    measure.say(facts)

    model = read_json(HOME_CFG / 'predict-model.json')
    result = dict(measured=facts, model_used=False)
    if not model:
        print('\n' + NO_MODEL)
        result['note'] = NO_MODEL
    else:
        x, odd = feature_vector(model, facts)
        if x is None:
            note = f'The saved model needs a measurement this reel lacks ({odd[0]}). Re-run  kit measure  or refit. Showing measurements only.'
            print('\n' + note)
            result['note'] = note
        else:
            t = model['targets']
            dur = facts['duration_s']
            frac = float(np.clip(t['watch_fraction']['intercept'] + x @ np.array([t['watch_fraction']['coef'][f] for f in model['features']]), 0, 1))
            skip = float(np.clip(t['skip_rate']['intercept'] + x @ np.array([t['skip_rate']['coef'][f] for f in model['features']]), 0, 1))
            err_s, err_skip = model['loo_mae_watch_s'], t['skip_rate']['loo_mae']
            watch = frac * dur
            n = model['reels']
            result.update(model_used=True, reels_fitted=n, fitted_on=model['date'], watch_time_s=round(watch, 1),
                          watch_fraction=round(frac, 3), skip_rate=round(skip, 3),
                          watch_time_range_s=[round(max(0, watch - err_s), 1), round(min(dur, watch + err_s), 1)],
                          skip_rate_range=[round(max(0, skip - err_skip), 3), round(min(1, skip + err_skip), 3)],
                          typical_error_watch_s=round(err_s, 1), typical_error_skip=round(err_skip, 3), outside_training_range=odd)
            print(f'\nPrediction from a model fitted on {n} of this brand\'s reels (on {model["date"]}):')
            print(f'  average watch time  {watch:.1f} s  (likely {result["watch_time_range_s"][0]} to {result["watch_time_range_s"][1]} s; typical miss {err_s:.1f} s)')
            print(f'  watch fraction      {frac * 100:.0f} %  of {dur:.1f} s')
            print(f'  skip rate           {skip * 100:.0f} %  (likely {result["skip_rate_range"][0] * 100:.0f} to {result["skip_rate_range"][1] * 100:.0f} %)')
            if odd:
                print(f'  Careful: this reel is far outside what the model has seen for: {", ".join(odd)}.')
            if n < 20:
                print(f'  Only {n} reels behind this. It describes this brand\'s past reels, not a promise.')
    (project / 'build').mkdir(parents=True, exist_ok=True)
    (project / 'build' / 'predict.json').write_text(json.dumps(result, indent=1), encoding='utf-8')


if __name__ == '__main__':
    main()

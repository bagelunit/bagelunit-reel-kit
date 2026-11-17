#!/usr/bin/env python3
"""abtest.py: which hook is ahead, and is that enough to call it? Two variants, one number, a plain rule. No model, no credits.

  python3 scripts/abtest.py --a <hits> <views> --b <hits> <views> [--lower-better] [--metric saves] [--min-views 300] [--json]
  python3 scripts/abtest.py --selftest

  hits   how many of the views did the thing you are measuring: saves, shares, 3-second holds, people who stayed.
  views  how many people saw that version.
  --lower-better   the hits are something you want LESS of (people who skipped in the first 3 seconds).

The maths: each version's true rate gets a Beta(1 + hits, 1 + views - hits) posterior (a flat start). The tool prints the probability
that A's true rate beats B's, worked out by exact numeric integration of  P(A > B) = integral of pdf_A(x) * cdf_B(x) dx  (no random numbers,
so the same counts always give the same answer).

The rule, the same every time:
  1. Both versions need at least --min-views views (default 300). Below that: keep testing.
  2. Call a winner only when the probability that it beats the other is 95 percent or more.
  3. Otherwise: "keep testing, need about N more views each", N from the rates seen so far. If the two rates are so close that it would
     take more than 200,000 views each, it says there is no real difference: stop the test and pick on something else (cost, taste).
A 95 percent call is wrong about one time in twenty. That is the price of stopping early; do not look every hour and stop the first time it
crosses (that makes it wrong far more often), look when each version has the views it needs."""
import json, math, sys

CALL = 0.95
MIN_VIEWS = 300
GIVE_UP = 200_000


def _logpdf(x, a, b):
    return (a - 1) * math.log(x) + (b - 1) * math.log1p(-x) - (math.lgamma(a) + math.lgamma(b) - math.lgamma(a + b))


def prob_a_beats_b(ha, na, hb, nb, steps=6000):
    """P(rate A > rate B) with flat Beta priors. Exact numeric integration over the range where either posterior has mass."""
    if min(na, nb) <= 0 or ha < 0 or hb < 0 or ha > na or hb > nb:
        raise ValueError('hits must be between 0 and views, and views above 0')
    pa, qa = 1 + ha, 1 + na - ha
    pb, qb = 1 + hb, 1 + nb - hb

    def span(p, q):
        mean = p / (p + q)
        sd = math.sqrt(p * q / ((p + q) ** 2 * (p + q + 1)))
        return max(1e-9, mean - 12 * sd), min(1 - 1e-9, mean + 12 * sd)

    (a0, a1), (b0, b1) = span(pa, qa), span(pb, qb)
    lo, hi = min(a0, b0), max(a1, b1)
    h = (hi - lo) / steps
    xs = [lo + (i + 0.5) * h for i in range(steps)]                  # midpoints
    fa = [math.exp(_logpdf(x, pa, qa)) for x in xs]
    fb = [math.exp(_logpdf(x, pb, qb)) for x in xs]
    cum, total = 0.0, 0.0
    for i in range(steps):
        # the cdf of B at x_i: mass below this cell plus half of this cell
        total += fa[i] * (cum + 0.5 * fb[i] * h) * h
        cum += fb[i] * h
    return min(1.0, max(0.0, total / (sum(fa) * h)))                  # divide by A's mass inside the range: normalises tiny tails


def more_views_needed(ha, na, hb, nb, lower_better=False, target=CALL):
    """If the rates seen so far hold, how many views EACH version needs before the leader reaches `target`. None = never in practice."""
    ra, rb = ha / na, hb / nb
    if ra == rb:
        return None
    n = max(na, nb)

    def p_at(m):                                                      # both versions at m views, at the rates seen so far
        a, b = ra * m, rb * m
        pa = prob_a_beats_b(a, m, b, m, steps=3000)
        return 1 - pa if lower_better else pa

    lead_is_a = (ra > rb) != lower_better

    def lead(m):
        p = p_at(m)
        return p if lead_is_a else 1 - p

    if lead(n) >= target:
        return 0
    lo, hi = n, n
    while lead(hi) < target:
        lo, hi = hi, hi * 2
        if hi > GIVE_UP:
            return None
    while hi - lo > max(10, lo // 50):                                # to about 2 percent
        mid = (lo + hi) // 2
        if lead(mid) >= target:
            hi = mid
        else:
            lo = mid
    return max(0, int(math.ceil(hi / 10.0) * 10) - n)


def decide(a, b, lower_better=False, min_views=MIN_VIEWS, metric='hits'):
    ha, na = a
    hb, nb = b
    p = prob_a_beats_b(ha, na, hb, nb)
    p_a_better = 1 - p if lower_better else p                       # the probability that A is the better one
    leader = 'A' if p_a_better >= 0.5 else 'B'
    p_lead = max(p_a_better, 1 - p_a_better)
    rate = lambda h, n: f'{100 * h / n:.1f}%'
    out = {'a': {'hits': ha, 'views': na, 'rate': ha / na}, 'b': {'hits': hb, 'views': nb, 'rate': hb / nb}, 'metric': metric,
           'lower_better': lower_better, 'p_a_better': p_a_better, 'leader': leader, 'p_leader': p_lead}
    lines = [f'{metric}: A {ha} of {na} ({rate(ha, na)}), B {hb} of {nb} ({rate(hb, nb)}){" (lower is better)" if lower_better else ""}.',
             f'Chance that A is really better than B: {100 * p_a_better:.1f}%. Chance that B is: {100 * (1 - p_a_better):.1f}%.']
    short = [(n, v) for n, v in (('A', na), ('B', nb)) if v < min_views]
    if short:
        need = max(min_views - v for _, v in short)
        out.update(verdict='keep testing', more_views_each=need)
        lines.append(f'Keep testing: each version needs at least {min_views} views and {", ".join(f"{n} has {v}" for n, v in short)}. Need about {need} more views each, then read it again.')
    elif p_lead >= CALL:
        out.update(verdict=f'{leader} wins', more_views_each=0)
        lines.append(f'{leader} wins: {100 * p_lead:.1f}% is above the 95% bar, with at least {min_views} views each. Share the winner; the other stays a trial.')
    else:
        more = more_views_needed(ha, na, hb, nb, lower_better)
        if more is None:
            out.update(verdict='no real difference', more_views_each=None)
            lines.append(f'No clear winner, and the two are so close that it would take over {GIVE_UP:,} views each to tell them apart. Stop the test and pick on something else.')
        else:
            out.update(verdict='keep testing', more_views_each=more)
            lines.append(f'Keep testing: {leader} is ahead at {100 * p_lead:.1f}%, short of the 95% bar. Need about {more:,} more views each if the rates hold.')
    out['text'] = '\n'.join(lines)
    return out


def selftest():
    close = lambda x, y, tol=0.004: abs(x - y) <= tol
    # symmetry and the no-information case
    assert close(prob_a_beats_b(50, 1000, 50, 1000), 0.5, 1e-6)
    p = prob_a_beats_b(60, 1000, 40, 1000)
    assert close(p + prob_a_beats_b(40, 1000, 60, 1000), 1.0, 1e-6), p
    # known cases worked by hand: 1 hit in 1 view against 0 in 1 is Beta(2,1) against Beta(1,2): integral of 2x(2x - x^2) = 5/6;
    # 2 of 2 against 0 of 2 is Beta(3,1) against Beta(1,3): 1 - 3 * B(3,4) = 0.95
    assert close(prob_a_beats_b(1, 1, 0, 1), 5 / 6, 0.002), prob_a_beats_b(1, 1, 0, 1)
    assert close(prob_a_beats_b(2, 2, 0, 2), 0.95, 0.002), prob_a_beats_b(2, 2, 0, 2)
    # a clear result: 90 of 1000 against 60 of 1000 is a win
    r = decide((90, 1000), (60, 1000), metric='saves')
    assert r['verdict'] == 'A wins' and r['p_leader'] > 0.95, r
    # a near-tie is not called, and says how many more it needs (or that there is no difference)
    r = decide((55, 1000), (50, 1000))
    assert r['verdict'] in ('keep testing', 'no real difference') and r['p_leader'] < 0.95, r
    # the same gap with a lot more views is a win
    assert decide((600, 10000), (500, 10000))['verdict'] == 'A wins'
    # too few views: never a call, however big the gap
    r = decide((30, 100), (5, 100))
    assert r['verdict'] == 'keep testing' and r['more_views_each'] == 200, r
    # lower is better: fewer skips wins
    r = decide((300, 1000), (400, 1000), lower_better=True, metric='skips')
    assert r['verdict'] == 'A wins', r
    r = decide((400, 1000), (300, 1000), lower_better=True)
    assert r['verdict'] == 'B wins', r
    # more_views_needed: at the rates seen, adding that many views each does reach 95 percent
    m = decide((55, 1000), (45, 1000))
    need = m['more_views_each']
    assert need and need > 0
    assert decide((round(0.055 * (1000 + need)), 1000 + need), (round(0.045 * (1000 + need)), 1000 + need))['p_leader'] >= 0.93
    # identical rates never reach a call
    assert decide((50, 1000), (50, 1000))['verdict'] == 'no real difference'
    # bad numbers are refused
    for bad in ((5, 0), (11, 10), (-1, 10)):
        try:
            prob_a_beats_b(*bad, 5, 10)
        except ValueError:
            continue
        raise AssertionError(bad)
    print('abtest selftest: ok')


def main():
    a = sys.argv[1:]
    if '--selftest' in a:
        return selftest()
    if '--a' not in a or '--b' not in a:
        sys.exit(__doc__)
    try:
        va = (int(a[a.index('--a') + 1]), int(a[a.index('--a') + 2]))
        vb = (int(a[a.index('--b') + 1]), int(a[a.index('--b') + 2]))
        mv = int(a[a.index('--min-views') + 1]) if '--min-views' in a else MIN_VIEWS
        metric = a[a.index('--metric') + 1] if '--metric' in a else 'hits'
        res = decide(va, vb, '--lower-better' in a, mv, metric)
    except (ValueError, IndexError) as e:
        sys.exit(f'abtest: {e}\n\nusage: python3 scripts/abtest.py --a <hits> <views> --b <hits> <views> [--lower-better] [--metric saves] [--min-views 300] [--json]')
    print(json.dumps(res, indent=1) if '--json' in a else res['text'])


if __name__ == '__main__':
    main()

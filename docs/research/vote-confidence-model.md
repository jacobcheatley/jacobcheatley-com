# Confidence model for crowd Votes on a Matchup

Research for ticket 147 (map 146, Elemental Showdown). Question: which well-established
statistical treatment turns a Matchup's Votes (integers −2 to +2, often only a handful)
into (a) a score with a confidence bound, so 5 Votes are not shown as boldly as 500, and
(b) a way to tell a *neutral* Matchup (Votes cluster at 0) from a *controversial* one
(Votes split between the two sides)? And how should Matchup selection lean toward the
least-certain Matchups?

Every number below was computed with a stdlib Python script, and the SQL was run against
a throwaway Postgres 18 container and matched the script to two decimals.

## Recommendation

**One Dirichlet-multinomial posterior per Matchup, read out as three numbers, all from
three sums (`count`, `sum(value)`, `sum(value²)`) in one grouped SQL aggregate.** This is
Evan Miller's star-rating formula [M2] moved onto the −2..+2 scale, where the symmetric
scale makes it collapse to almost nothing.

Give every Matchup `a` phantom Votes on each of the five values before any real Vote
arrives (`a` is the prior strength; `5a` phantom Votes in total, averaging 0). With `n`
real Votes:

```
W  = n + 5a                     total weight
m  = sum(value) / W             shrunk mean, in [−2, +2]      → the tier
V  = (sum(value²) + 10a) / W − m²    posterior variance of one Vote
h  = 1.96 · sqrt(V / (W + 1))   95% half-width of the mean    → the boldness
P  = V / (4 − m²)               polarisation, in [0, 1]       → neutral vs controversial
```

The `10a` is the phantom Votes' `sum(value²)`: `a·(4 + 1 + 0 + 1 + 4)`. Their
`sum(value)` is 0, which is why `m` needs no prior term in the numerator.

Reading a Chart cell:

| Step | Rule (proposed defaults) |
| --- | --- |
| Tier | `abs(m) ≥ 1.5` → 4× (¼× if negative); `abs(m) ≥ 0.5` → 2× (½×); otherwise look at `P` |
| Neutral vs controversial | `P ≥ 0.6` → controversial, else neutral |
| Boldness | `h ≤ 0.25` solid, `h ≤ 0.5` medium, else faint |

Why this one:

- **It is the laziest honest option.** A Vote value is already `log2` of the multiplier
  (+1 ↔ 2×, +2 ↔ 4×, −1 ↔ ½×), so the mean Vote is the log of the crowd's geometric-mean
  multiplier and the tier cuts at ±0.5 and ±1.5 are plain rounding to the nearest Vote
  value.
- **Shrinkage and the interval come from the same model.** The phantom Votes pull a
  1-Vote Matchup toward neutral and stop mattering by n ≈ 30. The half-width is wide when
  Votes are few *or* when they disagree, which is exactly when a cell should be faint.
- **Neutral and controversial separate cleanly.** Both have `m ≈ 0`; `P` is about 0.08 for
  a crowd clustered at 0 and about 0.85 for a ±2 split (tables below). No extra query:
  `P` reuses `sum(value²)`.
- **The empty Matchup needs no special case.** With n = 0 the formulas give `m = 0`,
  `P = 0.5`, and the widest `h` of all: a faint neutral cell.
- **The same `V / (W + 1)` is the Matchup-selection weight** (last section).

Recommended starting prior: **`a = 0.4`, two phantom Votes in total.** Reasoning and the
`a = 1` alternative are under "Open choices".

### SQL

Table and column names are placeholders; the schema is not settled by this ticket.

```sql
with tally as (
  select matchup.id,
         count(vote.value) + 5 * :a                          as weight,
         coalesce(sum(vote.value), 0)                        as net,
         coalesce(sum(vote.value * vote.value), 0) + 10 * :a as squares
  from matchup left join vote on vote.matchup_id = matchup.id
  group by matchup.id
), posterior as (
  select *, net / weight as mean, squares / weight - (net / weight) ^ 2 as variance
  from tally
)
select id,
       mean,
       1.96 * sqrt(variance / (weight + 1)) as half_width,
       variance / (4 - mean ^ 2)            as polarisation
from posterior;
```

`left join` plus `count(vote.value)` keeps zero-Vote Matchups in the Chart. `4 − mean²`
cannot reach 0 while `a > 0`, because the phantom Votes keep `abs(mean) < 2`.

A Vote's sign only means something if each unordered Matchup has a fixed orientation
(for example, the Element with the lower id is the positive side). That is a schema
decision this model depends on.

## The four crowds used for worked numbers

Shares of Votes on −2, −1, 0, +1, +2, scaled to n by largest remainder. At n = 1 the
single Vote is the crowd's most likely one.

| Crowd | Shares | True mean | n = 5 | n = 30 |
| --- | --- | --- | --- | --- |
| Decisive | 0, 0, .05, .20, .75 | +1.70 | 0,0,0,1,4 | 0,0,2,6,22 |
| Leaning | .05, .10, .25, .40, .20 | +0.60 | 0,1,1,2,1 | 2,3,7,12,6 |
| Neutral | 0, .15, .70, .15, 0 | 0 | 0,1,3,1,0 | 0,5,21,4,0 |
| Controversial | .40, .10, 0, .10, .40 | 0 | 2,1,0,0,2 | 12,3,0,3,12 |

## Candidate 1: Wilson interval on a collapsed win share

The Wilson score interval for a binomial proportion [W], with `p̂` the observed share,
`n` the count and `z = 1.96`:

```
( p̂ + z²/2n ± z·sqrt( p̂(1−p̂)/n + z²/4n² ) ) / ( 1 + z²/n )
```

Miller's "How Not To Sort By Average Rating" [M1] popularised sorting by its lower bound
and gives it as a one-line SQL expression over `positive` and `negative` counts. Brown,
Cai and DasGupta [BCD] recommend Wilson (or the Jeffreys interval) for small n and show
the textbook Wald interval's coverage is erratic, so Wilson is the right interval *if*
the data is binomial. A five-valued Vote is not, so it has to be collapsed first, and
there are two ways.

**1a. Sign only.** `p̂` = Votes for A ÷ (Votes for A + Votes for B); 0-Votes are dropped.

| Crowd | n = 1 | n = 5 | n = 30 | n = 500 |
| --- | --- | --- | --- | --- |
| Decisive | [.21, 1.00] | [.57, 1.00] | [.88, 1.00] | [.99, 1.00] |
| Leaning | [.21, 1.00] | [.30, .95] | [.58, .90] | [.76, .84] |
| Neutral | undefined (0 left) | [.09, .91] (2 left) | [.19, .73] (9 left) | [.42, .58] |
| Controversial | [.00, .79] | [.12, .77] | [.33, .67] | [.46, .54] |

It behaves well at small n (one Vote gives [.21, 1], rightly almost uninformative), and it
is one SQL aggregate with two `count(*) filter (where …)`. But it fails the ticket twice:
it throws away strength, so it cannot tell 2× from 4×; and the last two rows converge on
the same interval, so **it cannot tell neutral from controversial**. It also discards
most of a neutral Matchup's Votes.

**1b. Rescaled mean.** `p̂ = (mean + 2) / 4`, the "weighted share" in the Chart's glossary
entry, fed to Wilson with the full n; map the bounds back with `4p − 2`. This is valid but
conservative: any variable bounded in [0, 1] has variance at most `p(1 − p)`
(Bhatia–Davis [BD]), so the binomial variance Wilson assumes is an upper bound.

| Crowd | n = 1 | n = 5 | n = 30 | n = 500 |
| --- | --- | --- | --- | --- |
| Decisive | [−1.17, +2.00] | [+0.05, +1.99] | [+1.06, +1.90] | [+1.59, +1.78] |
| Leaning | [−1.17, +2.00] | [−0.95, +1.62] | [−0.15, +1.15] | [+0.43, +0.76] |
| Neutral | [−1.78, +1.78] | [−1.32, +1.32] | [−0.70, +0.64] | [−0.17, +0.17] |
| Controversial | [−2.00, +1.17] | [−1.43, +1.20] | [−0.67, +0.67] | [−0.17, +0.17] |

One SQL aggregate, keeps strength, no tuning knob. The cost of the conservatism shows in
the neutral row: thirty Votes clustered at 0 still get ±0.67, the same as a crowd at war,
because Wilson assumes every Vote is ±2. It treats a neutral Matchup as the worst case.
Again neutral and controversial are identical.

## Candidate 2: Bayesian shrinkage toward a neutral prior (recommended)

The "Bayesian average" adds `C` phantom observations at a prior mean:
`(C·prior + Σx) / (C + n)` [BA]. With the prior at 0 that is `sum(value) / (n + C)`. It
gives a score but no interval.

Miller's "Ranking Items With Star Ratings" [M2] supplies the interval. Put a
Dirichlet prior on the five Vote-value probabilities; the posterior is Dirichlet with the
counts added. For scores `s_k`, counts `n_k`, `N` Votes and `K` values, his
normal-approximation bound with one phantom Vote per value is:

```
Σ s_k (n_k+1)/(N+K)  ±  z · sqrt( ( Σ s_k² (n_k+1)/(N+K) − (Σ s_k (n_k+1)/(N+K))² ) / (N+K+1) )
```

Generalise the `+1` to `+a` and substitute `s = −2..+2`: `Σ s_k n_k` is `sum(value)`,
`Σ s_k² n_k` is `sum(value²)`, and the prior adds 0 and `10a`. That is the formula block
in the Recommendation, with `C = 5a`. The per-value counts are never needed.

Shrunk mean `m` with its 95% interval, `a = 0.4`:

| Crowd | n = 1 | n = 5 | n = 30 | n = 500 |
| --- | --- | --- | --- | --- |
| Decisive | +0.67 ± 1.46 | +1.29 ± 0.80 | +1.56 ± 0.27 | +1.69 ± 0.05 |
| Leaning | +0.67 ± 1.46 | +0.43 ± 0.82 | +0.53 ± 0.39 | +0.60 ± 0.09 |
| Neutral | 0.00 ± 1.13 | 0.00 ± 0.64 | −0.03 ± 0.22 | 0.00 ± 0.05 |
| Controversial | −0.67 ± 1.46 | −0.14 ± 1.20 | 0.00 ± 0.62 | 0.00 ± 0.16 |

The same with Miller's default `a = 1` (five phantom Votes):

| Crowd | n = 1 | n = 5 | n = 30 | n = 500 |
| --- | --- | --- | --- | --- |
| Decisive | +0.33 ± 1.10 | +0.90 ± 0.81 | +1.43 ± 0.32 | +1.68 ± 0.05 |
| Leaning | +0.33 ± 1.10 | +0.30 ± 0.75 | +0.49 ± 0.39 | +0.59 ± 0.09 |
| Neutral | 0.00 ± 0.96 | 0.00 ± 0.65 | −0.03 ± 0.24 | 0.00 ± 0.05 |
| Controversial | −0.33 ± 1.10 | −0.10 ± 0.97 | 0.00 ± 0.58 | 0.00 ± 0.16 |

Unlike 1b, the interval uses the Votes' actual spread: at n = 30 neutral is ±0.22 and
controversial is ±0.62. By n = 500 the prior is invisible.

Limits to know about:

- The posterior sd of the mean is exact; only the "± 1.96 sd" bell shape is approximate.
  At n ≤ 2 the interval can poke past ±2 (one +2 Vote with `a = 0.4` gives an upper end of
  +2.13). For choosing a boldness level that is harmless; clamp if the number is ever
  displayed.
- It treats Vote values as interval-scaled (the gap from 0 to +1 equals +1 to +2). Here
  that is the design, not an assumption: the values *are* `log2` multipliers.
- An exact interval would sample the Dirichlet posterior, which needs application code.
  Sampling it 40,000 times gave half-widths of 1.40, 0.78, 1.16 and 0.22 where the formula
  gives 1.46 (one +2 Vote), 0.80 (decisive, n = 5), 1.20 (controversial, n = 5) and 0.22
  (neutral, n = 30): the same boldness level every time, so it is not worth it.

## Candidate 3: telling neutral from controversial

Neither candidate above can do this from the mean alone; it needs a measure of spread.

**3a. Normalised variance (recommended).** On a scale bounded by −2 and +2 with mean `μ`,
variance is at most `(2 − μ)(μ + 2) = 4 − μ²`, with equality only when every Vote is at an
extreme (Bhatia–Davis [BD]). So `P = variance / (4 − mean²)` runs from 0 (everyone gave the
same Vote) to 1 (everyone voted ±2). Five equally popular values score exactly 0.5, which
makes 0.5 the natural "flatter than flat means U-shaped" line. With the Dirichlet
posterior's variance, `P` starts at 0.5 for an empty Matchup and moves as Votes arrive.

**3b. Van der Eijk's agreement A** [E], the standard measure for ordered rating scales.
Peel the histogram into flat layers; each layer scores `A = U · (1 − (S − 1)/(K − 1))`
where `S` is the number of non-empty values, `K = 5`, and
`U = ((K−2)·TU − (K−1)·TDU) / ((K−2)·(TU + TDU))` counts triples of values that fit
(`110`, `011`) or break (`101`) unimodality; A is the layer-size-weighted mean. +1 is full
agreement, 0 is flat, −1 is a half-and-half split at the extremes. The `agrmt` R package
[R] is the reference implementation; my 25-line port reproduces its documented
`0.6113333`. It needs the five per-value counts and a loop, so **application code, not
SQL**. It has no small-sample behaviour of its own: one Vote scores a perfect +1.

**3c. Esteban–Ray polarisation** [ER], the economics standard:
`K · Σ_i Σ_j π_i^(1+α) · π_j · |y_i − y_j|`, with `α ∈ (0, ≈1.6]`. `α = 0` is the Gini
coefficient; larger `α` rewards big like-minded groups. Their Theorem 2 has the
half-and-half split at the extremes as the most polarised distribution. A 5 × 5 double
sum over the histogram: possible in SQL as a self-join of per-value shares, natural in
application code, and it adds a second knob (`α`).

**Also seen:** Leik's ordinal dispersion, Tastle and Wierman's entropy-based consensus,
Blair and Lacy's l² (all in [R]). Same two anchor points as A, all need the histogram.

All four at `abs(mean) < 0.5`, using raw Votes unless stated (Esteban–Ray at `α = 1`,
rescaled so the extreme split is 1):

| Crowd, n | P with prior `a = 0.4` | P raw | A | Esteban–Ray |
| --- | --- | --- | --- | --- |
| Neutral, 1 | 0.33 | 0.00 | +1.00 | 0.00 |
| Neutral, 5 | 0.21 | 0.10 | +0.70 | 0.22 |
| Neutral, 30 | 0.10 | 0.07 | +0.78 | 0.19 |
| Neutral, 500 | 0.08 | 0.07 | +0.78 | 0.19 |
| Controversial, 5 | 0.75 | 0.85 | −0.57 | 0.70 |
| Controversial, 30 | 0.83 | 0.85 | −0.66 | 0.68 |
| Controversial, 500 | 0.85 | 0.85 | −0.66 | 0.68 |

(Controversial at n = 1 is a single −2 Vote: `m = −0.67`, a faint ½× cell, so `P` is not
consulted.)

All three agree on which crowd is which, at every n. A and Esteban–Ray are designed for
questions this Chart does not ask (ordinal-only scales; group identification), and both
need code. `P` is free, and only the prior version behaves at tiny n: raw `P`, A and
Esteban–Ray all call a single Vote perfect agreement. Note what `P` deliberately calls
neutral: a half +1, half −1 crowd scores 0.25. A mild disagreement is "too close to
call", not a controversy.

## Behaviour of the recommended rule

`a = 0.4`, tier cuts 0.5 and 1.5, `P ≥ 0.6`, boldness at `h` 0.25 and 0.5:

| Crowd | n = 1 | n = 5 | n = 30 | n = 500 |
| --- | --- | --- | --- | --- |
| Decisive | 2×, faint | 2×, faint | 4×, medium | 4×, solid |
| Leaning | 2×, faint | neutral, faint | 2×, medium | 2×, solid |
| Neutral | neutral, faint | neutral, faint | neutral, solid | neutral, solid |
| Controversial | ½×, faint | controversial, faint | controversial, faint | controversial, solid |

Rough Vote counts to leave faint: about 8 for a neutral Matchup, 12 to 17 for a one-sided
one, about 50 for a controversial one. A controversial Matchup is slow to firm up because
it is genuinely the hardest case: with Votes at ±2 it takes many of them to be sure the
mean is near 0 and not quietly on one side.

## Matchup selection: weighting toward the least-certain

This is not a reward-maximising bandit. Thompson sampling [T] and UCB balance exploring
against *exploiting the best arm*; here there is no best Matchup, only 435 means to
estimate. The matching literature is allocation for estimation:

- **Neyman allocation**: to minimise total error, sample each stratum in proportion to its
  standard deviation [N]. Antos, Grover and Szepesvári [AGS] treat the sequential version
  ("active learning in multi-armed bandits"): for *equally* precise means the optimal
  share is proportional to the variance, learned as you go.
- **Uncertainty sampling** from active learning [S]: query the item the model is least
  sure about. The deterministic form is wrong here: every voter would get the same
  sequence, and a voter never sees a Matchup twice anyway.

The lazy version that lands on Neyman: **draw the next Matchup at random with weight
`V / (W + 1)`**, the posterior variance of the mean, which the Chart aggregate already
computes. Few Votes → large weight; controversial → large weight; zero Votes → largest.
In a simulation with three arms of true sd 0.5, 1 and 2, 30,000 draws settled at Vote
counts in ratio 1 : 1.97 : 3.97, which is allocation proportional to sd.

The weighted draw is one `order by` (Efraimidis–Spirakis [ES]: key `−ln(u) / weight`,
smallest key wins):

```sql
select id from tally   -- the same tally CTE as the Chart
where not exists (select 1 from vote
                  where vote.matchup_id = tally.id and vote.voter_id = :voter)
order by -ln(1 - random()) / ((squares / weight - (net / weight) ^ 2) / (weight + 1))
limit 1;
```

`1 - random()` because `random()` can return 0 and `ln(0)` is an error. In Postgres 18,
6,000 draws over six test Matchups matched the weights to within 0.01.

With the n = 30 fixtures and `a = 0.4`, a zero-Vote Matchup is drawn about 7× as often as
the controversial one and about 50× as often as the settled neutral one. If that feels too
greedy toward obscure Matchups for a fun voting session, flatten it with
`power(weight, 0.5)` or mix in a share of uniform draws; that is a feel question for the
vote-interaction prototype, not a statistical one.

Adaptive collection can bias sample means (Nie et al. [NTTZ]), but the mechanism is
collecting *more from arms that looked good*. Weighting by variance does not look at the
sign of the mean, and the shrunk estimator is not a raw sample mean, so I would not
correct for it on a hobby Chart.

## Open choices for the owner

1. **Prior strength `a`.** `a = 1` is Miller's published default (5 phantom Votes) and the
   most cautious: a crowd whose true mean is +1.7 does not reach 4× until about 38 Votes.
   `a = 0.4` (2 phantom Votes) reaches it at about 15. The principled value is
   `5a = within-Matchup Vote variance ÷ between-Matchup variance of true means`
   (normal–normal shrinkage; the same ratio Efron and Morris [EM] estimate from data).
   Guessing 1.2 ÷ 0.7 gives about 2, hence the recommendation. Once about 50 Matchups have
   10+ Votes, both variances are one query away and the guess can be checked.
2. **Tier cuts.** 0.5 and 1.5 are "round to the nearest Vote value". 4× then needs most
   voters to say *strongly*; lower the 1.5 if 4× turns out too rare on the real Chart.
3. **Controversial line `P ≥ 0.6`.** 0.5 is the flat distribution; 0.6 keeps a lone Vote
   or a lukewarm ±1 split out. Anything from 0.55 to 0.7 is defensible.
4. **Boldness cut-offs** (0.25 and 0.5), and whether boldness is three steps or a
   continuous opacity such as `clamp(1 − h, 0.25, 1)`. A design question.
5. **Whether a faint cell shows a tier at all.** At n = 2, one +2 and one −2 already read
   "controversial, faint". Statistically that is the best guess; as a word on a public
   Chart it may be too strong. The alternative is an "undecided" look below some `h`.
6. **Interval level.** `z = 1.96`; a lower `z` (1.64, 1.28) makes everything bolder sooner.
   It only ever multiplies `h`, so it is interchangeable with moving the boldness cut-offs.
7. **Selection greed**, as above.

## Knock-on notes for other tickets

- The glossary says the Chart is "worked out from the weighted share of Votes". Under this
  model it is the shrunk mean Vote; `(m + 2) / 4` is that share. Worth one wording pass
  when the spec is assembled.
- The map's settled line "Matchup selection upweights the Matchups with the least Vote
  data" becomes "least-certain": same behaviour early on, but controversial Matchups keep
  drawing Votes after quiet ones have settled.
- Cold start ("what the reveal says when a Matchup has almost no Votes") has a ready
  signal: `h`, or simply `n`.
- The Chart unlock's "enough Votes overall" could be stated as "share of Matchups that
  have left faint" with no new machinery.

## Sources

- [M1] Evan Miller, "How Not To Sort By Average Rating", 2009.
  https://www.evanmiller.org/how-not-to-sort-by-average-rating.html
- [M2] Evan Miller, "Ranking Items With Star Ratings", 2014.
  https://www.evanmiller.org/ranking-items-with-star-ratings.html
  (and "Bayesian Average Ratings", https://www.evanmiller.org/bayesian-average-ratings.html,
  for his own note that the Wilson sort is a pragmatic hack)
- [W] E. B. Wilson, "Probable inference, the law of succession, and statistical
  inference", JASA 22(158), 1927. Formula as given at
  https://en.wikipedia.org/wiki/Binomial_proportion_confidence_interval
- [BCD] Brown, Cai, DasGupta, "Interval Estimation for a Binomial Proportion",
  Statistical Science 16(2), 2001. https://doi.org/10.1214/ss/1009213286
- [BA] "Bayesian average". https://en.wikipedia.org/wiki/Bayesian_average
- [BD] Bhatia, Davis, "A Better Bound on the Variance", American Mathematical Monthly
  107(4), 2000. https://en.wikipedia.org/wiki/Bhatia%E2%80%93Davis_inequality
- [E] C. van der Eijk, "Measuring Agreement in Ordered Rating Scales", Quality & Quantity
  35(3), 2001. https://doi.org/10.1023/A:1010374114305
- [R] D. Ruedin, "An Introduction to the R Package Agrmt" (worked layer example, Leik,
  Tastle–Wierman, Blair–Lacy).
  https://cran.r-project.org/web/packages/agrmt/vignettes/agrmt.pdf
- [ER] Esteban, Ray, "On the Measurement of Polarization", Econometrica 62(4), 1994.
  https://pages.nyu.edu/debraj/Courses/Readings/Esteban%20Ray94.pdf
- [T] Russo, Van Roy, Kazerouni, Osband, Wen, "A Tutorial on Thompson Sampling",
  Foundations and Trends in Machine Learning 11(1), 2018. https://arxiv.org/abs/1707.02038
- [N] J. Neyman, "On the Two Different Aspects of the Representative Method", JRSS 97(4),
  1934. Cited from memory of the standard attribution, not re-read.
- [AGS] Antos, Grover, Szepesvári, "Active Learning in Multi-armed Bandits", ALT 2008.
  https://link.springer.com/chapter/10.1007/978-3-540-87987-9_25 (abstract only read)
- [S] B. Settles, "Active Learning Literature Survey", 2009. Cited from memory, not
  re-read.
- [ES] Efraimidis, Spirakis, "Weighted random sampling with a reservoir", Information
  Processing Letters 97(5), 2006. Key formula as given at
  https://en.wikipedia.org/wiki/Reservoir_sampling
- [NTTZ] Nie, Tian, Taylor, Zou, "Why Adaptively Collected Data Have Negative Bias and How
  to Correct for It", AISTATS 2018. https://proceedings.mlr.press/v84/nie18a.html
  (abstract only read)
- [EM] Efron, Morris, "Data Analysis Using Stein's Estimator and Its Generalizations",
  JASA 70(350), 1975. Cited from memory, not re-read.

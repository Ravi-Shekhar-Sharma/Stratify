# Assumptions and parameters

Single source of truth. Every number in the engine, the README, the proposal,
the pitch deck and the demo video traces to this file. If a number appears
anywhere and is not here, it is a bug.

The modelled line is a simulation of a mass-market vehicle assembly plant. It is
not real plant data and we do not claim it is. Parameters are chosen to sit
inside publicly documented ranges for the industry, and where a parameter was
derived rather than sourced, the derivation is shown.

## Line structure

42 stations across three shops.

| Shop | Stations | Sensored | Partial | Blind |
| --- | --- | --- | --- | --- |
| Body construction | 12, B1 to B12 | 12 | 0 | 0 |
| Paint | 8 stages, P1 to P8 | 6 | 2 | 0 |
| Final assembly | 22, S1 to S22 | 14 | 2 | 6 |
| Total | 42 | 32 | 4 | 6 |

32 of 42 well instrumented, 76 percent. 10 of 42 blind or partial, 24 percent.

The coverage gradient is deliberate and reflects reality. Body construction is
over 90 percent robotic and therefore almost fully instrumented. Paint is
process controlled and mostly instrumented. Final assembly is manual-heavy and
that is where the blindness concentrates.

Blind stations in final assembly: S3, S6, S11, S14, S17, S19.
Partial stations: S8, S21 in final assembly, P7 and P8 in paint.

This matches the Round 2 brief's own framing of a majority of stations well
instrumented with a meaningful minority reliant on manual checks. It does not
match Round 1's claim that final assembly has almost 24% blind/partial, and the
brief's version is the one we use.

Scope note for honesty: a real automotive final assembly line runs roughly 200
to 500 stations. 42 is a line segment scaled to be demonstrable. We say so
rather than implying we modelled a whole plant.

## Timing

| Parameter | Value | Where it comes from |
| --- | --- | --- |
| Takt time | 54 s | Derived: 2 shifts x 7.5 effective hours = 54,000 s per day, at 1,000 vehicles per day |
| Shifts per day | 2 | |
| Effective hours per shift | 7.5 | Net of breaks and changeover |
| Daily volume | 1,000 vehicles | |
| Industry takt range | 45 to 60 s | Mass-market vehicle assembly |

## Buffers and work in progress

| Location | Nominal | Capacity | Why it exists |
| --- | --- | --- | --- |
| Painted Body Store, between P8 and S1 | 180 bodies | 400 | Colour batching and re-sequencing. Real plants hold 1 to 4 hours of production here |
| Trim to chassis decoupling buffer, between S8 and S9 | 2.5 units | 15 | Segment handover |
| Inter-station WIP elsewhere in final assembly | 0 to 1 unit | 2 | Coupled conveyor. This is why occupancy is not an available signal for most stations |

The 2.5 unit nominal fill on the trim to chassis buffer is load bearing. It is
what produces the 7 minute prediction lead time in the demo incident, and the
derivation is below.

## Observability tiers

A station's tier determines which signals the twin can read from it, and
therefore the maximum confidence achievable there.

| Tier | Signals available | Max confidence |
| --- | --- | --- |
| Sensored | True cycle time, plus process values where applicable | 0.99 |
| Partial | Entry and exit scans, events, and one process value | 0.90 |
| Blind | Entry and exit scans, events only | 0.90 |
| Blind, adjacent to another blind station | Same, but not separately identifiable | abstain |

The last row is the abstention rule. Two adjacent blind stations cannot be
separated from timing alone, because the observed dwell across the pair is a sum
and the split between them is unidentifiable. In that case the twin reports no
estimate and states the reason. It does not guess.

Confidence floor for reporting an estimate: 0.60. Below that, abstain.

## The demo incident

| Item | Value |
| --- | --- |
| Blind station | S6 Seats, final assembly |
| Nominal cycle | 55 s |
| Degraded cycle | 80 s |
| Confidence, steady state | 0.72 |
| Confidence, during incident | 0.86 |
| Downstream station affected | S9 Fluids |
| Predicted time to starvation | about 7 minutes |
| Vehicles at risk | about 14 |
| Defect path 1 | Torque drift at S2 Cockpit, would otherwise surface at end of line after about 30 vehicles |
| Defect path 2 | Paint booth humidity drift at P3 Basecoat, surfaces at paint inspection |
| Recommendation | Move one operator to S6, and add one sensor to raise achievable confidence from 0.81 to 0.99 |

### Derivation of the 7 minute lead time

S6 degraded to 80 s delivers one unit every 80 s. Downstream consumes one every
54 s at takt.

Net drain rate = 1/54 - 1/80 = 0.018519 - 0.012500 = 0.006019 units per second.

Trim to chassis buffer nominal fill 2.5 units.

Time to empty = 2.5 / 0.006019 = 415 s = 6.9 minutes, reported as about 7
minutes.

### Derivation of the 14 vehicles at risk

14 is the production lost during the projected line stop, not the number of
vehicles currently on the line.

Projected stop duration if S6 is not corrected: about 13 minutes, being the time
to detect, dispatch and restore normal cycle.

780 s / 54 s takt = 14.4 vehicles, reported as about 14.

Both figures are stated as approximate because they are model outputs, not
measurements.

## Signal classes

| Class | Content | Already exists in a real plant as | New hardware |
| --- | --- | --- | --- |
| Timing | Station entry and exit timestamps per vehicle | VIN barcode and carrier RFID scans in the MES | None |
| Event | Andon pulls, line stops, cycle stop reason codes | Andon system and line control logs | None |
| Occupancy | Buffer and queue depth | Buffer management, and only where buffers exist | None |

The timing and event classes require no new instrumentation, which is the whole
economic argument. Event data also provides labelled ground truth for training
at no cost.

## Instrumentation cost, for the sensor placement optimiser

These figures are order-of-magnitude ranges pending verification and are labelled
as estimates wherever they appear in an external document.

| Tier | Per station | Notes |
| --- | --- | --- |
| Prototype grade | 40 to 250 USD | Hobby-grade sensing, not plant deployable |
| Plant deployable industrial grade | 2,000 to 4,500 USD | Rated hardware, installation, integration, validation |

The roughly 30 to 60 times gap between inferring a station and instrumenting it
is the business case. Every station left blind and inferred avoids the
industrial-tier cost.

Constraint the optimiser must respect: plants permit instrumentation changes
only during a small number of scheduled maintenance windows per year, so sensor
additions batch into those windows rather than arriving continuously.

## What is simulated and what is not

Simulated: the line, all station cycle times, all sensor readings, all events,
all defects.

Real: the parameter ranges, the signal classes and where they exist in a plant,
the integration model, the standards referenced, and the metrics, which are
computed on held-out simulated data using standard methods rather than asserted.

Not claimed: validation on real plant data. Any accuracy figure we publish is
accuracy on our own simulation, and the README says so in its first section.

## Pending verification

The following numbers are unverified as of 2026-08-25 and are owned by teammate
2. Anything still unverified at submission is either labelled a stated
assumption or removed.

- Instrumentation cost ranges above.
- Automotive unplanned downtime cost per minute.
- Cost of poor quality as a percentage of revenue.
- All claims about Accenture products, acquisitions and statements.
```

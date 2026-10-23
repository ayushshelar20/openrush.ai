# Relay MVP Architecture

## Product intent

Relay is a real-time coordination layer for perishable surplus and fragile aid. The first MVP gives each participant a focused dashboard while keeping a shared operational model underneath:

**Receiver demand alert → compatible supplier offer → capacity-aware rider assignment → timed handoff → confirmation or recovery.**

The core design principle is that time, transport capacity, compatibility, and human reliability are state variables—not notes hidden in a chat thread.

## Basic system shape

```text
┌──────────────────────┐       ┌──────────────────────────┐
│ Receiver / Shelter   │       │ Supplier                 │
│ creates demand alert │       │ offers compatible surplus│
└──────────┬───────────┘       └────────────┬─────────────┘
           │                                │
           └──────────────┬─────────────────┘
                          ▼
                 ┌─────────────────┐
                 │ Matching engine │
                 │ time + fit +    │
                 │ capacity + risk │
                 └────────┬────────┘
                          ▼
                 ┌─────────────────┐
                 │ Dispatch board  │◄──── rider availability /
                 │ reservations    │      check-ins / expiry
                 └────────┬────────┘
                          ▼
                 ┌─────────────────┐
                 │ Handoff record  │
                 │ proof + impact  │
                 └────────┬────────┘
                          ▼
                 ┌─────────────────┐
                 │ Recovery queue  │
                 │ reassign / close│
                 └─────────────────┘
```

## MVP pages implemented

- `index.html` — landing page, problem framing, role entry points, workflow explanation, safety controls, and dashboard preview.
- `supplier.html`, `rider.html`, `receiver.html` — basic role dashboards for the first end-to-end click path.
- Auth modal — sign-in/create-account interaction with role selection for Supplier, Volunteer Rider, and Receiver/Shelter. It is intentionally demo-only until a backend is added.
- Shared operations preview — demonstrates demand alerts, in-transit work, safe handoff rate, and recovery-oriented network health.

## Recommended next application layers

### Frontend

- Route-level role dashboards: `/supplier`, `/rider`, `/receiver`.
- Shared event stream for demand, offer, assignment, check-in, delay, cancellation, and handoff events.
- Optimistic UI with visible state timestamps and an event history for every reservation.

### Backend services

1. **Identity and role service** — users, organizations, permissions, verification status.
2. **Demand service** — receiver alerts with intake window, quantity, item constraints, and expiry.
3. **Supply service** — donor offers with preparation status, temperature/packaging metadata, and pickup window.
4. **Dispatch service** — rider capacity, route matching, reservation leases, check-ins, and reassignments.
5. **Safety and audit service** — mandatory handoff confirmations, exception reasons, and immutable timeline.
6. **Notification service** — SMS/push/email with escalation rules and quiet hours.

### Suggested first data model

```text
DemandAlert
  id, receiverId, status, quantity, unit, itemTags[], dietaryTags[],
  requiredBy, intakeWindow, maxTemperature, createdAt, expiresAt

SupplyOffer
  id, supplierId, demandAlertId?, status, quantity, itemTags[],
  dietaryTags[], packagingType, readyAt, pickupBy, expiresAt

RiderProfile
  id, userId, vehicleType, capacityUnits, coldStorage, availabilityStatus,
  currentLocation, lastCheckInAt, reliabilityScore

Reservation
  id, demandAlertId, supplyOfferId, riderId, status, expiresAt,
  reservedAt, pickupEta, dropoffEta, fallbackPlanId

Handoff
  id, reservationId, pickupConfirmedAt, dropoffConfirmedAt,
  recipientName, quantityReceived, condition, exceptionCode, notes
```

## Rules that prevent the “spoilage trap”

- **Leased reservations:** a reservation expires unless the responsible actor checks in before the lease deadline; expired capacity returns to the matching queue.
- **No ghost reservations:** only a confirmed supplier offer + confirmed rider lease + receiver intake window can show as committed.
- **Compatibility gates:** reject or warn on dietary, temperature, packaging, vehicle, quantity, and timing conflicts before assignment.
- **Risk-based dispatch:** prioritize the smallest safe slack between `now`, pickup deadline, and receiver intake close—not just distance.
- **Recovery state machine:** `proposed → reserved → pickup-confirmed → in-transit → dropoff-confirmed`, with `expired`, `cancelled`, `blocked`, and `reassigned` as explicit exits.
- **Human check-ins:** missed check-ins create an actionable exception instead of silently leaving a stale “in transit” card.

## Production boundary for the next iteration

This first build is a static, responsive prototype with local browser interactions. It does not yet persist users, send alerts, calculate routes, or connect to live location/temperature data. The next feature should be the Receiver demand-alert flow backed by a small API and a real event timeline, because it becomes the source event for the rest of the coordination loop.

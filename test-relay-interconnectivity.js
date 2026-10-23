/**
 * End-to-End Interconnectivity & Constraint Verification Test Suite
 */

const assert = require('assert');
const RelayStore = require('./relay-store.js');

console.log('--- STARTING RELAY INTERCONNECTIVITY TEST SUITE ---');

// Reset store to known initial state
RelayStore.resetToDefaults();
let state = RelayStore.getState();

console.log('✓ Store reset to clean initial state');
assert.strictEqual(state.demands.length, 3, 'Initial demands count must be 3');
assert.strictEqual(state.offers.length, 1, 'Initial offers count must be 1');
assert.strictEqual(state.riders.length, 2, 'Initial riders count must be 2');
assert.strictEqual(state.assignments.length, 1, 'Initial assignment asg-301 must exist');

// 1. TEST INITIAL SEEDED ASSIGNMENT ROUTE FLOW
console.log('\n--- TEST 1: Initial Route Acceptance and Full Delivery Lifecycle ---');
const seedAsg = state.assignments[0];
assert.strictEqual(seedAsg.id, 'asg-301');
assert.strictEqual(seedAsg.status, 'Pending Acceptance');

// Rider accepts route
const initialRiderCapacity = RelayStore.getRider('rider-jr').currentCapacity;
RelayStore.acceptRoute('asg-301', 'rider-jr');
state = RelayStore.getState();
const acceptedAsg = state.assignments.find(a => a.id === 'asg-301');
const riderAfterAccept = state.riders.find(r => r.id === 'rider-jr');

assert.strictEqual(acceptedAsg.status, 'Accepted', 'Assignment must be Accepted');
assert.strictEqual(riderAfterAccept.currentCapacity, initialRiderCapacity - acceptedAsg.quantity, 'Rider capacity must be reserved');
console.log(`✓ Rider accepted route. Capacity reserved: ${riderAfterAccept.currentCapacity} units remaining.`);

// Invalid status transition check (cannot jump straight to Delivered from Pending or invalid transition)
assert.throws(() => {
  RelayStore.updateDeliveryStatus('asg-301', 'Pending Acceptance');
}, /Invalid status transition/, 'Invalid status transition must be prevented');
console.log('✓ Invalid status transition prevented as required by constraint engine.');

// Rider confirms pickup (In Transit)
RelayStore.updateDeliveryStatus('asg-301', 'In Transit');
state = RelayStore.getState();
const transitAsg = state.assignments.find(a => a.id === 'asg-301');
const linkedDemand = state.demands.find(d => d.id === transitAsg.demandId);

assert.strictEqual(transitAsg.status, 'In Transit');
assert.strictEqual(linkedDemand.status, 'In Transit', 'Shelter demand status must reflect In Transit');
console.log('✓ Route marked In Transit. Shelter and Supplier status updated.');

// Rider confirms delivery (Delivered)
const initialHandoffs = riderAfterAccept.handoffsCompleted;
const initialConfirmedMeals = state.receiverProfile.mealsConfirmed;
RelayStore.updateDeliveryStatus('asg-301', 'Delivered');
state = RelayStore.getState();
const deliveredAsg = state.assignments.find(a => a.id === 'asg-301');
const riderAfterDelivery = state.riders.find(r => r.id === 'rider-jr');

assert.strictEqual(deliveredAsg.status, 'Delivered');
assert.strictEqual(riderAfterDelivery.currentCapacity, initialRiderCapacity, 'Rider capacity must be restored');
assert.strictEqual(riderAfterDelivery.handoffsCompleted, initialHandoffs + 1, 'Rider handoffs completed must increment');
assert.strictEqual(state.receiverProfile.mealsConfirmed, initialConfirmedMeals + deliveredAsg.quantity, 'Shelter meals confirmed must update');
console.log(`✓ Safe handoff completed! Capacity restored to ${riderAfterDelivery.currentCapacity}, handoffs = ${riderAfterDelivery.handoffsCompleted}, shelter confirmed = ${state.receiverProfile.mealsConfirmed}.`);

// 2. TEST END-TO-END FLOW: RECEIVER CREATES DEMAND -> SUPPLIER POSTS SURPLUS -> DISPATCH -> RIDER TRANSIT -> DELIVER
console.log('\n--- TEST 2: Complete Receiver -> Supplier -> Volunteer End-to-End Interconnectivity ---');

// Step A: Shelter creates new demand alert
const newDemand = RelayStore.createDemandAlert({
  category: 'Drinking Water',
  quantity: 20,
  location: 'Harbor Shelter · North Gate',
  reason: 'Water main rupture in sector 4. Clean drinking water required urgently.',
  urgency: 'Critical',
  deadline: '2026-10-23T22:00'
});
console.log(`✓ Shelter created demand: ${newDemand.id} (${newDemand.quantity} units of ${newDemand.category})`);

state = RelayStore.getState();
const foundDemand = state.demands.find(d => d.id === newDemand.id);
assert(foundDemand, 'Created demand must appear in shared state');

// Step B: Supplier posts surplus offer
const newOffer = RelayStore.createSupplyOffer({
  category: 'Drinking Water',
  quantity: 30,
  location: 'Juniper Kitchen · Storage Room C',
  expiryDeadline: '2026-10-24T12:00',
  handlingRequirements: 'Bottled cases · Dry pallet storage'
});
console.log(`✓ Supplier posted surplus: ${newOffer.id} (${newOffer.quantity} units of ${newOffer.category})`);

state = RelayStore.getState();
const foundOffer = state.offers.find(o => o.id === newOffer.id);
assert(foundOffer, 'Created offer must appear in shared state');
assert.strictEqual(foundOffer.availableQuantity, 30);

// Step C: Supplier reviews demand, validates constraints, and dispatches to Maya Lin (Cargo Van)
const newAssignment = RelayStore.createAssignment({
  demandId: newDemand.id,
  offerId: newOffer.id,
  riderId: 'rider-ml',
  quantity: 20
});
console.log(`✓ Supplier dispatched assignment ${newAssignment.id} to volunteer ${newAssignment.riderName}`);

state = RelayStore.getState();
const offerAfterDispatch = state.offers.find(o => o.id === newOffer.id);
const demandAfterDispatch = state.demands.find(d => d.id === newDemand.id);
assert.strictEqual(offerAfterDispatch.availableQuantity, 10, 'Supplier available quantity must decrease by 20');
assert.strictEqual(demandAfterDispatch.remainingQuantity, 0, 'Shelter remaining demand must decrease by 20');
assert.strictEqual(demandAfterDispatch.status, 'Matched', 'Demand status must become Matched');

// Step D: Volunteer Rider accepts route
RelayStore.acceptRoute(newAssignment.id, 'rider-ml');
state = RelayStore.getState();
const mayaLin = state.riders.find(r => r.id === 'rider-ml');
assert.strictEqual(mayaLin.currentCapacity, 45 - 20, 'Maya Lin capacity must decrease from 45 to 25');
console.log(`✓ Rider Maya Lin accepted route. Remaining capacity: ${mayaLin.currentCapacity}`);

// Step E: Volunteer picks up and delivers
RelayStore.updateDeliveryStatus(newAssignment.id, 'In Transit');
state = RelayStore.getState();
assert.strictEqual(state.demands.find(d => d.id === newDemand.id).status, 'In Transit');

RelayStore.updateDeliveryStatus(newAssignment.id, 'Delivered');
state = RelayStore.getState();
assert.strictEqual(state.demands.find(d => d.id === newDemand.id).status, 'Delivered');
assert.strictEqual(state.riders.find(r => r.id === 'rider-ml').currentCapacity, 45);
console.log('✓ End-to-end flow verified in all directions with accurate multi-party status updates.');

// 3. TEST REQUIREMENT 5: SHELTER DEMAND CANCELLATION & IN-TRANSIT DESTINATION RECALCULATION
console.log('\n--- TEST 3: Demand Change & Feasible Destination Recalculation ---');

// Create a demand and assignment in transit
const testDemand = RelayStore.createDemandAlert({
  category: 'Raw Rations',
  quantity: 15,
  location: 'Harbor Shelter · South entrance',
  reason: 'Emergency pantry replenishment',
  urgency: 'Medium',
  deadline: '2026-10-23T23:00'
});

const testOffer = RelayStore.createSupplyOffer({
  category: 'Raw Rations',
  quantity: 15,
  location: 'Juniper Kitchen · Dock B',
  expiryDeadline: '2026-10-24T18:00',
  handlingRequirements: 'Boxed dry goods'
});

const asgToReroute = RelayStore.createAssignment({
  demandId: testDemand.id,
  offerId: testOffer.id,
  riderId: 'rider-jr',
  quantity: 10
});

RelayStore.acceptRoute(asgToReroute.id, 'rider-jr');
RelayStore.updateDeliveryStatus(asgToReroute.id, 'In Transit');

// Shelter cancels demand due to sudden capacity issue / emergency relocation
RelayStore.cancelDemandAlert(testDemand.id, 'Flooding in intake hallway, shelter diverted.');
state = RelayStore.getState();

const reroutedAsg = state.assignments.find(a => a.id === asgToReroute.id);
assert.strictEqual(reroutedAsg.isRecalculated, true, 'isRecalculated flag must be set to true');
assert(reroutedAsg.dropoffLocation.includes('Eastgate Community Room'), 'Destination must be recalculated to active fallback depot');
console.log(`✓ Destination successfully recalculated for in-transit rider: "${reroutedAsg.dropoffLocation}"`);
console.log(`  Reason: ${reroutedAsg.recalculationReason}`);

// 4. TEST REQUIREMENT 6: CONSTRAINT ENFORCEMENT & PREVENTING DUPLICATE/OVER-ALLOCATION
console.log('\n--- TEST 4: Constraint Enforcement & Over-allocation Protection ---');

// Over-allocation: trying to dispatch more than available surplus
assert.throws(() => {
  RelayStore.createAssignment({
    demandId: testDemand.id,
    offerId: testOffer.id, // only 5 left
    riderId: 'rider-jr',
    quantity: 100 // exceeds supply
  });
}, /Insufficient surplus/, 'Must reject quantity exceeding available surplus');
console.log('✓ Prevented dispatch exceeding available supplier surplus.');

// Vehicle capacity: trying to dispatch more than rider vehicle capacity
assert.throws(() => {
  RelayStore.createAssignment({
    demandId: 'dmd-102',
    offerId: 'off-201',
    riderId: 'rider-jr', // Jordan Reed capacity is 12
    quantity: 35 // exceeds rider capacity
  });
}, /exceeds current capacity|capacity units free/, 'Must reject quantity exceeding rider vehicle capacity');
console.log('✓ Prevented dispatch exceeding volunteer vehicle capacity.');

// Rider Availability: trying to dispatch to offline rider
RelayStore.updateRiderAvailability('rider-jr', {
  capacityUnits: 12,
  availabilityStatus: 'Offline',
  availableUntil: '18:00',
  vehicleType: 'Bike trailer'
});

assert.throws(() => {
  RelayStore.createAssignment({
    demandId: 'dmd-102',
    offerId: 'off-201',
    riderId: 'rider-jr',
    quantity: 5
  });
}, /currently Offline/, 'Must reject dispatch to Offline rider');
console.log('✓ Prevented dispatch to Offline volunteer.');

// Restore rider availability
RelayStore.updateRiderAvailability('rider-jr', {
  capacityUnits: 12,
  availabilityStatus: 'Available',
  availableUntil: '20:15',
  vehicleType: 'Bike trailer'
});
console.log('✓ Volunteer availability update verified and restored.');

console.log('\n========================================');
console.log('ALL VERIFICATION TESTS PASSED WITH 100% SUCCESS!');
console.log('========================================');
process.exit(0);

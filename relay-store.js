/**
 * Relay Shared Operational Data Store
 * Synchronizes Shelter (Receiver), Supplier, and Volunteer (Rider) dashboards
 * in real-time using localStorage + BroadcastChannel + cross-tab storage events.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.RelayStore = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const STORAGE_KEY = 'relay:shared_state_v2';
  const CHANNEL_NAME = 'relay_network_sync_v2';

  // Initial seed data representing a coherent real-time operational state
  const INITIAL_STATE = {
    demands: [
      {
        id: 'dmd-101',
        receiverId: 'Harbor Shelter',
        category: 'Cooked Meals',
        quantity: 120,
        remainingQuantity: 78,
        allocatedQuantity: 42,
        location: 'Harbor Shelter · South entrance',
        reason: 'Dinner meal service for 120 unhoused residents. Hot-hold ready.',
        urgency: 'High',
        deadline: '2026-10-23T19:30',
        status: 'Open',
        createdAt: '2026-10-23T13:45:00.000Z'
      },
      {
        id: 'dmd-102',
        receiverId: 'Northside Mutual Aid',
        category: 'Cooked Meals',
        quantity: 40,
        remainingQuantity: 40,
        allocatedQuantity: 0,
        location: 'Northside Mutual Aid · Room 4 (2.4 mi)',
        reason: 'Family evening pantry distribution. Must be strictly nut-free.',
        urgency: 'Medium',
        deadline: '2026-10-23T20:00',
        status: 'Open',
        createdAt: '2026-10-23T14:00:00.000Z'
      },
      {
        id: 'dmd-103',
        receiverId: 'Eastgate Community Room',
        category: 'Cooked Meals',
        quantity: 25,
        remainingQuantity: 25,
        allocatedQuantity: 0,
        location: 'Eastgate Community Room · North Dock (3.1 mi)',
        reason: 'Overnight warming center intake snacks and warm soup.',
        urgency: 'Low',
        deadline: '2026-10-23T21:00',
        status: 'Open',
        createdAt: '2026-10-23T14:10:00.000Z'
      }
    ],
    offers: [
      {
        id: 'off-201',
        supplierId: 'Juniper Kitchen',
        category: 'Cooked Meals',
        quantity: 42,
        availableQuantity: 42,
        allocatedQuantity: 0,
        location: 'Juniper Kitchen · Loading dock B',
        expiryDeadline: '2026-10-23T20:45',
        handlingRequirements: 'Hot-hold packaging · Vegetarian + nut-free supported',
        status: 'Available',
        createdAt: '2026-10-23T14:00:00.000Z'
      }
    ],
    riders: [
      {
        id: 'rider-jr',
        name: 'Jordan Reed',
        avatar: 'JR',
        vehicleType: 'Bike trailer',
        capacityUnits: 12,
        currentCapacity: 12,
        availabilityStatus: 'Available',
        availableUntil: '20:15',
        coldStorage: true,
        location: 'Juniper Kitchen · 0.8 mi away',
        handoffsCompleted: 27,
        lastCheckIn: '2 min ago'
      },
      {
        id: 'rider-ml',
        name: 'Maya Lin',
        avatar: 'ML',
        vehicleType: 'Cargo Van',
        capacityUnits: 45,
        currentCapacity: 45,
        availabilityStatus: 'Available',
        availableUntil: '22:00',
        coldStorage: true,
        location: 'Downtown Center · 1.2 mi away',
        handoffsCompleted: 34,
        lastCheckIn: '10 min ago'
      }
    ],
    assignments: [
      {
        id: 'asg-301',
        demandId: 'dmd-101',
        offerId: 'off-201',
        riderId: 'rider-jr',
        riderName: 'Jordan Reed',
        supplierName: 'Juniper Kitchen',
        receiverName: 'Harbor Shelter',
        category: 'Cooked Meals',
        quantity: 4,
        pickupLocation: 'Juniper Kitchen · Loading dock B',
        dropoffLocation: 'Harbor Shelter · South entrance',
        pickupDeadline: '2026-10-23T20:45',
        dropoffDeadline: '2026-10-23T19:30',
        handlingRequirements: 'Hot-hold packaging · Insulated carrier required',
        status: 'Pending Acceptance',
        isRecalculated: false,
        recalculationReason: '',
        createdAt: '2026-10-23T14:15:00.000Z'
      }
    ],
    receiverProfile: {
      name: 'Harbor Shelter',
      mealsConfirmed: 120,
      intakeCapacity: 160,
      intakeWindow: '6:45–7:30 PM',
      entrance: 'South entrance',
      status: 'Intake Open'
    },
    supplierProfile: {
      name: 'Juniper Kitchen',
      pickupSuccessRate: '98%',
      pickupAccess: 'Loading dock B'
    },
    notifications: []
  };

  let cachedState = null;
  const subscribers = new Set();
  const broadcastChannel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL_NAME) : null;

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  let memoryStore = {};

  function readStateFromStorage() {
    try {
      let raw = null;
      if (typeof window !== 'undefined' && window.localStorage) {
        raw = window.localStorage.getItem(STORAGE_KEY);
      } else {
        raw = memoryStore[STORAGE_KEY];
      }
      if (!raw) {
        saveStateToStorage(INITIAL_STATE, false);
        return clone(INITIAL_STATE);
      }
      const parsed = JSON.parse(raw);
      // Migrate or seed missing collections
      if (!parsed.demands || !Array.isArray(parsed.demands)) parsed.demands = clone(INITIAL_STATE.demands);
      if (!parsed.offers || !Array.isArray(parsed.offers)) parsed.offers = clone(INITIAL_STATE.offers);
      if (!parsed.riders || !Array.isArray(parsed.riders)) parsed.riders = clone(INITIAL_STATE.riders);
      if (!parsed.assignments || !Array.isArray(parsed.assignments)) parsed.assignments = [];
      if (!parsed.receiverProfile) parsed.receiverProfile = clone(INITIAL_STATE.receiverProfile);
      if (!parsed.supplierProfile) parsed.supplierProfile = clone(INITIAL_STATE.supplierProfile);
      if (!parsed.notifications) parsed.notifications = [];
      return parsed;
    } catch (e) {
      console.warn('[RelayStore] Failed reading state from storage, resetting to initial', e);
      return clone(INITIAL_STATE);
    }
  }

  function saveStateToStorage(state, broadcast = true) {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } else {
        memoryStore[STORAGE_KEY] = JSON.stringify(state);
      }
      cachedState = state;
      if (broadcast && broadcastChannel) {
        broadcastChannel.postMessage({ type: 'RELAY_STATE_CHANGED', timestamp: Date.now() });
      }
      notifySubscribers();
    } catch (e) {
      console.error('[RelayStore] Failed saving state to storage', e);
    }
  }

  function notifySubscribers() {
    const currentState = RelayStore.getState();
    subscribers.forEach(callback => {
      try {
        callback(currentState);
      } catch (err) {
        console.error('[RelayStore] Subscriber error:', err);
      }
    });
  }

  // Set up listeners for real-time cross-tab and cross-window sync
  if (broadcastChannel) {
    broadcastChannel.onmessage = (event) => {
      if (event.data && event.data.type === 'RELAY_STATE_CHANGED') {
        cachedState = readStateFromStorage();
        notifySubscribers();
      }
    };
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (event) => {
      if (event.key === STORAGE_KEY) {
        cachedState = readStateFromStorage();
        notifySubscribers();
      }
    });

    // Reliable fallback poll every 3 seconds to catch any missed updates
    window.setInterval(() => {
      const fresh = readStateFromStorage();
      if (JSON.stringify(fresh) !== JSON.stringify(cachedState)) {
        cachedState = fresh;
        notifySubscribers();
      }
    }, 3000);
  }

  function addNotification(state, title, message, role = 'all', level = 'info') {
    if (!state.notifications) state.notifications = [];
    state.notifications.unshift({
      id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      title,
      message,
      role,
      level,
      timestamp: new Date().toISOString()
    });
    if (state.notifications.length > 50) {
      state.notifications = state.notifications.slice(0, 50);
    }
  }

  const RelayStore = {
    getState() {
      if (!cachedState) {
        cachedState = readStateFromStorage();
      }
      return clone(cachedState);
    },

    subscribe(callback) {
      subscribers.add(callback);
      // Immediately call with current state
      try {
        callback(this.getState());
      } catch (err) {
        console.error('[RelayStore] Initial callback error:', err);
      }
      return () => subscribers.delete(callback);
    },

    resetToDefaults() {
      const state = clone(INITIAL_STATE);
      saveStateToStorage(state, true);
      return state;
    },

    // --- DEMAND ALERTS (Shelter / Receiver) ---
    getDemandAlerts() {
      return this.getState().demands;
    },

    createDemandAlert({ category, quantity, location, reason, urgency, deadline }) {
      const state = this.getState();
      const numQty = Number(quantity);
      if (!category || !numQty || numQty <= 0 || !location || !urgency || !deadline) {
        throw new Error('All demand alert fields are required and quantity must be positive.');
      }

      const alert = {
        id: `dmd-${Date.now()}`,
        receiverId: state.receiverProfile.name || 'Harbor Shelter',
        category,
        quantity: numQty,
        remainingQuantity: numQty,
        allocatedQuantity: 0,
        location: location.trim(),
        reason: (reason || '').trim(),
        urgency,
        deadline,
        status: 'Open',
        createdAt: new Date().toISOString()
      };

      state.demands.unshift(alert);
      addNotification(state, 'New Demand Alert', `${alert.receiverId} requested ${alert.quantity} portions of ${alert.category} (${alert.urgency} urgency).`, 'supplier', 'warning');
      saveStateToStorage(state, true);
      return alert;
    },

    updateDemandAlert(id, updates) {
      const state = this.getState();
      const demand = state.demands.find(d => d.id === id);
      if (!demand) throw new Error(`Demand alert ${id} not found.`);

      Object.assign(demand, updates);
      saveStateToStorage(state, true);
      return demand;
    },

    cancelDemandAlert(id, reason = 'Shelter capacity filled or emergency relocated') {
      const state = this.getState();
      const demand = state.demands.find(d => d.id === id);
      if (!demand) throw new Error(`Demand alert ${id} not found.`);

      demand.status = 'Cancelled';
      demand.cancellationReason = reason;

      // Requirement 5: When shelter demand changes or is fulfilled, notify affected parties
      // and recalculate in-transit delivery destinations when feasible.
      const affectedAssignments = state.assignments.filter(a => a.demandId === id && a.status !== 'Delivered' && a.status !== 'Cancelled');
      affectedAssignments.forEach(asg => {
        // Recalculate destination to fallback recovery center: Eastgate Community Room
        const fallbackLocation = 'Eastgate Community Room · North Dock (Emergency Redistribution)';
        asg.dropoffLocation = fallbackLocation;
        asg.isRecalculated = true;
        asg.recalculationReason = `Harbor Shelter: ${reason}. Rerouted to nearest active distribution point.`;

        addNotification(
          state,
          'Route Rerouted',
          `Destination updated for Assignment ${asg.id}: ${asg.recalculationReason}`,
          'rider',
          'alert'
        );
      });

      addNotification(
        state,
        'Demand Cancelled',
        `${demand.receiverId} cancelled alert: ${reason}. Any active in-transit routes have been recalculated.`,
        'all',
        'warning'
      );

      saveStateToStorage(state, true);
      return demand;
    },

    // --- SUPPLY OFFERS (Supplier) ---
    getSupplyOffers() {
      return this.getState().offers;
    },

    createSupplyOffer({ category, quantity, location, expiryDeadline, handlingRequirements }) {
      const state = this.getState();
      const numQty = Number(quantity);
      if (!category || !numQty || numQty <= 0 || !location || !expiryDeadline) {
        throw new Error('All surplus fields are required and quantity must be positive.');
      }

      const offer = {
        id: `off-${Date.now()}`,
        supplierId: state.supplierProfile.name || 'Juniper Kitchen',
        category,
        quantity: numQty,
        availableQuantity: numQty,
        allocatedQuantity: 0,
        location: location.trim(),
        expiryDeadline,
        handlingRequirements: (handlingRequirements || 'Standard safe handling').trim(),
        status: 'Available',
        createdAt: new Date().toISOString()
      };

      state.offers.unshift(offer);
      addNotification(
        state,
        'Surplus Posted',
        `${offer.supplierId} offered ${offer.quantity} portions of ${offer.category} ready at ${offer.location}.`,
        'all',
        'success'
      );
      saveStateToStorage(state, true);
      return offer;
    },

    // --- ASSIGNMENTS & DISPATCH ENGINE (Supplier -> Volunteer -> Receiver) ---
    getAssignments() {
      return this.getState().assignments;
    },

    createAssignment({ demandId, offerId, riderId, quantity }) {
      const state = this.getState();
      const demand = state.demands.find(d => d.id === demandId);
      const offer = state.offers.find(o => o.id === offerId);
      const rider = state.riders.find(r => r.id === riderId);
      const numQty = Number(quantity);

      // Constraint Validation (Requirement 6)
      if (!demand) throw new Error('Selected demand request does not exist.');
      if (!offer) throw new Error('Selected supply offer does not exist.');
      if (!rider) throw new Error('Selected volunteer rider does not exist.');
      if (!numQty || numQty <= 0) throw new Error('Dispatch quantity must be greater than zero.');
      if (offer.availableQuantity < numQty) {
        throw new Error(`Insufficient surplus: offer only has ${offer.availableQuantity} units available.`);
      }
      if (demand.remainingQuantity < numQty) {
        throw new Error(`Quantity exceeds demand: shelter only requires ${demand.remainingQuantity} more units.`);
      }
      if (rider.availabilityStatus !== 'Available') {
        throw new Error(`Volunteer ${rider.name} is currently ${rider.availabilityStatus}.`);
      }
      if (rider.currentCapacity < numQty) {
        throw new Error(`Volunteer ${rider.name} only has ${rider.currentCapacity} capacity units free (requested ${numQty}).`);
      }

      // Check Expiry vs Deadline
      const offerExpiry = new Date(offer.expiryDeadline);
      const demandDeadline = new Date(demand.deadline);
      const now = new Date();
      if (offerExpiry <= now) {
        throw new Error('Supply offer has already expired.');
      }

      // Deduct available quantity from offer and allocate demand
      offer.availableQuantity -= numQty;
      offer.allocatedQuantity = (offer.allocatedQuantity || 0) + numQty;
      if (offer.availableQuantity === 0) offer.status = 'Reserved';

      demand.remainingQuantity -= numQty;
      demand.allocatedQuantity = (demand.allocatedQuantity || 0) + numQty;
      demand.status = demand.remainingQuantity === 0 ? 'Matched' : 'Partially Matched';

      const assignment = {
        id: `asg-${Date.now()}`,
        demandId: demand.id,
        offerId: offer.id,
        riderId: rider.id,
        riderName: rider.name,
        supplierName: offer.supplierId,
        receiverName: demand.receiverId,
        category: offer.category,
        quantity: numQty,
        pickupLocation: offer.location,
        dropoffLocation: demand.location,
        pickupDeadline: offer.expiryDeadline,
        dropoffDeadline: demand.deadline,
        handlingRequirements: offer.handlingRequirements,
        status: 'Pending Acceptance',
        isRecalculated: false,
        recalculationReason: '',
        createdAt: new Date().toISOString()
      };

      state.assignments.unshift(assignment);

      addNotification(
        state,
        'Route Dispatched',
        `Dispatched ${numQty} units of ${offer.category} from ${offer.supplierId} to ${demand.receiverId} for rider ${rider.name}.`,
        'all',
        'info'
      );

      saveStateToStorage(state, true);
      return assignment;
    },

    // --- VOLUNTEER RIDER ACTIONS ---
    acceptRoute(assignmentId, riderId = 'rider-jr') {
      const state = this.getState();
      const assignment = state.assignments.find(a => a.id === assignmentId);
      if (!assignment) throw new Error(`Assignment ${assignmentId} not found.`);
      if (assignment.status !== 'Pending Acceptance') {
        throw new Error(`Cannot accept route in '${assignment.status}' state.`);
      }

      const rider = state.riders.find(r => r.id === (riderId || assignment.riderId));
      if (!rider) throw new Error('Rider profile not found.');

      if (rider.currentCapacity < assignment.quantity) {
        throw new Error(`Cannot accept route: required capacity ${assignment.quantity} exceeds current capacity ${rider.currentCapacity}.`);
      }

      // Reserve rider capacity
      rider.currentCapacity -= assignment.quantity;
      assignment.status = 'Accepted';
      assignment.acceptedAt = new Date().toISOString();

      addNotification(
        state,
        'Route Accepted',
        `Volunteer ${rider.name} accepted route to deliver ${assignment.quantity} units to ${assignment.receiverName}.`,
        'all',
        'success'
      );

      saveStateToStorage(state, true);
      return assignment;
    },

    updateDeliveryStatus(assignmentId, newStatus, extraNotes = '') {
      const state = this.getState();
      const assignment = state.assignments.find(a => a.id === assignmentId);
      if (!assignment) throw new Error(`Assignment ${assignmentId} not found.`);

      const validTransitions = {
        'Accepted': ['In Transit', 'Cancelled'],
        'In Transit': ['Delivered', 'Cancelled'],
        'Pending Acceptance': ['Accepted', 'Cancelled']
      };

      const allowed = validTransitions[assignment.status] || [];
      if (!allowed.includes(newStatus)) {
        throw new Error(`Invalid status transition from '${assignment.status}' to '${newStatus}'.`);
      }

      assignment.status = newStatus;
      const demand = state.demands.find(d => d.id === assignment.demandId);
      const rider = state.riders.find(r => r.id === assignment.riderId);

      if (newStatus === 'In Transit') {
        assignment.pickedUpAt = new Date().toISOString();
        if (demand) demand.status = 'In Transit';
        addNotification(
          state,
          'Surplus In Transit',
          `Volunteer ${assignment.riderName} has picked up surplus from ${assignment.supplierName} and is en route to ${assignment.dropoffLocation}.`,
          'all',
          'info'
        );
      } else if (newStatus === 'Delivered') {
        assignment.deliveredAt = new Date().toISOString();
        // Free rider capacity
        if (rider) {
          rider.currentCapacity = Math.min(rider.capacityUnits, rider.currentCapacity + assignment.quantity);
          rider.handoffsCompleted = (rider.handoffsCompleted || 0) + 1;
        }
        // Update shelter metrics & demand status
        if (demand) {
          demand.status = 'Delivered';
        }
        if (state.receiverProfile) {
          state.receiverProfile.mealsConfirmed = (state.receiverProfile.mealsConfirmed || 0) + assignment.quantity;
          state.receiverProfile.intakeCapacity = Math.max(0, (state.receiverProfile.intakeCapacity || 0) - assignment.quantity);
        }
        addNotification(
          state,
          'Delivery Completed',
          `Safe handoff confirmed! ${assignment.quantity} portions safely delivered to ${assignment.dropoffLocation}.`,
          'all',
          'success'
        );
      }

      saveStateToStorage(state, true);
      return assignment;
    },

    // --- VOLUNTEER AVAILABILITY ---
    getRiders() {
      return this.getState().riders;
    },

    getRider(id = 'rider-jr') {
      return this.getState().riders.find(r => r.id === id) || this.getState().riders[0];
    },

    updateRiderAvailability(id = 'rider-jr', { capacityUnits, availabilityStatus, availableUntil, vehicleType }) {
      const state = this.getState();
      const rider = state.riders.find(r => r.id === id);
      if (!rider) throw new Error(`Rider ${id} not found.`);

      const numCap = Number(capacityUnits);
      if (!numCap || numCap <= 0) {
        throw new Error('Vehicle capacity must be a positive number.');
      }
      if (!availabilityStatus) {
        throw new Error('Availability status is required.');
      }
      if (!availableUntil) {
        throw new Error('Available-until time is required.');
      }

      const diff = numCap - rider.capacityUnits;
      rider.capacityUnits = numCap;
      rider.currentCapacity = Math.max(0, rider.currentCapacity + diff);
      rider.availabilityStatus = availabilityStatus;
      rider.availableUntil = availableUntil;
      if (vehicleType) rider.vehicleType = vehicleType;
      rider.lastCheckIn = 'Just now';

      addNotification(
        state,
        'Rider Availability Updated',
        `Volunteer ${rider.name} is now ${rider.availabilityStatus} (${rider.capacityUnits} units capacity, until ${rider.availableUntil}).`,
        'supplier',
        'info'
      );

      saveStateToStorage(state, true);
      return rider;
    },

    // --- SHELTER INTAKE UPDATE ---
    updateReceiverIntake({ intakeCapacity, intakeWindow, entrance, status }) {
      const state = this.getState();
      if (!state.receiverProfile) state.receiverProfile = {};
      if (intakeCapacity !== undefined) state.receiverProfile.intakeCapacity = Number(intakeCapacity);
      if (intakeWindow) state.receiverProfile.intakeWindow = intakeWindow;
      if (entrance) state.receiverProfile.entrance = entrance;
      if (status) state.receiverProfile.status = status;

      // If shelter intake is closed or diverted, trigger recalculation for pending/in-transit deliveries
      if (status === 'Intake Full / Divert Requests') {
        const activeAssignments = state.assignments.filter(a => a.status === 'In Transit' || a.status === 'Accepted');
        activeAssignments.forEach(asg => {
          asg.dropoffLocation = 'Eastgate Community Room · North Dock (Emergency Redistribution)';
          asg.isRecalculated = true;
          asg.recalculationReason = 'Harbor Shelter reached intake capacity. Destination recalculated.';
          addNotification(
            state,
            'Destination Recalculated',
            `Intake capacity full at Harbor Shelter. Route rerouted to ${asg.dropoffLocation}.`,
            'rider',
            'alert'
          );
        });
      }

      addNotification(
        state,
        'Intake Profile Updated',
        `Harbor Shelter intake updated: ${state.receiverProfile.intakeCapacity} portions capacity (${state.receiverProfile.intakeWindow}).`,
        'all',
        'info'
      );

      saveStateToStorage(state, true);
      return state.receiverProfile;
    }
  };

  return RelayStore;
});

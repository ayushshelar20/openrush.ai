/**
 * Relay - Volunteer Rider Dashboard Logic
 * Handles route acceptance, capacity reservations, transit lifecycle, and availability updates.
 */

(function () {
  'use strict';

  const RIDER_ID = 'rider-jr';

  // Availability modal elements
  const availModal = document.querySelector('#availability-modal');
  const availForm = document.querySelector('#availability-form');
  const availCapacityInput = document.querySelector('#avail-capacity-input');
  const availStatusSelect = document.querySelector('#avail-status-select');
  const availUntilInput = document.querySelector('#avail-until-input');
  const availVehicleSelect = document.querySelector('#avail-vehicle-select');
  const availFeedback = document.querySelector('#availability-form-feedback');
  const submitAvailBtn = document.querySelector('#submit-availability-btn');
  const submitAvailLabel = document.querySelector('#submit-availability-label');

  // Dashboard content elements
  const currentCapacityMetric = document.querySelector('#rider-current-capacity');
  const capacityUnitMetric = document.querySelector('#rider-capacity-unit');
  const suggestedRouteMetric = document.querySelector('#rider-suggested-route');
  const routeSubMetric = document.querySelector('#rider-route-sub');
  const handoffsCompletedMetric = document.querySelector('#rider-handoffs-completed');
  const routePanelCaption = document.querySelector('#route-panel-caption');
  const routeHeading = document.querySelector('#route-heading');
  const riderStatusBanner = document.querySelector('#rider-status-banner');
  const recalculationNotice = document.querySelector('#rider-recalculation-notice');
  const routeDetails = document.querySelector('#rider-route-details');
  const routeActions = document.querySelector('#rider-route-actions');
  const riderWorkspaceEyebrow = document.querySelector('#rider-workspace-eyebrow');
  const riderConstraintList = document.querySelector('#rider-constraint-list');
  const toast = document.querySelector('#rider-toast');

  let toastTimer;
  let isSubmittingAvail = false;
  let isUpdatingRoute = false;

  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('show'), 4200);
  }

  function escapeHtml(val) {
    return String(val || '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
  }

  function formatTime(val) {
    if (!val) return 'TBD';
    const date = new Date(val);
    if (!Number.isNaN(date.getTime())) {
      return new Intl.DateTimeFormat(undefined, { timeStyle: 'short' }).format(date);
    }
    return val;
  }

  function clearFormErrors(form, feedback) {
    form.querySelectorAll('.demand-field').forEach((field) => field.classList.remove('has-error'));
    form.querySelectorAll('.field-error').forEach((error) => { error.textContent = ''; });
    if (feedback) {
      feedback.textContent = '';
      feedback.classList.remove('success');
    }
  }

  function setFieldError(id, message) {
    const elem = document.querySelector(`#${id}`);
    if (!elem) return;
    const field = elem.closest('.demand-field');
    const error = document.querySelector(`[data-error-for="${id}"]`);
    if (field) field.classList.add('has-error');
    if (error) error.textContent = message;
  }

  function renderRiderDashboard(state) {
    const rider = (state.riders || []).find(r => r.id === RIDER_ID) || state.riders[0];
    if (!rider) return;

    // Metrics
    if (currentCapacityMetric) {
      currentCapacityMetric.textContent = String(rider.currentCapacity).padStart(2, '0');
    }
    if (capacityUnitMetric) {
      capacityUnitMetric.textContent = `${rider.vehicleType} · free`;
    }
    if (handoffsCompletedMetric) {
      handoffsCompletedMetric.textContent = String(rider.handoffsCompleted || 27);
    }
    if (riderWorkspaceEyebrow) {
      riderWorkspaceEyebrow.textContent = `Rider workspace · ${rider.availabilityStatus}`;
    }

    // Constraints & Availability info
    if (riderConstraintList) {
      riderConstraintList.innerHTML = `
        <li>${escapeHtml(rider.vehicleType)} · ${rider.capacityUnits} units total capacity</li>
        <li>${rider.coldStorage ? 'Insulated carrier confirmed' : 'Standard ambient rack'}</li>
        <li>Available until ${escapeHtml(rider.availableUntil || '8:15 PM')} (${escapeHtml(rider.availabilityStatus)})</li>
        <li>Last location check-in: ${escapeHtml(rider.lastCheckIn || 'Just now')}</li>
      `;
    }

    // Find active route for this rider
    const myAssignments = (state.assignments || []).filter(a => a.riderId === rider.id || a.riderId === RIDER_ID);
    const activeRoute = myAssignments.find(a => a.status === 'Pending Acceptance' || a.status === 'Accepted' || a.status === 'In Transit');

    if (!activeRoute) {
      // No active route
      if (suggestedRouteMetric) suggestedRouteMetric.textContent = '--';
      if (routeSubMetric) routeSubMetric.textContent = 'no active route';
      if (routePanelCaption) routePanelCaption.textContent = 'NO ACTIVE ROUTE ASSIGNMENT';
      if (routeHeading) routeHeading.textContent = 'Standing by for compatible dispatch';
      if (riderStatusBanner) {
        riderStatusBanner.innerHTML = `<span></span> Available for local aid dispatches · Capacity: ${rider.currentCapacity} units`;
      }
      if (recalculationNotice) recalculationNotice.innerHTML = '';
      if (routeDetails) {
        routeDetails.innerHTML = `
          <div class="empty-state">
            No route offer currently pending.<br/>
            When a supplier dispatches aid matching your capacity and location, it will appear here instantly.
          </div>
        `;
      }
      if (routeActions) routeActions.innerHTML = '';
      return;
    }

    // There is an active route
    if (routeHeading) {
      routeHeading.textContent = `${activeRoute.supplierName} → ${activeRoute.receiverName}`;
    }

    // Timing metrics
    if (activeRoute.status === 'Pending Acceptance') {
      if (suggestedRouteMetric) suggestedRouteMetric.textContent = '6m';
      if (routeSubMetric) routeSubMetric.textContent = 'to pickup';
      if (routePanelCaption) routePanelCaption.textContent = 'ROUTE OFFER · PENDING ACCEPTANCE';
      if (riderStatusBanner) {
        riderStatusBanner.innerHTML = `<span></span> Best fit: your ${rider.vehicleType} capacity (${rider.currentCapacity} free) matches this demand`;
      }
    } else if (activeRoute.status === 'Accepted') {
      if (suggestedRouteMetric) suggestedRouteMetric.textContent = '4m';
      if (routeSubMetric) routeSubMetric.textContent = 'pickup ready';
      if (routePanelCaption) routePanelCaption.textContent = 'ROUTE ACCEPTED · PROCEED TO PICKUP';
      if (riderStatusBanner) {
        riderStatusBanner.innerHTML = `<span></span> Capacity reserved: ${activeRoute.quantity} units · Head to ${activeRoute.supplierName}`;
      }
    } else if (activeRoute.status === 'In Transit') {
      if (suggestedRouteMetric) suggestedRouteMetric.textContent = '12m';
      if (routeSubMetric) routeSubMetric.textContent = 'to shelter drop-off';
      if (routePanelCaption) routePanelCaption.textContent = 'ROUTE IN TRANSIT · DELIVERING AID';
      if (riderStatusBanner) {
        riderStatusBanner.innerHTML = `<span></span> <strong>LIVE TRANSIT:</strong> Delivering ${activeRoute.quantity} units to ${activeRoute.receiverName}`;
      }
    }

    // Recalculation Alert (Requirement 5)
    if (recalculationNotice) {
      if (activeRoute.isRecalculated) {
        recalculationNotice.innerHTML = `
          <div class="recalculation-alert">
            <b>⚡ DESTINATION RECALCULATED:</b>
            ${escapeHtml(activeRoute.recalculationReason || 'Shelter intake window adjusted.')}<br/>
            New Drop-off: <strong>${escapeHtml(activeRoute.dropoffLocation)}</strong>
          </div>
        `;
      } else {
        recalculationNotice.innerHTML = '';
      }
    }

    // Render Route Details
    if (routeDetails) {
      routeDetails.innerHTML = `
        <div class="queue-item">
          <div>
            <b>Pickup · ${escapeHtml(activeRoute.supplierName)}</b>
            <small>
              Location: <strong>${escapeHtml(activeRoute.pickupLocation)}</strong><br/>
              Ready now · Expiry limit: ${formatTime(activeRoute.pickupDeadline)}
            </small>
          </div>
          <span class="queue-badge">${activeRoute.status === 'Pending Acceptance' ? '6 MIN' : 'CONFIRMED'}</span>
        </div>
        <div class="queue-item">
          <div>
            <b>Drop-off · ${escapeHtml(activeRoute.receiverName)}</b>
            <small>
              Destination: <strong>${escapeHtml(activeRoute.dropoffLocation)}</strong><br/>
              Intake deadline: ${formatTime(activeRoute.dropoffDeadline)}
            </small>
          </div>
          <span class="queue-badge">${activeRoute.status === 'In Transit' ? '12 MIN' : 'INTAKE OPEN'}</span>
        </div>
        <div class="queue-item">
          <div>
            <b>Cargo &amp; Packaging Requirements</b>
            <small>
              ${activeRoute.quantity} units of <strong>${escapeHtml(activeRoute.category)}</strong><br/>
              ${escapeHtml(activeRoute.handlingRequirements || 'Safe insulated transport')}
            </small>
          </div>
          <span class="badge-tag live">${escapeHtml(activeRoute.status)}</span>
        </div>
      `;
    }

    // Render Action Buttons
    if (routeActions) {
      routeActions.innerHTML = '';
      if (activeRoute.status === 'Pending Acceptance') {
        const acceptBtn = document.createElement('button');
        acceptBtn.className = 'button button-primary dashboard-action';
        acceptBtn.style.width = '100%';
        acceptBtn.id = 'accept-route-action-btn';
        acceptBtn.innerHTML = `Accept route (${activeRoute.quantity} units) <span>↗</span>`;
        acceptBtn.addEventListener('click', () => handleAcceptRoute(activeRoute.id));
        routeActions.appendChild(acceptBtn);
      } else if (activeRoute.status === 'Accepted') {
        const pickupBtn = document.createElement('button');
        pickupBtn.className = 'button button-primary dashboard-action';
        pickupBtn.style.width = '100%';
        pickupBtn.id = 'pickup-route-action-btn';
        pickupBtn.innerHTML = `Confirm Pickup &amp; Start Transit <span>↗</span>`;
        pickupBtn.addEventListener('click', () => handleUpdateStatus(activeRoute.id, 'In Transit'));
        routeActions.appendChild(pickupBtn);
      } else if (activeRoute.status === 'In Transit') {
        const dropoffBtn = document.createElement('button');
        dropoffBtn.className = 'button button-primary dashboard-action';
        dropoffBtn.style.width = '100%';
        dropoffBtn.style.background = '#286241';
        dropoffBtn.id = 'dropoff-route-action-btn';
        dropoffBtn.innerHTML = `Confirm Safe Handoff (Delivered) <span>✓</span>`;
        dropoffBtn.addEventListener('click', () => handleUpdateStatus(activeRoute.id, 'Delivered'));
        routeActions.appendChild(dropoffBtn);
      }
    }
  }

  function handleAcceptRoute(assignmentId) {
    if (isUpdatingRoute) return;
    isUpdatingRoute = true;
    const btn = document.querySelector('#accept-route-action-btn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Reserving vehicle capacity…';
    }

    window.setTimeout(() => {
      try {
        RelayStore.acceptRoute(assignmentId, RIDER_ID);
        isUpdatingRoute = false;
        showToast('Route accepted! Vehicle capacity reserved. Supplier and shelter notified.');
      } catch (err) {
        isUpdatingRoute = false;
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Accept route ↗';
        }
        alert(err.message);
      }
    }, 350);
  }

  function handleUpdateStatus(assignmentId, newStatus) {
    if (isUpdatingRoute) return;
    isUpdatingRoute = true;

    window.setTimeout(() => {
      try {
        RelayStore.updateDeliveryStatus(assignmentId, newStatus);
        isUpdatingRoute = false;
        if (newStatus === 'In Transit') {
          showToast('Pickup confirmed! You are now in transit to the shelter.');
        } else if (newStatus === 'Delivered') {
          showToast('Safe handoff confirmed! Cargo delivered, capacity restored.');
        }
      } catch (err) {
        isUpdatingRoute = false;
        alert(err.message);
      }
    }, 350);
  }

  // --- UPDATE AVAILABILITY MODAL ---
  function openAvailabilityModal() {
    clearFormErrors(availForm, availFeedback);
    const state = RelayStore.getState();
    const rider = (state.riders || []).find(r => r.id === RIDER_ID) || state.riders[0];
    if (rider) {
      if (availCapacityInput) availCapacityInput.value = rider.capacityUnits || 12;
      if (availStatusSelect) availStatusSelect.value = rider.availabilityStatus || 'Available';
      if (availUntilInput) availUntilInput.value = rider.availableUntil || '20:15';
      if (availVehicleSelect) availVehicleSelect.value = rider.vehicleType || 'Bike trailer';
    }
    availModal.hidden = false;
    document.body.style.overflow = 'hidden';
    window.setTimeout(() => availCapacityInput?.focus(), 50);
  }

  function closeAvailabilityModal() {
    if (isSubmittingAvail) return;
    availModal.hidden = true;
    document.body.style.overflow = '';
    clearFormErrors(availForm, availFeedback);
  }

  availForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (isSubmittingAvail) return;
    clearFormErrors(availForm, availFeedback);

    const capacity = Number(availCapacityInput?.value);
    const status = availStatusSelect?.value;
    const until = availUntilInput?.value;
    const vehicle = availVehicleSelect?.value;

    let isValid = true;
    if (!capacity || capacity <= 0) {
      setFieldError('avail-capacity-input', 'Enter a capacity greater than zero.');
      isValid = false;
    }
    if (!status) {
      setFieldError('avail-status-select', 'Select your availability status.');
      isValid = false;
    }
    if (!until) {
      setFieldError('avail-until-input', 'Enter your available-until time.');
      isValid = false;
    }

    if (!isValid) return;

    isSubmittingAvail = true;
    if (submitAvailBtn) submitAvailBtn.disabled = true;
    if (submitAvailLabel) submitAvailLabel.textContent = 'Saving availability…';

    window.setTimeout(() => {
      try {
        const updated = RelayStore.updateRiderAvailability(RIDER_ID, {
          capacityUnits: capacity,
          availabilityStatus: status,
          availableUntil: until,
          vehicleType: vehicle
        });

        isSubmittingAvail = false;
        if (submitAvailBtn) submitAvailBtn.disabled = false;
        if (submitAvailLabel) submitAvailLabel.textContent = 'Save availability';
        closeAvailabilityModal();
        showToast(`Availability updated: ${updated.availabilityStatus} (${updated.capacityUnits} units capacity).`);
      } catch (err) {
        isSubmittingAvail = false;
        if (submitAvailBtn) submitAvailBtn.disabled = false;
        if (submitAvailLabel) submitAvailLabel.textContent = 'Save availability';
        if (availFeedback) availFeedback.textContent = err.message;
      }
    }, 350);
  });

  // Bind Open/Close triggers
  document.querySelector('#update-availability-btn')?.addEventListener('click', openAvailabilityModal);
  document.querySelector('#close-availability-modal')?.addEventListener('click', closeAvailabilityModal);
  document.querySelector('#cancel-availability-modal')?.addEventListener('click', closeAvailabilityModal);
  availModal?.addEventListener('click', (e) => { if (e.target === availModal) closeAvailabilityModal(); });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && availModal && !availModal.hidden) closeAvailabilityModal();
  });

  // Subscribe to live store updates
  RelayStore.subscribe(renderRiderDashboard);
})();

/**
 * Relay - Shelter / Receiver Dashboard Logic
 * Uses RelayStore for shared state, persistent storage, and real-time synchronization.
 */

(function () {
  'use strict';

  // Modal elements
  const demandModal = document.querySelector('#demand-alert-modal');
  const demandForm = document.querySelector('#demand-alert-form');
  const demandCategory = document.querySelector('#demand-category');
  const customCategoryField = document.querySelector('#custom-category-field');
  const customCategory = document.querySelector('#custom-category');
  const submitDemandButton = document.querySelector('#submit-demand-alert');
  const submitDemandLabel = document.querySelector('#submit-demand-label');
  const demandFeedback = document.querySelector('#demand-form-feedback');

  const intakeModal = document.querySelector('#intake-modal');
  const intakeForm = document.querySelector('#intake-form');
  const intakeCapacityInput = document.querySelector('#intake-capacity-input');
  const intakeStatusSelect = document.querySelector('#intake-status-select');
  const intakeWindowInput = document.querySelector('#intake-window-input');
  const intakeEntranceInput = document.querySelector('#intake-entrance-input');
  const intakeFeedback = document.querySelector('#intake-form-feedback');
  const submitIntakeBtn = document.querySelector('#submit-intake-btn');

  // Dashboard content elements
  const demandList = document.querySelector('#demand-alert-list');
  const trackingArea = document.querySelector('#receiver-tracking-area');
  const activeDemandCount = document.querySelector('#active-demand-count');
  const activeDemandSub = document.querySelector('#active-demand-sub');
  const mealsConfirmedCount = document.querySelector('#meals-confirmed-count');
  const mealsConfirmedSub = document.querySelector('#meals-confirmed-sub');
  const intakeCapacityCount = document.querySelector('#intake-capacity-count');
  const intakeCapacitySub = document.querySelector('#intake-capacity-sub');
  const receiverStatusBanner = document.querySelector('#receiver-status-banner');
  const activeDemandFooter = document.querySelector('#active-demand-footer');
  const demandToast = document.querySelector('#demand-toast');

  let demandToastTimer;
  let isSubmittingDemand = false;
  let isSubmittingIntake = false;

  function showToast(message) {
    if (!demandToast) return;
    demandToast.textContent = message;
    demandToast.classList.add('show');
    window.clearTimeout(demandToastTimer);
    demandToastTimer = window.setTimeout(() => demandToast.classList.remove('show'), 4200);
  }

  function formatDeadline(value) {
    if (!value) return 'TBD';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
  }

  function renderDashboard(state) {
    const shelterName = state.receiverProfile?.name || 'Harbor Shelter';
    const shelterDemands = (state.demands || []).filter(d => d.receiverId === shelterName || !d.receiverId || d.receiverId === 'Harbor Shelter');
    const openOrActive = shelterDemands.filter(d => d.status !== 'Delivered' && d.status !== 'Cancelled');
    const activeAssignments = (state.assignments || []).filter(a => a.receiverName === shelterName && a.status !== 'Delivered' && a.status !== 'Cancelled');

    // Metrics
    if (activeDemandCount) activeDemandCount.textContent = String(openOrActive.length).padStart(2, '0');
    if (activeDemandSub) activeDemandSub.textContent = activeAssignments.length > 0 ? `${activeAssignments.length} in transit/assigned` : 'open for matches';
    if (mealsConfirmedCount) mealsConfirmedCount.textContent = String(state.receiverProfile?.mealsConfirmed || 120);
    if (mealsConfirmedSub) mealsConfirmedSub.textContent = `expected by ${state.receiverProfile?.intakeWindow?.split('–')[1] || '7:30 PM'}`;
    if (intakeCapacityCount) intakeCapacityCount.textContent = String(state.receiverProfile?.intakeCapacity || 160);
    if (intakeCapacitySub) intakeCapacitySub.textContent = 'portions remaining';
    if (activeDemandFooter) activeDemandFooter.textContent = `${openOrActive.length} alert${openOrActive.length === 1 ? '' : 's'} active`;

    // Status Banner
    if (receiverStatusBanner) {
      if (activeAssignments.some(a => a.status === 'In Transit')) {
        receiverStatusBanner.innerHTML = `<span></span> <strong>LIVE HANDOFF:</strong> Volunteer rider is in transit with your supplies`;
      } else if (activeAssignments.some(a => a.status === 'Accepted' || a.status === 'Pending Acceptance')) {
        receiverStatusBanner.innerHTML = `<span></span> Supplier matched · Volunteer assignment active`;
      } else if (openOrActive.length > 0) {
        receiverStatusBanner.innerHTML = `<span></span> Active alert broadcasted to local kitchen network`;
      } else {
        receiverStatusBanner.innerHTML = `<span></span> Intake open · No active emergency alerts`;
      }
    }

    // Active in-transit tracking card
    if (trackingArea) {
      trackingArea.innerHTML = '';
      activeAssignments.forEach(asg => {
        const card = document.createElement('div');
        card.className = 'tracking-card';
        const isRecalc = asg.isRecalculated;
        card.innerHTML = `
          <div class="tracking-card-header">
            <b>${asg.status === 'In Transit' ? '🚚 RIDER IN TRANSIT' : '⏳ ASSIGNMENT RESERVED'} · ${escapeHtml(asg.quantity)} units</b>
            <span class="badge-tag ${asg.status === 'In Transit' ? 'live' : ''}">${escapeHtml(asg.status)}</span>
          </div>
          <p>
            Rider <strong>${escapeHtml(asg.riderName || 'Volunteer')}</strong> · Origin: ${escapeHtml(asg.pickupLocation)}<br/>
            Destination: <strong>${escapeHtml(asg.dropoffLocation)}</strong><br/>
            Cargo: ${escapeHtml(asg.category)} (${escapeHtml(asg.handlingRequirements || 'Safe handling')})
          </p>
          ${isRecalc ? `<div class="recalculation-alert" style="margin-top:10px;margin-bottom:0;"><b>Destination Notice:</b> ${escapeHtml(asg.recalculationReason || 'Rerouted')}</div>` : ''}
        `;
        trackingArea.appendChild(card);
      });
    }

    // Demand Alert List
    if (demandList) {
      demandList.innerHTML = '';
      if (shelterDemands.length === 0) {
        demandList.innerHTML = '<div class="empty-state">No demand alerts posted yet. Click below to create your first alert.</div>';
      } else {
        shelterDemands.forEach(alert => {
          const item = document.createElement('div');
          item.className = 'queue-item demand-alert-item';

          let statusClass = 'open';
          let statusBadgeText = alert.status.toUpperCase();
          if (alert.status === 'Delivered') statusClass = 'urgency-low';
          else if (alert.status === 'In Transit') statusClass = 'urgency-high';
          else if (alert.status === 'Matched') statusClass = 'urgency-medium';
          else if (alert.status === 'Cancelled') statusClass = 'urgency-critical';

          const canCancel = alert.status === 'Open' || alert.status === 'Matched' || alert.status === 'Partially Matched';

          item.innerHTML = `
            <div>
              <b>${escapeHtml(alert.category)} · ${escapeHtml(alert.quantity)} units</b>
              <small>${escapeHtml(alert.location)}<br />${escapeHtml(alert.reason || '')}</small>
              <small>Needed by: <strong>${escapeHtml(formatDeadline(alert.deadline))}</strong> · Remaining: ${alert.remainingQuantity} units</small>
            </div>
            <div style="text-align:right; display:flex; flex-direction:column; align-items:flex-end; gap:6px;">
              <span class="queue-badge ${statusClass}">${escapeHtml(alert.urgency ? alert.urgency.toUpperCase() : '')}<br />${statusBadgeText}</span>
              ${canCancel ? `<button class="queue-action-btn secondary cancel-demand-btn" data-id="${escapeHtml(alert.id)}" type="button" title="Cancel or divert if emergency relocated">Divert / Cancel</button>` : ''}
            </div>
          `;
          demandList.appendChild(item);
        });
      }
    }

    // Bind cancel/divert buttons
    document.querySelectorAll('.cancel-demand-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        if (confirm('Are you sure you want to divert/cancel this demand request? If riders are in transit, destinations will be recalculated.')) {
          try {
            RelayStore.cancelDemandAlert(id, 'Harbor Shelter capacity reached or emergency relocated.');
            showToast('Demand alert cancelled. In-transit riders have been notified and destination recalculated.');
          } catch (err) {
            alert(err.message);
          }
        }
      });
    });

    // Update Checklist info from profile
    const chkEntrance = document.querySelector('#chk-entrance');
    if (chkEntrance && state.receiverProfile?.entrance) {
      chkEntrance.textContent = `Confirm entrance is open: ${state.receiverProfile.entrance}`;
    }
  }

  function setDeadlineMinimum() {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    const deadlineInput = document.querySelector('#demand-deadline');
    if (deadlineInput) {
      deadlineInput.min = now.toISOString().slice(0, 16);
      if (!deadlineInput.value) {
        const defaultDeadline = new Date(Date.now() + 3 * 3600 * 1000);
        defaultDeadline.setMinutes(defaultDeadline.getMinutes() - defaultDeadline.getTimezoneOffset());
        deadlineInput.value = defaultDeadline.toISOString().slice(0, 16);
      }
    }
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

  function validateDemandForm() {
    clearFormErrors(demandForm, demandFeedback);
    const formData = new FormData(demandForm);
    const values = Object.fromEntries(formData.entries());
    let isValid = true;

    const requiredFields = [
      ['demand-category', values.category, 'Choose a demand category.'],
      ['demand-quantity', values.quantity, 'Enter a quantity greater than zero.'],
      ['demand-location', values.location ? values.location.trim() : '', 'Enter the receiving location.'],
      ['demand-reason', values.reason ? values.reason.trim() : '', 'Explain why this request is urgent.'],
      ['demand-urgency', values.urgency, 'Choose an urgency level.'],
      ['demand-deadline', values.deadline, 'Choose a receiving deadline.']
    ];

    requiredFields.forEach(([id, value, message]) => {
      if (!value) {
        setFieldError(id, message);
        isValid = false;
      }
    });

    if (values.quantity && (!Number.isFinite(Number(values.quantity)) || Number(values.quantity) <= 0)) {
      setFieldError('demand-quantity', 'Quantity must be a positive number.');
      isValid = false;
    }

    if (values.deadline && new Date(values.deadline) <= new Date()) {
      setFieldError('demand-deadline', 'Deadline must be in the future.');
      isValid = false;
    }

    if (values.category === 'Other' && (!values.customCategory || !values.customCategory.trim())) {
      setFieldError('custom-category', 'Add a custom category name.');
      isValid = false;
    }

    if (!isValid && demandFeedback) {
      demandFeedback.textContent = 'Please fix the highlighted fields before submitting.';
    }

    return { isValid, values };
  }

  function openDemandModal() {
    setDeadlineMinimum();
    clearFormErrors(demandForm, demandFeedback);
    demandModal.hidden = false;
    document.body.style.overflow = 'hidden';
    window.setTimeout(() => demandCategory?.focus(), 50);
  }

  function closeDemandModal() {
    if (isSubmittingDemand) return;
    demandModal.hidden = true;
    document.body.style.overflow = '';
    demandForm.reset();
    if (customCategoryField) customCategoryField.hidden = true;
    clearFormErrors(demandForm, demandFeedback);
  }

  // Intake Modal Handlers
  function openIntakeModal() {
    clearFormErrors(intakeForm, intakeFeedback);
    const state = RelayStore.getState();
    const prof = state.receiverProfile || {};
    if (intakeCapacityInput) intakeCapacityInput.value = prof.intakeCapacity || 160;
    if (intakeStatusSelect) intakeStatusSelect.value = prof.status || 'Intake Open';
    if (intakeWindowInput) intakeWindowInput.value = prof.intakeWindow || '6:45–7:30 PM';
    if (intakeEntranceInput) intakeEntranceInput.value = prof.entrance || 'South entrance · 4 volunteers ready';
    intakeModal.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeIntakeModal() {
    if (isSubmittingIntake) return;
    intakeModal.hidden = true;
    document.body.style.overflow = '';
    clearFormErrors(intakeForm, intakeFeedback);
  }

  // Bind Event Listeners
  document.querySelector('#create-demand-alert')?.addEventListener('click', openDemandModal);
  document.querySelector('#close-demand-alert')?.addEventListener('click', closeDemandModal);
  document.querySelector('#cancel-demand-alert')?.addEventListener('click', closeDemandModal);
  demandModal?.addEventListener('click', (e) => { if (e.target === demandModal) closeDemandModal(); });

  document.querySelector('#update-intake-btn')?.addEventListener('click', openIntakeModal);
  document.querySelector('#close-intake-modal')?.addEventListener('click', closeIntakeModal);
  document.querySelector('#cancel-intake-modal')?.addEventListener('click', closeIntakeModal);
  intakeModal?.addEventListener('click', (e) => { if (e.target === intakeModal) closeIntakeModal(); });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (demandModal && !demandModal.hidden) closeDemandModal();
      if (intakeModal && !intakeModal.hidden) closeIntakeModal();
    }
  });

  demandCategory?.addEventListener('change', () => {
    if (customCategoryField) {
      customCategoryField.hidden = demandCategory.value !== 'Other';
      if (customCategoryField.hidden && customCategory) customCategory.value = '';
    }
  });

  demandForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (isSubmittingDemand) return;
    const { isValid, values } = validateDemandForm();
    if (!isValid) return;

    isSubmittingDemand = true;
    submitDemandButton.disabled = true;
    submitDemandLabel.textContent = 'Publishing alert…';
    if (demandFeedback) demandFeedback.textContent = 'Connecting with supplier network…';

    window.setTimeout(() => {
      try {
        const finalCategory = values.category === 'Other' ? values.customCategory.trim() : values.category;
        const alert = RelayStore.createDemandAlert({
          category: finalCategory,
          quantity: Number(values.quantity),
          location: values.location.trim(),
          reason: values.reason.trim(),
          urgency: values.urgency,
          deadline: values.deadline
        });

        isSubmittingDemand = false;
        submitDemandButton.disabled = false;
        submitDemandLabel.textContent = 'Create demand alert';
        closeDemandModal();
        showToast(`Demand alert published for ${alert.category} (${alert.quantity} units). Visible to suppliers.`);
      } catch (err) {
        isSubmittingDemand = false;
        submitDemandButton.disabled = false;
        submitDemandLabel.textContent = 'Create demand alert';
        if (demandFeedback) demandFeedback.textContent = err.message;
      }
    }, 350);
  });

  intakeForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (isSubmittingIntake) return;
    clearFormErrors(intakeForm, intakeFeedback);

    const capacity = Number(intakeCapacityInput.value);
    if (!Number.isFinite(capacity) || capacity < 0) {
      setFieldError('intake-capacity-input', 'Enter a valid non-negative capacity.');
      return;
    }
    if (!intakeWindowInput.value.trim()) {
      setFieldError('intake-window-input', 'Enter an intake window.');
      return;
    }

    isSubmittingIntake = true;
    if (submitIntakeBtn) submitIntakeBtn.disabled = true;

    try {
      RelayStore.updateReceiverIntake({
        intakeCapacity: capacity,
        intakeWindow: intakeWindowInput.value.trim(),
        entrance: intakeEntranceInput.value.trim(),
        status: intakeStatusSelect.value
      });

      isSubmittingIntake = false;
      if (submitIntakeBtn) submitIntakeBtn.disabled = false;
      closeIntakeModal();
      showToast('Intake window & capacity updated successfully.');
    } catch (err) {
      isSubmittingIntake = false;
      if (submitIntakeBtn) submitIntakeBtn.disabled = false;
      if (intakeFeedback) intakeFeedback.textContent = err.message;
    }
  });

  // Subscribe to live store updates
  RelayStore.subscribe(renderDashboard);
})();

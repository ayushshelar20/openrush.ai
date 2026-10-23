/**
 * Relay - Supplier Dashboard Logic
 * Coordinates surplus posting, demand matching, and rider dispatch.
 */

(function () {
  'use strict';

  // Modal elements: Surplus
  const surplusModal = document.querySelector('#surplus-modal');
  const surplusForm = document.querySelector('#surplus-form');
  const surplusCategory = document.querySelector('#surplus-category');
  const customSurplusField = document.querySelector('#custom-surplus-category-field');
  const customSurplus = document.querySelector('#custom-surplus-category');
  const surplusLocation = document.querySelector('#surplus-location');
  const surplusHandling = document.querySelector('#surplus-handling');
  const submitSurplusBtn = document.querySelector('#submit-surplus-btn');
  const submitSurplusLabel = document.querySelector('#submit-surplus-label');
  const surplusFeedback = document.querySelector('#surplus-form-feedback');

  // Modal elements: Dispatch
  const dispatchModal = document.querySelector('#dispatch-modal');
  const dispatchForm = document.querySelector('#dispatch-form');
  const dispatchDemandSummary = document.querySelector('#dispatch-demand-summary');
  const dispatchOfferSelect = document.querySelector('#dispatch-offer-select');
  const dispatchQuantityInput = document.querySelector('#dispatch-quantity-input');
  const dispatchRiderSelect = document.querySelector('#dispatch-rider-select');
  const dispatchConstraintCheck = document.querySelector('#dispatch-constraint-check');
  const submitDispatchBtn = document.querySelector('#submit-dispatch-btn');
  const submitDispatchLabel = document.querySelector('#submit-dispatch-label');
  const dispatchFeedback = document.querySelector('#dispatch-form-feedback');

  // Dashboard content elements
  const availableOfferMetric = document.querySelector('#supplier-available-offer');
  const availableUnitMetric = document.querySelector('#supplier-available-unit');
  const openMatchesMetric = document.querySelector('#supplier-open-matches');
  const actionNeededMetric = document.querySelector('#supplier-action-needed');
  const pickupSuccessMetric = document.querySelector('#supplier-pickup-success');
  const statusBanner = document.querySelector('#supplier-status-banner');
  const demandList = document.querySelector('#supplier-demand-list');
  const surplusList = document.querySelector('#supplier-surplus-list');
  const toast = document.querySelector('#supplier-toast');

  let toastTimer;
  let isSubmittingSurplus = false;
  let isSubmittingDispatch = false;
  let activeSelectedDemand = null;

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

  function formatDeadline(val) {
    if (!val) return 'TBD';
    const date = new Date(val);
    if (Number.isNaN(date.getTime())) return val;
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
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

  function renderSupplierDashboard(state) {
    const supplierName = state.supplierProfile?.name || 'Juniper Kitchen';
    const myOffers = (state.offers || []).filter(o => o.supplierId === supplierName);
    const totalAvailableQty = myOffers.reduce((sum, o) => sum + (o.availableQuantity || 0), 0);

    const allDemands = state.demands || [];
    const openDemands = allDemands.filter(d => d.status === 'Open' || d.status === 'Partially Matched');
    const activeAssignments = (state.assignments || []).filter(a => a.supplierName === supplierName && a.status !== 'Delivered' && a.status !== 'Cancelled');

    // Metrics
    if (availableOfferMetric) availableOfferMetric.textContent = String(totalAvailableQty).padStart(2, '0');
    if (availableUnitMetric) availableUnitMetric.textContent = totalAvailableQty === 1 ? 'portion available' : 'portions available';
    if (openMatchesMetric) openMatchesMetric.textContent = String(openDemands.length).padStart(2, '0');
    if (actionNeededMetric) actionNeededMetric.textContent = `${openDemands.length} open for dispatch`;
    if (pickupSuccessMetric) pickupSuccessMetric.textContent = state.supplierProfile?.pickupSuccessRate || '98%';

    // Status Banner
    if (statusBanner) {
      if (activeAssignments.some(a => a.status === 'In Transit')) {
        statusBanner.innerHTML = `<span></span> <strong>LIVE TRANSIT:</strong> Volunteer rider has picked up surplus and is en route to shelter`;
      } else if (openDemands.length > 0) {
        statusBanner.innerHTML = `<span></span> Your kitchen profile is compatible with ${openDemands.length} active shelter requests`;
      } else {
        statusBanner.innerHTML = `<span></span> All current shelter demands are matched and fulfilled`;
      }
    }

    // Render Compatible Demands Queue
    if (demandList) {
      demandList.innerHTML = '';
      if (allDemands.length === 0) {
        demandList.innerHTML = '<div class="empty-state">No active shelter demands right now. New requests will appear here in real time.</div>';
      } else {
        allDemands.forEach(demand => {
          const item = document.createElement('div');
          item.className = 'queue-item';

          // Compatibility scoring
          const matchingOffer = myOffers.find(o => o.availableQuantity > 0 && o.category.toLowerCase() === demand.category.toLowerCase());
          const isHighFit = matchingOffer && matchingOffer.availableQuantity >= demand.remainingQuantity;
          const fitText = isHighFit ? 'HIGH FIT' : matchingOffer ? 'GOOD FIT' : 'COMPATIBLE';
          const fitClass = isHighFit ? 'alert' : '';

          const isFullyDispatched = demand.status === 'Matched' || demand.remainingQuantity <= 0;
          const isInTransit = demand.status === 'In Transit';
          const isDelivered = demand.status === 'Delivered';
          const isCancelled = demand.status === 'Cancelled';

          let statusDisplay = '';
          if (isDelivered) {
            statusDisplay = `<span class="badge-tag live">DELIVERED</span>`;
          } else if (isInTransit) {
            statusDisplay = `<span class="badge-tag alert">IN TRANSIT</span>`;
          } else if (isFullyDispatched) {
            statusDisplay = `<span class="badge-tag">MATCHED</span>`;
          } else if (isCancelled) {
            statusDisplay = `<span class="badge-tag" style="background:#fee;color:#c33;">CANCELLED</span>`;
          } else {
            statusDisplay = `
              <span class="queue-badge ${fitClass}">${fitText} ↗</span>
              <button class="queue-action-btn dispatch-trigger-btn" data-demand-id="${escapeHtml(demand.id)}" type="button" style="margin-top:6px;">
                Accept / Dispatch ↗
              </button>
            `;
          }

          item.innerHTML = `
            <div>
              <b>${escapeHtml(demand.receiverId)} · ${escapeHtml(demand.category)}</b>
              <small>
                Need: <strong>${demand.remainingQuantity} of ${demand.quantity} units</strong> · Needed by ${escapeHtml(formatDeadline(demand.deadline))}<br />
                Location: ${escapeHtml(demand.location)}<br />
                <em>${escapeHtml(demand.reason || 'Urgent community relief')}</em>
              </small>
            </div>
            <div style="text-align:right; display:flex; flex-direction:column; align-items:flex-end;">
              ${statusDisplay}
            </div>
          `;
          demandList.appendChild(item);
        });
      }
    }

    // Bind dispatch trigger buttons
    document.querySelectorAll('.dispatch-trigger-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const demandId = btn.dataset.demandId;
        const demand = (state.demands || []).find(d => d.id === demandId);
        if (demand) openDispatchModal(demand);
      });
    });

    // Render Active Surplus Inventory List
    if (surplusList) {
      surplusList.innerHTML = '';
      if (myOffers.length === 0) {
        surplusList.innerHTML = '<small style="color:var(--muted)">No surplus offers posted yet. Click below to add surplus.</small>';
      } else {
        myOffers.forEach(offer => {
          const row = document.createElement('div');
          row.className = 'surplus-inventory-item';
          row.innerHTML = `
            <div>
              <b>${escapeHtml(offer.category)} · ${offer.availableQuantity} available</b>
              <small>Expires: ${escapeHtml(formatDeadline(offer.expiryDeadline))}<br/>${escapeHtml(offer.handlingRequirements)}</small>
            </div>
            <span class="badge-tag ${offer.availableQuantity > 0 ? 'live' : ''}">${escapeHtml(offer.status)}</span>
          `;
          surplusList.appendChild(row);
        });
      }
    }
  }

  // --- POST SURPLUS OFFER MODAL ---
  function setSurplusExpiryMinimum() {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    const expiryInput = document.querySelector('#surplus-expiry');
    if (expiryInput) {
      expiryInput.min = now.toISOString().slice(0, 16);
      if (!expiryInput.value) {
        const defaultExpiry = new Date(Date.now() + 4 * 3600 * 1000);
        defaultExpiry.setMinutes(defaultExpiry.getMinutes() - defaultExpiry.getTimezoneOffset());
        expiryInput.value = defaultExpiry.toISOString().slice(0, 16);
      }
    }
  }

  function openSurplusModal() {
    setSurplusExpiryMinimum();
    clearFormErrors(surplusForm, surplusFeedback);
    if (surplusLocation && !surplusLocation.value) {
      surplusLocation.value = 'Juniper Kitchen · Loading dock B';
    }
    if (surplusHandling && !surplusHandling.value) {
      surplusHandling.value = 'Hot-hold packaging · Vegetarian + nut-free supported';
    }
    surplusModal.hidden = false;
    document.body.style.overflow = 'hidden';
    window.setTimeout(() => surplusCategory?.focus(), 50);
  }

  function closeSurplusModal() {
    if (isSubmittingSurplus) return;
    surplusModal.hidden = true;
    document.body.style.overflow = '';
    surplusForm.reset();
    if (customSurplusField) customSurplusField.hidden = true;
    clearFormErrors(surplusForm, surplusFeedback);
  }

  surplusCategory?.addEventListener('change', () => {
    if (customSurplusField) {
      customSurplusField.hidden = surplusCategory.value !== 'Other';
      if (customSurplusField.hidden && customSurplus) customSurplus.value = '';
    }
  });

  surplusForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (isSubmittingSurplus) return;
    clearFormErrors(surplusForm, surplusFeedback);

    const formData = new FormData(surplusForm);
    const values = Object.fromEntries(formData.entries());
    let isValid = true;

    if (!values.category) {
      setFieldError('surplus-category', 'Please select a surplus category.');
      isValid = false;
    }
    if (values.category === 'Other' && (!values.customCategory || !values.customCategory.trim())) {
      setFieldError('custom-surplus-category', 'Please enter a custom category name.');
      isValid = false;
    }
    const quantity = Number(values.quantity);
    if (!quantity || quantity <= 0) {
      setFieldError('surplus-quantity', 'Quantity must be greater than zero.');
      isValid = false;
    }
    if (!values.expiryDeadline) {
      setFieldError('surplus-expiry', 'Select a safe-use / expiry deadline.');
      isValid = false;
    } else if (new Date(values.expiryDeadline) <= new Date()) {
      setFieldError('surplus-expiry', 'Expiry deadline must be in the future.');
      isValid = false;
    }
    if (!values.location || !values.location.trim()) {
      setFieldError('surplus-location', 'Enter pickup location and access point.');
      isValid = false;
    }
    if (!values.handlingRequirements || !values.handlingRequirements.trim()) {
      setFieldError('surplus-handling', 'Specify handling requirements.');
      isValid = false;
    }

    if (!isValid) {
      if (surplusFeedback) surplusFeedback.textContent = 'Please fix the highlighted fields before submitting.';
      return;
    }

    isSubmittingSurplus = true;
    if (submitSurplusBtn) submitSurplusBtn.disabled = true;
    if (submitSurplusLabel) submitSurplusLabel.textContent = 'Posting surplus…';

    window.setTimeout(() => {
      try {
        const finalCategory = values.category === 'Other' ? values.customCategory.trim() : values.category;
        const offer = RelayStore.createSupplyOffer({
          category: finalCategory,
          quantity,
          location: values.location.trim(),
          expiryDeadline: values.expiryDeadline,
          handlingRequirements: values.handlingRequirements.trim()
        });

        isSubmittingSurplus = false;
        if (submitSurplusBtn) submitSurplusBtn.disabled = false;
        if (submitSurplusLabel) submitSurplusLabel.textContent = 'Post surplus offer';
        closeSurplusModal();
        showToast(`Surplus offer posted: ${offer.quantity} portions of ${offer.category}. Ready for dispatch.`);
      } catch (err) {
        isSubmittingSurplus = false;
        if (submitSurplusBtn) submitSurplusBtn.disabled = false;
        if (submitSurplusLabel) submitSurplusLabel.textContent = 'Post surplus offer';
        if (surplusFeedback) surplusFeedback.textContent = err.message;
      }
    }, 350);
  });

  // --- ACCEPT & DISPATCH WORKFLOW MODAL ---
  function openDispatchModal(demand) {
    activeSelectedDemand = demand;
    clearFormErrors(dispatchForm, dispatchFeedback);
    const state = RelayStore.getState();

    // Populate demand summary
    if (dispatchDemandSummary) {
      dispatchDemandSummary.innerHTML = `
        <b>Shelter Request: ${escapeHtml(demand.receiverId)}</b>
        <p>
          Category: <strong>${escapeHtml(demand.category)}</strong> · Urgency: <strong>${escapeHtml(demand.urgency)}</strong><br/>
          Portions Needed: <strong>${demand.remainingQuantity} units</strong> (Total requested: ${demand.quantity})<br/>
          Destination: ${escapeHtml(demand.location)}<br/>
          Intake Deadline: <strong>${escapeHtml(formatDeadline(demand.deadline))}</strong>
        </p>
      `;
    }

    // Populate surplus offer selector
    if (dispatchOfferSelect) {
      dispatchOfferSelect.innerHTML = '';
      const supplierName = state.supplierProfile?.name || 'Juniper Kitchen';
      const availableOffers = (state.offers || []).filter(o => o.supplierId === supplierName && o.availableQuantity > 0);

      if (availableOffers.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'No available surplus in your inventory. Post surplus first.';
        dispatchOfferSelect.appendChild(opt);
      } else {
        availableOffers.forEach(o => {
          const opt = document.createElement('option');
          opt.value = o.id;
          const matchLabel = o.category.toLowerCase() === demand.category.toLowerCase() ? '★ Perfect Match' : 'Available';
          opt.textContent = `${o.category} · ${o.availableQuantity} units available (${matchLabel}, expires ${formatDeadline(o.expiryDeadline)})`;
          dispatchOfferSelect.appendChild(opt);
        });
      }
    }

    // Populate volunteer rider selector
    if (dispatchRiderSelect) {
      dispatchRiderSelect.innerHTML = '';
      const riders = state.riders || [];
      const availableRiders = riders.filter(r => r.availabilityStatus === 'Available');

      if (availableRiders.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'No volunteer riders currently available.';
        dispatchRiderSelect.appendChild(opt);
      } else {
        availableRiders.forEach(r => {
          const opt = document.createElement('option');
          opt.value = r.id;
          opt.textContent = `${r.name} · ${r.vehicleType} (${r.currentCapacity} units free, available until ${r.availableUntil})`;
          dispatchRiderSelect.appendChild(opt);
        });
      }
    }

    // Auto-calculate suggested quantity
    const firstOffer = (state.offers || []).find(o => o.id === dispatchOfferSelect.value);
    const suggestedQty = firstOffer ? Math.min(firstOffer.availableQuantity, demand.remainingQuantity) : Math.min(12, demand.remainingQuantity);
    if (dispatchQuantityInput) {
      dispatchQuantityInput.value = suggestedQty > 0 ? suggestedQty : 1;
      dispatchQuantityInput.max = firstOffer ? firstOffer.availableQuantity : 100;
    }

    updateDispatchFeasibility();

    dispatchModal.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeDispatchModal() {
    if (isSubmittingDispatch) return;
    dispatchModal.hidden = true;
    document.body.style.overflow = '';
    clearFormErrors(dispatchForm, dispatchFeedback);
    activeSelectedDemand = null;
  }

  function updateDispatchFeasibility() {
    if (!dispatchConstraintCheck || !activeSelectedDemand) return;
    const state = RelayStore.getState();
    const offerId = dispatchOfferSelect?.value;
    const riderId = dispatchRiderSelect?.value;
    const qty = Number(dispatchQuantityInput?.value || 0);

    const offer = (state.offers || []).find(o => o.id === offerId);
    const rider = (state.riders || []).find(r => r.id === riderId);

    const checks = [];

    // Check 1: Surplus availability
    if (!offer) {
      checks.push('<span style="color:#d96548;">✗ No surplus offer selected</span>');
    } else if (qty > offer.availableQuantity) {
      checks.push(`<span style="color:#d96548;">✗ Requested ${qty} exceeds available surplus (${offer.availableQuantity} units)</span>`);
    } else {
      checks.push(`<span style="color:#59966a;">✓ Surplus available (${qty} of ${offer.availableQuantity} units)</span>`);
    }

    // Check 2: Rider capacity
    if (!rider) {
      checks.push('<span style="color:#d96548;">✗ No volunteer rider selected</span>');
    } else if (rider.availabilityStatus !== 'Available') {
      checks.push(`<span style="color:#d96548;">✗ Rider is currently ${rider.availabilityStatus}</span>`);
    } else if (qty > rider.currentCapacity) {
      checks.push(`<span style="color:#d96548;">✗ Vehicle capacity exceeded: Rider only has ${rider.currentCapacity} units free</span>`);
    } else {
      checks.push(`<span style="color:#59966a;">✓ Vehicle capacity verified (${qty} units fit in ${rider.vehicleType})</span>`);
    }

    // Check 3: Timing
    if (offer && offer.expiryDeadline) {
      const offerExpiry = new Date(offer.expiryDeadline);
      const demandDeadline = new Date(activeSelectedDemand.deadline);
      if (offerExpiry <= new Date()) {
        checks.push('<span style="color:#d96548;">✗ Surplus offer has expired</span>');
      } else {
        checks.push('<span style="color:#59966a;">✓ Safe-use window compliant before intake close</span>');
      }
    }

    dispatchConstraintCheck.innerHTML = `
      <b>Operational Feasibility &amp; Safety Checks</b>
      <div style="display:flex; flex-direction:column; gap:4px; margin-top:6px; font-size:10px;">
        ${checks.join('')}
      </div>
    `;
  }

  dispatchOfferSelect?.addEventListener('change', updateDispatchFeasibility);
  dispatchRiderSelect?.addEventListener('change', updateDispatchFeasibility);
  dispatchQuantityInput?.addEventListener('input', updateDispatchFeasibility);

  dispatchForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (isSubmittingDispatch) return;
    clearFormErrors(dispatchForm, dispatchFeedback);

    if (!activeSelectedDemand) {
      if (dispatchFeedback) dispatchFeedback.textContent = 'No demand selected.';
      return;
    }

    const offerId = dispatchOfferSelect?.value;
    const riderId = dispatchRiderSelect?.value;
    const quantity = Number(dispatchQuantityInput?.value);

    let isValid = true;
    if (!offerId) {
      setFieldError('dispatch-offer-select', 'Select an inventory offer.');
      isValid = false;
    }
    if (!riderId) {
      setFieldError('dispatch-rider-select', 'Select a volunteer rider.');
      isValid = false;
    }
    if (!quantity || quantity <= 0) {
      setFieldError('dispatch-quantity-input', 'Enter a quantity greater than zero.');
      isValid = false;
    }

    if (!isValid) return;

    isSubmittingDispatch = true;
    if (submitDispatchBtn) submitDispatchBtn.disabled = true;
    if (submitDispatchLabel) submitDispatchLabel.textContent = 'Dispatching to rider…';

    window.setTimeout(() => {
      try {
        const assignment = RelayStore.createAssignment({
          demandId: activeSelectedDemand.id,
          offerId,
          riderId,
          quantity
        });

        isSubmittingDispatch = false;
        if (submitDispatchBtn) submitDispatchBtn.disabled = false;
        if (submitDispatchLabel) submitDispatchLabel.textContent = 'Confirm & dispatch assignment';
        closeDispatchModal();
        showToast(`Route dispatched to volunteer ${assignment.riderName}! Awaiting rider acceptance.`);
      } catch (err) {
        isSubmittingDispatch = false;
        if (submitDispatchBtn) submitDispatchBtn.disabled = false;
        if (submitDispatchLabel) submitDispatchLabel.textContent = 'Confirm & dispatch assignment';
        if (dispatchFeedback) dispatchFeedback.textContent = err.message;
      }
    }, 400);
  });

  // Bind Open/Close modal triggers
  document.querySelector('#post-surplus-btn')?.addEventListener('click', openSurplusModal);
  document.querySelector('#close-surplus-modal')?.addEventListener('click', closeSurplusModal);
  document.querySelector('#cancel-surplus-modal')?.addEventListener('click', closeSurplusModal);
  surplusModal?.addEventListener('click', (e) => { if (e.target === surplusModal) closeSurplusModal(); });

  document.querySelector('#close-dispatch-modal')?.addEventListener('click', closeDispatchModal);
  document.querySelector('#cancel-dispatch-modal')?.addEventListener('click', closeDispatchModal);
  dispatchModal?.addEventListener('click', (e) => { if (e.target === dispatchModal) closeDispatchModal(); });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (surplusModal && !surplusModal.hidden) closeSurplusModal();
      if (dispatchModal && !dispatchModal.hidden) closeDispatchModal();
    }
  });

  // Subscribe to live store updates
  RelayStore.subscribe(renderSupplierDashboard);
})();

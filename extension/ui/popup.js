/**
 * @module popup
 * @description Context-aware HotelFinder Extension Popup UI with Milestone Progression Ladder.
 *
 * Implements Camino A1:
 * - Real-time milestone progress bar toward reachable tiers ($3.00, $10.00, $25.00 USD).
 * - 1-Click Reward Voucher Claim with server-side balance validation.
 * - Honest pricing breakdown with +1.5% loyalty credit rewards.
 */

const AFFILIATE = {
  marker: '740868',
  trs: '540934',
  pKlook: '4110',
  campaignKlook: '137',
  subid: 'HotelFinder',
};

const BACKEND_URL = 'http://localhost:5000';

function formatCurrency(amount, currency = 'EUR') {
  const num = parseFloat(amount) || 0;
  const formatted = num.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const curr = (currency || 'EUR').toUpperCase();

  switch (curr) {
    case 'EUR': return `${formatted} €`;
    case 'GBP': return `£${formatted}`;
    case 'JPY': return `¥${Math.round(num)}`;
    case 'COP': return `$${Math.round(num)} COP`;
    case 'BRL': return `R$ ${formatted}`;
    case 'MXN': return `$${formatted} MXN`;
    default: return `$${formatted} ${curr}`;
  }
}

function buildKlookAffiliateUrl(destinationUrl = 'https://www.klook.com/es/hotels/', subid = 'HotelFinder') {
  let target = destinationUrl;
  const cleanSubid = (subid || 'HotelFinder').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);

  try {
    const urlObj = new URL(target);
    urlObj.searchParams.set('hotelfinder_active', 'true');
    urlObj.searchParams.set('subid', cleanSubid);
    target = urlObj.toString();
  } catch {
    const sep = target.includes('?') ? '&' : '?';
    target = `${target}${sep}hotelfinder_active=true&subid=${cleanSubid}`;
  }

  const encoded = encodeURIComponent(target);
  return `https://tp.media/r?marker=${AFFILIATE.marker}.${cleanSubid}&trs=${AFFILIATE.trs}&p=${AFFILIATE.pKlook}&campaign_id=${AFFILIATE.campaignKlook}&u=${encoded}`;
}

function isKlookDetailPage(url) {
  if (!url || !url.includes('klook.com')) return false;
  try {
    const urlObj = new URL(url);
    const path = urlObj.pathname.toLowerCase();
    const isDetail = /\/(detail|hotels?|activity|event|experience)\//.test(path);
    const segments = path.split('/').filter(Boolean);
    const hasProductSlug = segments.length >= 2 && /\d+/.test(path);
    return isDetail || hasProductSlug;
  } catch {
    return false;
  }
}

function $(id) { return document.getElementById(id); }

document.addEventListener('DOMContentLoaded', async () => {
  const hotelContent = $('hotel-content');
  const browsingState = $('browsing-state');
  const otherProviderState = $('other-provider-state');
  const loadingState = $('loading-state');
  const spinnerEl = $('main-spinner');
  const statusTitle = $('status-title');
  const statusDesc = $('status');

  const milestoneBox = $('milestone-box');
  const uiBalanceVal = $('ui-balance-val');
  const uiTierBadge = $('ui-tier-badge');
  const uiProgressBar = $('ui-progress-bar');
  const uiMilestoneText = $('ui-milestone-text');
  const uiMilestonePercent = $('ui-milestone-percent');
  const btnClaimReward = $('btn-claim-reward');

  const claimModal = $('claim-modal');
  const claimEmailInput = $('claim-email-input');
  const btnCancelClaim = $('btn-cancel-claim');
  const btnSubmitClaim = $('btn-submit-claim');
  const claimFeedback = $('claim-feedback');

  const hotelNameEl = $('hotel-name');
  const priceNewEl = $('price-new');
  const saveAmountTextEl = $('save-amount-text');
  const saveTotalEl = $('save-total');
  const btnOffer = $('btn-offer');
  const popupSuccessBanner = $('popup-success-banner');
  const popupBannerTitle = $('popup-banner-title');
  const popupBannerDesc = $('popup-banner-desc');
  const roomsContainer = $('rooms-container');
  const roomsList = $('rooms-list');
  const singlePricingSection = $('single-pricing-section');

  const otherProviderTitle = $('other-provider-title');
  const btnGoKlook = $('btn-go-klook');

  let currentDeviceToken = 'HotelFinder';
  let activeMilestoneData = null;

  function showView(viewName) {
    hotelContent.classList.add('hidden');
    browsingState.classList.add('hidden');
    otherProviderState.classList.add('hidden');
    loadingState.classList.remove('active');
    loadingState.style.display = 'none';

    if (viewName === 'hotel') {
      hotelContent.classList.remove('hidden');
      if (milestoneBox) milestoneBox.classList.remove('hidden');
    } else if (viewName === 'browsing') {
      browsingState.classList.remove('hidden');
      if (milestoneBox) milestoneBox.classList.remove('hidden');
    } else if (viewName === 'other_provider') {
      otherProviderState.classList.remove('hidden');
      if (milestoneBox) milestoneBox.classList.add('hidden');
    } else if (viewName === 'loading') {
      loadingState.classList.add('active');
      loadingState.style.display = 'flex';
      if (milestoneBox) milestoneBox.classList.add('hidden');
    }
  }

  // Fetch user device token & loyalty account with milestone progress
  async function fetchLoyaltyAccount() {
    try {
      if (chrome.storage?.local) {
        const stored = await chrome.storage.local.get(['device_token']);
        if (stored.device_token) currentDeviceToken = stored.device_token;
      }

      const res = await fetch(`${BACKEND_URL}/api/loyalty/account?device_token=${currentDeviceToken}`);
      if (res.ok) {
        const json = await res.json();
        if (json.milestone) {
          activeMilestoneData = json.milestone;
          renderMilestoneProgress(json.milestone);
        }
      }
    } catch {}
  }

  // Render Milestone Progress Bar & Claim Button
  function renderMilestoneProgress(milestone) {
    const { availableUsd, targetTier, progressPercent, remainingUsd, hasClaimableReward, claimableTiers } = milestone;

    if (uiBalanceVal) uiBalanceVal.textContent = `$${availableUsd.toFixed(2)} USD`;
    if (uiTierBadge) uiTierBadge.textContent = `${targetTier.label}`;
    if (uiProgressBar) uiProgressBar.style.width = `${progressPercent}%`;
    if (uiMilestonePercent) uiMilestonePercent.textContent = `${progressPercent}%`;

    if (uiMilestoneText) {
      if (progressPercent >= 100) {
        uiMilestoneText.textContent = `¡Meta de $${targetTier.amountUsd.toFixed(2)} alcanzada!`;
      } else {
        uiMilestoneText.textContent = `Faltan $${remainingUsd.toFixed(2)} USD para ${targetTier.label}`;
      }
    }

    if (hasClaimableReward && claimableTiers.length > 0) {
      const topClaimable = claimableTiers[claimableTiers.length - 1];
      if (btnClaimReward) {
        btnClaimReward.textContent = `🎁 Reclamar ${topClaimable.label}`;
        btnClaimReward.classList.remove('hidden');
        btnClaimReward.onclick = () => {
          openClaimModal(topClaimable);
        };
      }
    } else {
      if (btnClaimReward) btnClaimReward.classList.add('hidden');
    }
  }

  function openClaimModal(tier) {
    if (claimModal) {
      claimModal.classList.remove('hidden');
      $('claim-modal-title').textContent = `🎁 Reclamar ${tier.label}`;
      $('claim-modal-desc').textContent = `Se descontarán $${tier.amountUsd.toFixed(2)} USD de tu saldo confirmado y te enviaremos el código oficial a tu correo.`;
      claimFeedback.classList.add('hidden');

      btnSubmitClaim.onclick = async () => {
        const email = claimEmailInput.value.trim();
        if (!email || !email.includes('@')) {
          showClaimFeedback('Por favor ingresa un correo válido.', false);
          return;
        }

        try {
          btnSubmitClaim.disabled = true;
          btnSubmitClaim.textContent = 'Enviando...';

          const res = await fetch(`${BACKEND_URL}/api/loyalty/claim-reward`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              device_token: currentDeviceToken,
              email,
              tier_cents: tier.amountCents,
            }),
          });

          const data = await res.json();
          btnSubmitClaim.disabled = false;
          btnSubmitClaim.textContent = 'Confirmar Envío';

          if (res.ok && data.success) {
            showClaimFeedback(data.message, true);
            setTimeout(() => {
              claimModal.classList.add('hidden');
              fetchLoyaltyAccount();
            }, 3000);
          } else {
            showClaimFeedback(data.message || 'Error al procesar solicitud', false);
          }
        } catch {
          btnSubmitClaim.disabled = false;
          btnSubmitClaim.textContent = 'Confirmar Envío';
          showClaimFeedback('Error de conexión con el servidor', false);
        }
      };
    }
  }

  function showClaimFeedback(msg, isSuccess) {
    if (claimFeedback) {
      claimFeedback.textContent = msg;
      claimFeedback.className = `claim-feedback ${isSuccess ? 'success' : 'error'}`;
      claimFeedback.classList.remove('hidden');
    }
  }

  if (btnCancelClaim) {
    btnCancelClaim.onclick = () => {
      if (claimModal) claimModal.classList.add('hidden');
    };
  }

  // Render State 1: Active Hotel Detail on Klook
  function renderHotelDetail(dataObj, currentUrl, isAffiliateActive) {
    const req = dataObj?.reqDataUi || {};
    const disc = dataObj?.discountData || {};
    const hotelTitle = req.hotel_name || 'Alojamiento Verificado';
    const curr = disc.currency || req.currency || 'EUR';
    const totalPrice = disc.originalPrice || req.currentPrice || 100;
    const credits = disc.cashbackAmount || Math.max(0.50, Math.round((totalPrice * 0.015) * 100) / 100);

    hotelNameEl.textContent = hotelTitle;

    if (isAffiliateActive) {
      popupSuccessBanner.style.backgroundColor = '#F0FDF4';
      popupSuccessBanner.style.borderColor = '#A7F3D0';
      popupBannerTitle.textContent = '🛡️ ¡Reserva Oficial Protegida!';
      popupBannerTitle.style.color = '#065F46';
      popupBannerDesc.innerHTML = `Navegando con tarifa oficial y <strong>+${formatCurrency(credits, curr)}</strong> en créditos vinculados.`;

      priceNewEl.textContent = formatCurrency(totalPrice, curr);
      saveAmountTextEl.textContent = `🎁 +${formatCurrency(credits, curr)} Créditos`;
      saveTotalEl.textContent = 'Se confirmarán tras tu estancia';

      btnOffer.innerHTML = `✅ Reserva Protegida en Klook`;
      btnOffer.style.backgroundColor = '#10B981';
      btnOffer.onclick = () => {};
      showView('hotel');
      return;
    }

    // Standard pre-booking state
    popupSuccessBanner.style.backgroundColor = '#F0F9FF';
    popupSuccessBanner.style.borderColor = '#BAE6FD';
    popupBannerTitle.textContent = `🎁 ¡Ganas ${formatCurrency(credits, curr)} (1.5%) en Créditos!`;
    popupBannerTitle.style.color = '#0284C7';
    popupBannerDesc.innerHTML = `Tarifa oficial garantizada en Klook. Acumulas <strong>${formatCurrency(credits, curr)}</strong> para tu meta de recompensas.`;

    const rooms = req.room_options || [];
    let selectedRoomDeeplink = disc.affiliateUrl || buildKlookAffiliateUrl(req.pageUrl || currentUrl);

    if (Array.isArray(rooms) && rooms.length > 0) {
      if (singlePricingSection) singlePricingSection.classList.add('hidden');
      if (roomsContainer) roomsContainer.classList.remove('hidden');

      roomsList.innerHTML = '';
      rooms.forEach((room, idx) => {
        const card = document.createElement('div');
        card.className = `room-card-item ${idx === 0 ? 'selected' : ''}`;

        const benefitsHtml = room.has_breakfast
          ? '<span class="room-badge" style="background:#D1FAE5; color:#065F46;">☕ Desayuno</span>'
          : '<span class="room-badge">Tarifa Oficial</span>';

        const roomPrice = room.price || totalPrice;
        const roomCredits = Math.max(0.50, Math.round((roomPrice * 0.015) * 100) / 100);

        card.innerHTML = `
          <div class="room-details">
            <div class="room-name">${room.room_name}</div>
            <div class="room-bed">🛏️ ${room.bed_type}</div>
            <div class="room-badges">
              ${benefitsHtml}
              <span class="room-badge" style="background:#E0F2FE; color:#0369A1;">🎁 +${formatCurrency(roomCredits, room.currency || curr)}</span>
            </div>
          </div>
          <div class="room-price-col">
            <div class="room-price-val">${formatCurrency(roomPrice, room.currency || curr)}</div>
          </div>
        `;

        card.onclick = () => {
          document.querySelectorAll('.room-card-item').forEach(c => c.classList.remove('selected'));
          card.classList.add('selected');

          const baseUrl = req.pageUrl || currentUrl;
          if (room.rate_code) {
            selectedRoomDeeplink = buildKlookAffiliateUrl(`${baseUrl}#rate_${room.rate_code}`);
          } else {
            selectedRoomDeeplink = buildKlookAffiliateUrl(baseUrl);
          }
        };

        roomsList.appendChild(card);
      });
    } else {
      if (roomsContainer) roomsContainer.classList.add('hidden');
      if (singlePricingSection) singlePricingSection.classList.remove('hidden');

      priceNewEl.textContent = formatCurrency(totalPrice, curr);
      saveAmountTextEl.textContent = `🎁 +${formatCurrency(credits, curr)} en Créditos`;
      saveTotalEl.textContent = 'Se confirman tras tu estancia';
    }

    btnOffer.innerHTML = `🔒 Reservar Tarifa Oficial y Acumular <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>`;
    btnOffer.style.backgroundColor = '#10B981';

    btnOffer.onclick = () => {
      window.open(selectedRoomDeeplink, '_blank');
    };

    showView('hotel');
  }

  // Render State 2: General Browsing on Klook
  function renderKlookBrowsing() {
    showView('browsing');
  }

  // Render State 3: Other Provider Guidance (Booking / Expedia)
  function renderOtherProvider(providerName) {
    if (otherProviderTitle) {
      otherProviderTitle.textContent = `Próximamente en ${providerName}`;
    }

    if (btnGoKlook) {
      btnGoKlook.onclick = () => {
        const klookUrl = buildKlookAffiliateUrl('https://www.klook.com/es/hotels/');
        window.open(klookUrl, '_blank');
      };
    }

    showView('other_provider');
  }

  // Render State 4: Unsupported Site
  function renderUnsupportedSite() {
    if (spinnerEl) spinnerEl.style.display = 'none';
    statusTitle.textContent = 'Sitio no compatible';
    statusTitle.style.color = '#334155';
    statusDesc.textContent = 'Visita Klook.com para activar tu copiloto de ahorro y recompensas de hotel.';
    showView('loading');
  }

  // Initial account fetch
  await fetchLoyaltyAccount();

  // Main Tab Router
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const activeTab = tabs[0] || {};
    const currentUrl = activeTab.url || '';

    // Check if on Klook
    if (currentUrl.includes('klook.com')) {
      const isDetail = isKlookDetailPage(currentUrl);

      if (!isDetail) {
        renderKlookBrowsing();
        return;
      }

      const isAffiliateActive = currentUrl.includes('hotelfinder_active=true') || currentUrl.includes('subid=');

      if (activeTab.id) {
        chrome.tabs.sendMessage(activeTab.id, { action: 'GET_HOTEL_DATA' }, (response) => {
          if (chrome.runtime.lastError || !response?.data) {
            if (chrome.storage?.local) {
              chrome.storage.local.get(['lastHotelData'], (res) => {
                if (res.lastHotelData?.reqDataUi?.hotel_name) {
                  renderHotelDetail(res.lastHotelData, currentUrl, isAffiliateActive);
                } else {
                  renderKlookBrowsing();
                }
              });
            } else {
              renderKlookBrowsing();
            }
          } else {
            renderHotelDetail(response.data, currentUrl, isAffiliateActive);
          }
        });
      } else {
        renderKlookBrowsing();
      }
      return;
    }

    // Check if on other hotel sites (Booking.com, Expedia)
    if (currentUrl.includes('booking.com') || currentUrl.includes('expedia.com')) {
      const provider = currentUrl.includes('booking.com') ? 'Booking.com' : 'Expedia';
      renderOtherProvider(provider);
      return;
    }

    // Otherwise, unsupported site
    renderUnsupportedSite();
  });
});

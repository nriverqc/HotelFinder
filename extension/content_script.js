/**
 * @module content_script
 * @description HotelFinder Content Script — injected into hotel provider pages.
 *
 * Handles:
 * 1. Klook: Real-time price detection, verified rates, and 1.5% loyalty credit rewards.
 * 2. Other Providers (Booking.com, Expedia): Friendly "Integration in Progress" guidance
 *    inviting users to book through our active verified partner (Klook) to earn credits.
 * 3. Affiliate tracking validation & VIP protection banners.
 *
 * @version 18.0
 */

console.log("HotelFinder: Content script v18.0 (Klook Partner & Loyalty) loaded");

// ══════════════════════════════════════════════
//  CONFIGURATION
// ══════════════════════════════════════════════

const AFFILIATE_CONFIG = {
  marker: '740868',
  trs: '540934',
  pKlook: '4110',
  campaignKlook: '137',
  subid: 'HotelFinder',
};

const MIN_PRICE_THRESHOLD = 50;
const DEBOUNCE_DELAY = 600;
const INITIAL_SCAN_DELAY = 800;

// ══════════════════════════════════════════════
//  STATE
// ══════════════════════════════════════════════

let isSearching = false;
let lastScannedStr = null;
let latestScanResult = null;

// ══════════════════════════════════════════════
//  AFFILIATE STATE DETECTION
// ══════════════════════════════════════════════

function checkIsAffiliateActive() {
  const url = window.location.href;
  let hasUrlTag = false;

  try {
    const urlParams = new URLSearchParams(window.location.search);
    hasUrlTag = urlParams.get('hotelfinder_active') === 'true' ||
      urlParams.get('subid') === 'HotelFinder' ||
      url.includes('hotelfinder_active=true') ||
      url.includes('subid=HotelFinder') ||
      url.includes('marker=740868');
  } catch {
    hasUrlTag = url.includes('hotelfinder_active=true') || url.includes('subid=HotelFinder');
  }

  let hasSessionTag = false;
  try {
    hasSessionTag = sessionStorage.getItem('hotelfinder_active') === 'true';
  } catch {}

  const hasReferrerTag = document.referrer.includes('tp.media') ||
    document.referrer.includes('tpo.mx');

  const isActive = hasUrlTag || hasSessionTag || hasReferrerTag;

  if (isActive) {
    try {
      sessionStorage.setItem('hotelfinder_active', 'true');
    } catch {}

    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.set({ is_affiliate_active: true });
    }
  }

  return isActive;
}

function activateAndNavigate(targetUrl) {
  try {
    sessionStorage.setItem('hotelfinder_active', 'true');
  } catch {}

  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    chrome.storage.local.set({ is_affiliate_active: true });
  }

  window.location.href = targetUrl;
}

// ══════════════════════════════════════════════
//  UTILITIES
// ══════════════════════════════════════════════

function debounce(func, wait) {
  let timeout;
  const debounced = function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
  debounced.immediate = function (...args) {
    clearTimeout(timeout);
    func.apply(this, args);
  };
  return debounced;
}

function parsePriceAndCurrency(priceStr) {
  if (!priceStr || typeof priceStr !== 'string') return null;

  let currency = 'EUR';
  const currencyMatch = priceStr.match(/\b(USD|EUR|COP|MXN|GBP|BRL|JPY|THB|AUD|CAD|CHF)\b/i);
  if (currencyMatch) {
    currency = currencyMatch[1].toUpperCase();
  } else if (priceStr.includes('€')) { currency = 'EUR'; }
  else if (priceStr.includes('£')) { currency = 'GBP'; }
  else if (priceStr.includes('¥')) { currency = 'JPY'; }
  else if (priceStr.includes('R$')) { currency = 'BRL'; }
  else if (priceStr.includes('฿')) { currency = 'THB'; }
  else if (priceStr.includes('$')) { currency = 'USD'; }

  const cleaned = priceStr.replace(/[^\d.,]/g, '').trim();
  if (!cleaned) return null;

  let normalized = cleaned;
  if (cleaned.includes(',') && cleaned.includes('.')) {
    if (cleaned.indexOf('.') < cleaned.indexOf(',')) {
      normalized = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = cleaned.replace(/,/g, '');
    }
  } else if (cleaned.includes(',')) {
    const parts = cleaned.split(',');
    if (parts.length === 2 && parts[1].length <= 2) {
      normalized = cleaned.replace(',', '.');
    } else {
      normalized = cleaned.replace(/,/g, '');
    }
  }

  const parsed = parseFloat(normalized);
  if (isNaN(parsed) || parsed <= 0) return null;
  return { price: Math.round(parsed * 100) / 100, currency };
}

function formatCurrency(amount, currencyCode = 'EUR') {
  const num = parseFloat(amount) || 0;
  const formatted = num.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  switch (currencyCode.toUpperCase()) {
    case 'EUR': return `${formatted} €`;
    case 'GBP': return `£${formatted}`;
    case 'JPY': return `¥${Math.round(num)}`;
    case 'COP': return `$${Math.round(num)} COP`;
    case 'BRL': return `R$ ${formatted}`;
    case 'MXN': return `$${formatted} MXN`;
    default: return `$${formatted} ${currencyCode.toUpperCase()}`;
  }
}

function buildKlookAffiliateUrl(destinationUrl = 'https://www.klook.com/es/hotels/') {
  const { marker, trs, pKlook, campaignKlook, subid } = AFFILIATE_CONFIG;
  let target = destinationUrl;

  try {
    const urlObj = new URL(target);
    urlObj.searchParams.set('hotelfinder_active', 'true');
    urlObj.searchParams.set('subid', subid);
    target = urlObj.toString();
  } catch {
    const sep = target.includes('?') ? '&' : '?';
    target = `${target}${sep}hotelfinder_active=true&subid=${subid}`;
  }

  const encoded = encodeURIComponent(target);
  return `https://tp.media/r?marker=${marker}.${subid}&trs=${trs}&p=${pKlook}&campaign_id=${campaignKlook}&u=${encoded}`;
}

// ══════════════════════════════════════════════
//  KLOOK DATA EXTRACTION
// ══════════════════════════════════════════════

function isKlookDetailPage(url) {
  if (!url || !url.includes('klook.com')) return false;

  try {
    const urlObj = new URL(url);
    const path = urlObj.pathname.toLowerCase().replace(/\/$/, '');

    const homePatterns = ['', '/es', '/en-us', '/zh-tw', '/ja', '/de', '/fr'];
    if (homePatterns.includes(path)) return false;
    if (/\/(search|city|promo|blog)\//.test(path)) return false;

    const isDetail = /\/(detail|hotels?|activity|event|experience)\//.test(path);
    const segments = path.split('/').filter(Boolean);
    const hasProductSlug = segments.length >= 2 && /\d+/.test(path);

    return isDetail || hasProductSlug;
  } catch {
    return false;
  }
}

function extractKlookRooms() {
  let defaultCurrency = 'EUR';
  let roomOptions = [];

  const nextDataScript = document.getElementById('__NEXT_DATA__');
  if (nextDataScript) {
    try {
      const nextJson = JSON.parse(nextDataScript.textContent);
      const rawText = nextDataScript.textContent;
      const pageProps = nextJson.props?.pageProps || {};

      const currMatch = rawText.match(/"currency(?:_code|Code)?":\s*"([A-Z]{3})"/i);
      if (currMatch) defaultCurrency = currMatch[1].toUpperCase();

      const rawRoomList =
        pageProps.initialState?.hotelDetails?.roomList ||
        pageProps.initialState?.hotel?.roomList ||
        pageProps.roomList ||
        pageProps.hotelDetail?.roomList ||
        pageProps.initialState?.hotelDetails?.roomTypes ||
        pageProps.initialState?.hotelDetails?.hotelRoomList ||
        [];

      if (Array.isArray(rawRoomList) && rawRoomList.length > 0) {
        rawRoomList.forEach(room => {
          const roomName = room.roomName || room.name || room.title || room.roomTypeName || 'Habitación Klook';
          const plans = room.ratePlans || room.packages || room.plans || [room];

          plans.forEach(plan => {
            const priceVal = plan.salePrice || plan.price || plan.lowestPrice || plan.amount || room.lowestPrice || 0;
            const rateCode = plan.ratePlanId || plan.rateCode || plan.planId || plan.code || plan.id || room.roomId || null;
            const bedType = plan.bedType || plan.bedInfo || room.bedType || '1 Cama King';
            const hasBreakfast = plan.breakfastInfo?.includes('Desayuno') || plan.hasBreakfast || (plan.breakfastCount > 0);

            if (priceVal && priceVal > 0) {
              roomOptions.push({
                rate_code: rateCode ? String(rateCode) : null,
                room_name: roomName,
                bed_type: bedType,
                has_breakfast: !!hasBreakfast,
                price: parseFloat(priceVal),
                currency: defaultCurrency,
              });
            }
          });
        });
      }
    } catch {}
  }

  const roomContainers = document.querySelectorAll(
    'div[class*="room"], div[class*="Room"], div[class*="package"], div[class*="Package"], div[class*="rate"], div[class*="Rate"]'
  );

  if (roomContainers.length > 0) {
    let currentRoomName = "Habitación Klook";
    let currentBedType = "1 Cama King";

    roomContainers.forEach(container => {
      const text = container.innerText || '';

      if (/Habitación|Room|Suite/i.test(text)) {
        const titleMatch = text.match(/(Habitación[^\n\r]*|Room[^\n\r]*|Suite[^\n\r]*)/i);
        if (titleMatch && titleMatch[1].length < 60) {
          currentRoomName = titleMatch[1].trim();
        }
      }

      if (text.includes('2 camas')) currentBedType = '2 Camas Dobles';
      else if (/king|matrimonio/i.test(text)) currentBedType = '1 Cama King';

      const priceMatches = text.match(/(?:€|EUR|\$)\s*([\d.,]+)/gi);
      const codeMatch = text.match(/\b([A-Z0-9]{8})\b/);

      if (priceMatches) {
        priceMatches.forEach(pm => {
          const parsed = parsePriceAndCurrency(pm);
          if (parsed && parsed.price > MIN_PRICE_THRESHOLD) {
            const exists = roomOptions.some(ro => ro.price === parsed.price && ro.room_name === currentRoomName);
            if (!exists) {
              roomOptions.push({
                rate_code: codeMatch ? codeMatch[1] : null,
                room_name: currentRoomName,
                bed_type: currentBedType,
                has_breakfast: text.toLowerCase().includes('desayuno incluido'),
                price: parsed.price,
                currency: parsed.currency || defaultCurrency,
              });
            }
          }
        });
      }
    });
  }

  roomOptions.sort((a, b) => a.price - b.price);
  return { rooms: roomOptions, defaultCurrency };
}

function extractKlookData() {
  const url = window.location.href;
  if (!isKlookDetailPage(url)) return null;

  const urlObj = new URL(url);
  const pathParts = urlObj.pathname.split('/').filter(Boolean);

  let productId = 'klook_item';
  const detailIdx = pathParts.findIndex(p => /^(activity|detail|hotels?)$/.test(p));
  if (detailIdx !== -1 && pathParts[detailIdx + 1]) {
    productId = pathParts[detailIdx + 1];
  } else if (pathParts.length > 0) {
    productId = pathParts[pathParts.length - 1];
  }

  let hotelName = document.querySelector('h1')?.innerText?.trim()
    || document.querySelector('[class*="title"]')?.innerText?.trim()
    || document.title.split('|')[0].split('-')[0].trim();

  if (!hotelName || hotelName.length < 2) {
    hotelName = "Alojamiento Klook";
  }

  const { rooms, defaultCurrency } = extractKlookRooms();

  let salePrice = rooms.length > 0 ? rooms[0].price : null;
  let currency = defaultCurrency;

  const selectors = [
    '.hotel-price .amount',
    '[class*="price-amount"]',
    '[class*="price_amount"]',
    '[class*="sale-price"]',
    '[class*="lowestPrice"]',
    '.price_box .amount',
    '.amount',
    '.price'
  ];

  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el && el.innerText) {
      const parsed = parsePriceAndCurrency(el.innerText);
      if (parsed && parsed.price > 10) {
        salePrice = parsed.price;
        currency = parsed.currency || currency;
        break;
      }
    }
  }

  if (!salePrice) {
    const priceParam = urlObj.searchParams.get('lowest_amount') || urlObj.searchParams.get('amount') || urlObj.searchParams.get('price');
    if (priceParam) {
      const parsed = parseFloat(priceParam);
      if (!isNaN(parsed) && parsed > 0) salePrice = parsed;
    }
  }

  if (!salePrice) salePrice = 100;

  return {
    productId,
    currentPrice: salePrice,
    currency,
    pageUrl: url,
    hotel_name: hotelName,
    room_options: rooms,
  };
}

// ══════════════════════════════════════════════
//  UI — BANNER RENDERING
// ══════════════════════════════════════════════

const BANNER_ID = 'rf-reactive-banner';

function hideBanner() {
  const existing = document.getElementById(BANNER_ID);
  if (existing) existing.remove();
}

function createBaseBanner() {
  const banner = document.createElement('div');
  banner.id = BANNER_ID;
  Object.assign(banner.style, {
    position: 'fixed',
    top: '20px',
    right: '20px',
    backgroundColor: '#ffffff',
    color: '#333',
    padding: '16px',
    zIndex: '2147483647',
    borderRadius: '12px',
    boxShadow: '0 10px 30px rgba(0,0,0,0.22)',
    fontFamily: 'Inter, Arial, sans-serif',
    width: '360px',
    maxHeight: '85vh',
    overflowY: 'auto',
    border: '1px solid #e2e8f0',
  });
  return banner;
}

function showAffiliateSuccessBanner(hotelName = '') {
  hideBanner();
  const banner = createBaseBanner();
  banner.style.backgroundColor = '#F0FDF4';
  banner.style.border = '2px solid #10B981';
  banner.style.boxShadow = '0 10px 30px rgba(16, 185, 129, 0.2)';

  const nameText = hotelName || document.querySelector('h1')?.innerText?.trim() || 'Alojamiento';

  banner.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
      <div style="display:flex; align-items:center; gap:6px;">
        <span style="font-size: 18px;">🛡️</span>
        <span style="font-weight: 800; font-size: 14.5px; color: #065F46;">Hotel<span style="color:#10B981;">Finder</span> VIP</span>
      </div>
      <button id="rf-close-success-banner" style="background: none; border: none; color: #94A3B8; cursor: pointer; font-size: 20px;">&times;</button>
    </div>
    <div style="background: #FFFFFF; border-radius: 8px; padding: 12px; border: 1px solid #A7F3D0; box-shadow: 0 2px 6px rgba(0,0,0,0.05);">
      <div style="display:flex; align-items:center; gap:6px; margin-bottom:4px;">
        <span style="font-size:14px;">✅</span>
        <p style="margin: 0; font-weight: 800; color: #065F46; font-size: 13px;">¡Ya estás usando HotelFinder!</p>
      </div>
      <p style="margin: 0 0 6px 0; font-size: 12px; font-weight: 700; color: #0F172A;">${nameText}</p>
      <p style="margin: 0; font-size: 11.5px; color: #047857; line-height: 1.4;">
        Estás navegando con la <strong>Tarifa Oficial Protegida</strong> y tus <strong>créditos acumulables</strong> vinculados a esta sesión. Completa tu reserva normalmente en esta pestaña.
      </p>
    </div>
  `;

  document.body.appendChild(banner);
  document.getElementById('rf-close-success-banner').addEventListener('click', hideBanner);
}

function showKlookCashbackBanner(discountData, requestData) {
  hideBanner();
  const banner = createBaseBanner();
  const curr = discountData.currency || requestData.currency || 'EUR';
  const rooms = requestData.room_options || [];
  const totalPrice = discountData.originalPrice || requestData.currentPrice || 100;
  const cashbackVal = discountData.cashbackAmount || Math.max(0.50, Math.round((totalPrice * 0.015) * 100) / 100);
  const cashbackPercentage = discountData.cashbackPercentage || 1.5;
  const baseAffiliateUrl = discountData.affiliateUrl || buildKlookAffiliateUrl(requestData.pageUrl);

  let roomsAccordionHtml = '';
  if (Array.isArray(rooms) && rooms.length > 0) {
    const roomItemsHtml = rooms.map(rm => {
      const rmPrice = rm.price || totalPrice;
      const rmCashback = Math.max(0.50, Math.round((rmPrice * 0.015) * 100) / 100);
      const targetRoomUrl = rm.rate_code
        ? buildKlookAffiliateUrl(`${requestData.pageUrl}#rate_${rm.rate_code}`)
        : baseAffiliateUrl;

      return `
        <div style="background:#FFFFFF; border:1px solid #E2E8F0; border-radius:8px; padding:10px; margin-bottom:8px;">
          <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:4px;">
            <p style="margin:0; font-size:12px; font-weight:700; color:#0F172A;">${rm.room_name}</p>
            <span style="font-weight:800; font-size:13px; color:#10B981;">${formatCurrency(rmPrice, rm.currency || curr)}</span>
          </div>
          <div style="display:flex; gap:6px; align-items:center; margin-bottom:6px;">
            <span style="font-size:10px; background:#F1F5F9; color:#475569; padding:2px 6px; border-radius:4px;">🛏️ ${rm.bed_type}</span>
            ${rm.has_breakfast ? '<span style="font-size:10px; background:#D1FAE5; color:#065F46; padding:2px 6px; border-radius:4px;">☕ Desayuno</span>' : ''}
            <span style="font-size:10px; background:#E0F2FE; color:#0369A1; font-weight:bold; padding:2px 6px; border-radius:4px;">🎁 +${formatCurrency(rmCashback, rm.currency || curr)}</span>
          </div>
          <button class="rf-btn-room-action" data-url="${targetRoomUrl}" style="background:#06B6D4; color:white; border:none; padding:7px 10px; border-radius:6px; font-size:11.5px; font-weight:700; width:100%; cursor:pointer; text-align:center; box-shadow: 0 2px 6px rgba(6,182,212,0.2);">
            💳 Reservar Habitación (${formatCurrency(rmPrice, rm.currency || curr)})
          </button>
        </div>
      `;
    }).join('');

    roomsAccordionHtml = `
      <details open style="margin-bottom:12px; background:#F8FAFC; border:1px solid #CBD5E1; border-radius:8px; padding:8px;">
        <summary style="font-weight:700; font-size:12px; color:#0F172A; cursor:pointer; list-style:none; display:flex; justify-content:space-between; align-items:center;">
          <span>📋 Opciones de Habitación Disponibles (${rooms.length})</span>
          <span style="color:#06B6D4; font-size:14px;">▼</span>
        </summary>
        <div style="margin-top:10px; max-height:240px; overflow-y:auto; padding-right:4px;">
          ${roomItemsHtml}
        </div>
      </details>
    `;
  }

  banner.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
      <span style="font-weight: 800; font-size: 15px; color: #0F172A;">Hotel<span style="color:#06B6D4;">Finder</span></span>
      <button id="rf-close-banner" style="background: none; border: none; color: #94A3B8; cursor: pointer; font-size: 20px;">&times;</button>
    </div>
    <div style="background: #F0F9FF; border: 1px solid #BAE6FD; border-radius: 6px; padding: 8px 10px; margin-bottom: 10px;">
      <span style="font-weight: 700; color: #0284C7; font-size: 12.5px;">🎁 ¡Ganas ${formatCurrency(cashbackVal, curr)} (${cashbackPercentage}%) en Créditos!</span>
    </div>
    <div style="margin-bottom: 10px;">
      <p style="margin: 0; font-size: 13px; font-weight: 700; color: #0F172A;">${requestData.hotel_name}</p>
      <p style="margin: 2px 0 0 0; font-size: 11.5px; color: #64748B;">Tarifa oficial: ${formatCurrency(totalPrice, curr)}</p>
    </div>
    <div style="background: #F1F5F9; border-left: 3px solid #06B6D4; padding: 8px 10px; border-radius: 4px; margin-bottom: 12px; font-size: 11px; color: #334155; line-height: 1.35;">
      💡 Reserva con tu enlace oficial para acumular tus <strong>${formatCurrency(cashbackVal, curr)} de créditos HotelFinder</strong> como saldo para tu próximo viaje.
    </div>
    ${roomsAccordionHtml}
    <button id="rf-btn-action" style="background: #10B981; color: white; border: none; padding: 11px 12px; border-radius: 8px; font-weight: 700; display: block; width: 100%; text-align: center; font-size: 13px; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3); cursor: pointer;">
      🔒 Reservar y Acumular ${formatCurrency(cashbackVal, curr)} en Créditos
    </button>
  `;

  document.body.appendChild(banner);
  document.getElementById('rf-close-banner').addEventListener('click', hideBanner);
  document.getElementById('rf-btn-action').addEventListener('click', () => {
    activateAndNavigate(baseAffiliateUrl);
  });

  banner.querySelectorAll('.rf-btn-room-action').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const targetUrl = btn.getAttribute('data-url');
      if (targetUrl) activateAndNavigate(targetUrl);
    });
  });
}

/**
 * Shows an informative banner on other providers (Booking.com, Expedia)
 * explaining that rewards are currently active exclusively on our partner Klook.
 */
function showOtherProviderGuidanceBanner(providerName = 'Booking.com') {
  hideBanner();
  const banner = createBaseBanner();
  const klookUrl = buildKlookAffiliateUrl('https://www.klook.com/es/hotels/');

  banner.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
      <span style="font-weight: 800; font-size: 15px; color: #0F172A;">Hotel<span style="color:#06B6D4;">Finder</span></span>
      <button id="rf-close-banner" style="background: none; border: none; color: #94A3B8; cursor: pointer; font-size: 20px;">&times;</button>
    </div>
    <div style="background: #FEF3C7; border: 1px solid #FDE68A; border-radius: 6px; padding: 8px 10px; margin-bottom: 10px;">
      <span style="font-weight: 700; color: #92400E; font-size: 12px;">⏳ Próximamente en ${providerName}</span>
    </div>
    <p style="margin: 0 0 8px 0; font-size: 12.5px; font-weight: 700; color: #0F172A;">¡Acumula Créditos en tus Hoteles!</p>
    <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 6px; padding: 10px; margin-bottom: 12px; font-size: 11.5px; color: #475569; line-height: 1.4;">
      Estamos trabajando para habilitar la acumulación en <strong>${providerName}</strong>. Actualmente nuestro programa de <strong>reembolso y créditos de lealtad (+1.5%)</strong> está activo al 100% en nuestro socio oficial <strong>Klook</strong>.
    </div>
    <button id="rf-btn-go-klook" style="background: #06B6D4; color: white; border: none; padding: 11px 12px; border-radius: 8px; font-weight: 700; display: block; width: 100%; text-align: center; font-size: 12.5px; box-shadow: 0 4px 12px rgba(6, 182, 212, 0.3); cursor: pointer;">
      🏨 Buscar en Klook y Ganar Créditos &rarr;
    </button>
  `;

  document.body.appendChild(banner);
  document.getElementById('rf-close-banner').addEventListener('click', hideBanner);
  document.getElementById('rf-btn-go-klook').addEventListener('click', () => {
    window.open(klookUrl, '_blank');
  });
}

function scrollToSelectedRoom() {
  const hash = window.location.hash;
  if (!hash) return;

  const targetCode = hash.replace('#rate_', '').replace('#room_', '').trim();
  if (!targetCode) return;

  setTimeout(() => {
    const allElements = document.querySelectorAll('div, section, tr, [class*="room"], [class*="package"]');
    for (const el of allElements) {
      if (el.innerText && el.innerText.includes(targetCode)) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.style.transition = 'all 0.5s ease';
        el.style.boxShadow = '0 0 15px rgba(16, 185, 129, 0.8)';
        el.style.border = '2px solid #10B981';
        break;
      }
    }
  }, 1200);
}

const handleDOMChange = debounce(async (forceSearch = false) => {
  if (isSearching) return;

  const currentUrl = window.location.href;

  // Case 1: Active Klook Affiliate session
  if (currentUrl.includes('klook.com') && checkIsAffiliateActive()) {
    const hotelName = document.querySelector('h1')?.innerText?.trim() || 'Alojamiento';
    showAffiliateSuccessBanner(hotelName);
    scrollToSelectedRoom();
    return;
  }

  // Case 2: Other provider (Booking.com / Expedia) -> Show partner guidance banner
  if (currentUrl.includes('booking.com') || currentUrl.includes('expedia.com')) {
    const provider = currentUrl.includes('booking.com') ? 'Booking.com' : 'Expedia';
    showOtherProviderGuidanceBanner(provider);
    return;
  }

  // Case 3: Klook detail page -> Scan and show rates/credits
  try {
    const isKlook = currentUrl.includes('klook.com');
    if (!isKlook) {
      hideBanner();
      return;
    }

    const data = extractKlookData();
    if (!data) {
      hideBanner();
      return;
    }

    const currentStr = JSON.stringify(data);
    if (!forceSearch && currentStr === lastScannedStr) return;

    lastScannedStr = currentStr;
    isSearching = true;

    chrome.runtime.sendMessage({ action: 'CHECK_KLOOK_DISCOUNT', data }, (response) => {
      isSearching = false;

      if (chrome.runtime.lastError || !response) {
        hideBanner();
        return;
      }

      latestScanResult = { reqDataUi: data, discountData: response };

      if (chrome.storage?.local) {
        chrome.storage.local.set({ lastHotelData: latestScanResult });
      }

      showKlookCashbackBanner(response, data);
    });
  } catch (err) {
    console.error('HotelFinder Error:', err);
    isSearching = false;
    hideBanner();
  }
}, DEBOUNCE_DELAY);

function startMutationObserver() {
  const observer = new MutationObserver((mutations) => {
    const hasRelevantChange = mutations.some(m => {
      const target = m.target;
      if (target.id === BANNER_ID || target.closest?.(`#${BANNER_ID}`)) return false;
      return m.type === 'childList' && m.addedNodes.length > 0;
    });

    if (hasRelevantChange) {
      handleDOMChange();
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'GET_HOTEL_DATA') {
    sendResponse({ data: latestScanResult });
  }
});

if (document.readyState === "complete" || document.readyState === "interactive") {
  setTimeout(() => {
    handleDOMChange(true);
    startMutationObserver();
  }, INITIAL_SCAN_DELAY);
} else {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
      handleDOMChange(true);
      startMutationObserver();
    }, INITIAL_SCAN_DELAY);
  });
}

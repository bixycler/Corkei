
// Messages buffering system
const messages = [];
function log(level, ...args) {
  // For UI, we use a simple text representation to avoid circular reference errors
  const safeText = args.map(a => {
    if (typeof a === 'object' && a !== null) {
      try {
        // Just a brief summary for the UI to avoid deep recursion/circular refs
        return `[Object ${a.constructor?.name || ''}]`;
      } catch (e) {
        return '[Object]';
      }
    }
    return String(a);
  }).join(' ');

  const msg = { level, text: safeText };
  messages.push(msg);
  updateMessagesUI();

  // Real logging with RAW objects for console debugging
  if (level === 'info') console.info(...args);
  else if (level === 'warn') console.warn(...args);
  else if (level === 'error') console.error(...args);
  else console.debug(...args);
}

const uiConsole = {
  debug: (...args) => log('debug', ...args),
  info: (...args) => log('info', ...args),
  warn: (...args) => log('warn', ...args),
  error: (...args) => log('error', ...args)
};

function updateMessagesUI() {
  const root = document.getElementById('messages-root');
  if (!root) return;

  // Only show if there are INFO+ messages
  const filtered = messages.filter(m => m.level !== 'debug');
  if (filtered.length === 0) {
    root.style.display = 'none';
    return;
  }

  root.style.display = 'block';
  root.innerHTML = '';

  filtered.forEach((msg, idx) => {
    const group = document.createElement('div');
    group.className = `msg-group msg-${msg.level}`;

    const header = document.createElement('div');
    header.className = 'msg-header';
    header.innerHTML = `<span>[${msg.level.toUpperCase()}] Message #${idx + 1}</span><span class="arrow"></span>`;

    const content = document.createElement('div');
    content.className = 'msg-content';
    content.textContent = msg.text;

    // INFO should be folded, WARNING+ open
    if (msg.level === 'info') {
      content.classList.add('folded');
      header.classList.add('folded');
    }

    header.onclick = () => {
      content.classList.toggle('folded');
      header.classList.toggle('folded');
    };

    group.appendChild(header);
    group.appendChild(content);
    root.appendChild(group);
  });
}

async function main() {
  const jsontxt = document.getElementById('jsontxt');
  const guiRoot = document.getElementById('gui-root');

  let TravelportResponse;
  try {
    const response = await fetch('test.json');
    TravelportResponse = await response.json();
    jsontxt.value = JSON.stringify(TravelportResponse, null, 2);
  } catch (e) {
    console.error("Failed to load test.json", e);
    jsontxt.placeholder = "Failed to load test.json. Please paste JSON here.";
    return;
  }

  render(TravelportResponse);

  jsontxt.addEventListener('input', () => {
    messages.length = 0; // Clear messages on new input
    try {
      const data = JSON.parse(jsontxt.value);
      render(data);
    } catch (e) {
      // Silently wait for valid JSON
    }
  });
}

function render(TravelportResponse) {
  const guiRoot = document.getElementById('gui-root');
  guiRoot.innerHTML = '';

  if (!TravelportResponse?.CatalogProductOfferingsResponse?.CatalogProductOfferings?.CatalogProductOffering) {
    guiRoot.innerHTML = '<div class="error-box">Invalid Travelport JSON structure.</div>';
    return;
  }

  // Global variables for console debug 
  // Travelport JSON tree: offer > option > product
  window.TravelportOffers = TravelportResponse.CatalogProductOfferingsResponse.CatalogProductOfferings.CatalogProductOffering;

  // Reference Maps
  const ReferenceList = TravelportResponse.CatalogProductOfferingsResponse.ReferenceList || [];
  const FlightMap = {};
  ReferenceList.forEach(list => {
    if (list['@type'] === 'ReferenceListFlight') {
      list.Flight.forEach(f => FlightMap[f.id] = f);
    }
  });

  // Combo index tree: offer-combo > option > price-combo > combo / leg (segment) / product
  window.TravelportOfferCombos = []; // Combo collection: root nodes are offer combos, limited by offersPerPage
  window.TravelportPriceCombos = {}; // Price combos indexed by CombinabilityCode set
  window.TravelportCombos = {}; // Combos (lines of products through all legs), indexed by individual CombinabilityCode
  window.TravelportProducts = {}; // The smallest unit, leaf nodes in combo index tree

  // Build Combo index tree from Travelport JSON tree (TravelportOffers)
  // Combo index tree: offer-combo > option > price-combo > combo / leg (segment) / product
  for (let offer of window.TravelportOffers) {
    let legSequence = offer.sequence;
    if (legSequence === 1) {
      let offerCombo = { id: 'opl:' + offer.id, legs: [], options: [] };
      window.TravelportOfferCombos.push(offerCombo);
    }

    // offer.ProductBrandOptions can be an array or an object
    const options = Array.isArray(offer.ProductBrandOptions) ? offer.ProductBrandOptions : Object.values(offer.ProductBrandOptions);

    for (let optid in offer.ProductBrandOptions) {
      let opt = offer.ProductBrandOptions[optid];
      opt.offer = offer; // uplink

      const offerings = Array.isArray(opt.ProductBrandOffering) ? opt.ProductBrandOffering : Object.values(opt.ProductBrandOffering);

      for (let product of offerings) {
        product.option = opt; // uplink
        //uiConsole.debug(product); 
        let pid = product.Product[0].productRef;
        if (product.Product.length > 1) {
          uiConsole.info('Product has more than 1 ID:', product.Product);
        }
        window.TravelportProducts[pid] = product;

        // Clean up irrelavent fields for clarity in console debug
        delete offer['@type'];
        delete opt['@type'];
        delete product['@type'];
        delete product.BestCombinablePrice['@type']; // also for TotalPrice
        if (product.BestCombinablePrice.TotalPrice?.['@type']) delete product.BestCombinablePrice.TotalPrice['@type'];
        delete product['TermsAndConditions'];

        // Handle prices
        let ccs = product.CombinabilityCode;
        let pcc = ccs.join(' '), price = product.BestCombinablePrice.TotalPrice;
        let priceCombo = null;
        if (!(pcc in window.TravelportPriceCombos)) { // new priceCombo
          priceCombo = {
            price: price,
            currency: product.BestCombinablePrice.CurrencyCode.value || product.BestCombinablePrice.CurrencyCode,
            BestCombinablePrice: product.BestCombinablePrice,
            CombinabilityCode: ccs,
            priceCC: pcc, // up index
            offerCombo: null, // uplink
            combos: []
          };
          window.TravelportPriceCombos[pcc] = priceCombo;
          // Add this new priceCombo to TravelportOfferCombos
          if (legSequence === 1) {
            // Combo collection: offer-combo > option > price-combo > combo
            let offerCombo = window.TravelportOfferCombos.at(-1);
            let oid = product.ContentSource === 'NDC' ? optid : 0;
            let optionGroup = offerCombo.options[oid] ?? (offerCombo.options[oid] = []);
            optionGroup.push(priceCombo);
            uiConsole.debug('New offerCombo:', offerCombo, `at opt[${oid}]/product[${pid}]`, product);
          }
        } else { // Check this price against existing priceCombo
          priceCombo = window.TravelportPriceCombos[pcc];
          if (price !== priceCombo.price) {
            uiConsole.error(`Different TotalPrice for pcc = ${pcc}: `, `product = ${price}`, ccs, ` <> combo = ${priceCombo.price}`, priceCombo.CombinabilityCode);
          }
          if (JSON.stringify(product.BestCombinablePrice) !== JSON.stringify(priceCombo.BestCombinablePrice)) {
            uiConsole.info(`Different BestCombinablePrice for pcc = ${pcc}: `, 'product = ', product.BestCombinablePrice, ' <> combo =', priceCombo.BestCombinablePrice);
          }
        }
        // Process combos by CombinabilityCode (cc)
        for (let cc of ccs) {
          // Rectangular prism of priceCombo: combo / leg (segment) / product
          let combo = null;
          if (!(cc in window.TravelportCombos)) { // new combo
            combo = {
              priceCombos: [priceCombo], // uplink
              BestCombinablePrice: product.BestCombinablePrice,
              CombinabilityCode: ccs,
              cc: cc,
              legs: []
            }
            window.TravelportCombos[cc] = combo;
          } else { // Check this combo against existing combo
            combo = window.TravelportCombos[cc];
            if (combo.priceCombos.length > 0 && price !== combo.priceCombos[0].price) {
              uiConsole.error(`Different TotalPrice for cc = ${cc}: `, `product = ${price}`, ccs, ` <> combo = ${combo.priceCombos[0].price}`, combo.priceCombos[0].CombinabilityCode);
            }
            if (!combo.priceCombos.includes(priceCombo)) combo.priceCombos.push(priceCombo);
            if (JSON.stringify(product.BestCombinablePrice) !== JSON.stringify(combo.BestCombinablePrice)) {
              uiConsole.info(`Different BestCombinablePrice for cc = ${cc}: `, 'product = ', product.BestCombinablePrice, ' <> combo =', combo.BestCombinablePrice);
            }
          }
          let leg = combo.legs[legSequence - 1] ?? (combo.legs[legSequence - 1] = []);
          leg.push(product);
        }
      }
    }
  }

  // Postprocessing 1: link priceCombos with combos
  for (let priceCombo of Object.values(window.TravelportPriceCombos)) {
    for (let cc of priceCombo.CombinabilityCode) {
      let combo = window.TravelportCombos[cc];
      if (combo) {
        if (!priceCombo.combos.includes(combo)) priceCombo.combos.push(combo);
        if (!combo.priceCombos.includes(priceCombo)) combo.priceCombos.push(priceCombo);
      } else {
        uiConsole.error(`Combo ${cc} not found for priceCombo`, priceCombo);
      }
    }
  }
  // Postprocessing 2: link offerCombo with priceCombos and offers
  for (let offerCombo of window.TravelportOfferCombos) {
    for (let optionGroup of offerCombo.options) {
      if (!optionGroup) continue;
      for (let priceCombo of optionGroup) {
        priceCombo.offerCombo = offerCombo;
        for (let combo of priceCombo.combos) {
          for (let legi in combo.legs) {
            let leg = combo.legs[legi];
            if (leg.length < 1) {
              uiConsole.warn(`Empty leg #${parseInt(legi) + 1} in combo ${combo.cc}`, combo);
              continue;
            }
            let legOffer = null;
            for (let product of leg) {
              if (!legOffer) legOffer = product.option.offer;
              else if (product.option.offer !== legOffer) {
                uiConsole.error(`Different offers for the same leg #${parseInt(legi) + 1}: `, legOffer, product.option.offer);
              }
            }
            if (legOffer && !offerCombo.legs.includes(legOffer)) {
              offerCombo.legs[legi] = legOffer; // Use legi as index to maintain sequence
              let lopl = legOffer.offerCombo ?? (legOffer.offerCombo = []);
              if (!lopl.includes(offerCombo)) lopl.push(offerCombo);
            }
          }
        }
      }
    }
  }

  // Helper to get leg description
  const getLegDesc = (offer) => {
    let desc = `${offer.Departure} → ${offer.Arrival}`;
    const options = Array.isArray(offer.ProductBrandOptions) ? offer.ProductBrandOptions : Object.values(offer.ProductBrandOptions);
    const firstOpt = options[0];
    if (firstOpt && firstOpt.flightRefs) {
      const flights = firstOpt.flightRefs.map(ref => FlightMap[ref]).filter(f => !!f);
      if (flights.length > 0) {
        const segments = flights.map(f => `${f.carrier}${f.number}`).join(' → ');
        desc += `<br><span class="segments">${segments}</span>`;
        if (flights.length > 1) {
          desc += `<br><span class="transits">${flights.length - 1} transit(s)</span>`;
        }
      }
    }
    return desc;
  };

  // UI Rendering
  window.TravelportOfferCombos.forEach((offerCombo, idx) => {
    // Offer combo = outmost group
    const offerContent = createFoldableGroup(`Offer Combo #${idx + 1} (${offerCombo.id})`, guiRoot, false);

    offerCombo.options.forEach((optionGroup, optIdx) => {
      if (!optionGroup) return;
      // Option = group
      const optContent = createFoldableGroup(`Option #${optIdx}`, offerContent, true);

      optionGroup.forEach(priceCombo => {
        // Price combo = table
        const pccContent = createFoldableGroup(`Price Combo: ${priceCombo.price} ${priceCombo.currency} (CC: ${priceCombo.priceCC})`, optContent, true);

        const table = document.createElement('table');
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        headerRow.innerHTML = '<th>Combo CC</th>';

        // Leg = column
        const maxLegs = offerCombo.legs.length;
        for (let i = 0; i < maxLegs; i++) {
          const th = document.createElement('th');
          const legOffer = offerCombo.legs[i];
          th.innerHTML = `Leg ${i + 1}<br><small>${legOffer ? getLegDesc(legOffer) : 'N/A'}</small>`;
          headerRow.appendChild(th);
        }
        thead.appendChild(headerRow);
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        priceCombo.combos.forEach(combo => {
          // Combo = row
          const row = document.createElement('tr');
          row.innerHTML = `<td>${combo.cc}</td>`;

          for (let i = 0; i < maxLegs; i++) {
            const td = document.createElement('td');
            const products = combo.legs[i] || [];
            if (products.length > 0) {
              // Products = entries in cell
              const ul = document.createElement('ul');
              ul.className = 'product-list';
              products.forEach(p => {
                const li = document.createElement('li');
                li.className = 'product-item';
                const brand = p.Brand?.BrandRef || p.Brand?.BrandReference || 'N/A';
                li.innerHTML = `<b>Brand: ${brand}</b><br><small>${p.Product[0].productRef}</small>`;
                ul.appendChild(li);
              });
              td.appendChild(ul);
            }
            row.appendChild(td);
          }
          tbody.appendChild(row);
        });
        table.appendChild(tbody);
        pccContent.appendChild(table);
      });
    });
  });
}

function createFoldableGroup(title, parent, foldedByDefault = true) {
  const group = document.createElement('div');
  group.className = 'group';

  const header = document.createElement('div');
  header.className = 'group-header';
  header.innerHTML = `<span>${title}</span><span class="arrow"></span>`;

  const content = document.createElement('div');
  content.className = 'group-content';
  if (foldedByDefault) {
    content.classList.add('folded');
    header.classList.add('folded');
  }

  header.onclick = () => {
    content.classList.toggle('folded');
    header.classList.toggle('folded');
  };

  group.appendChild(header);
  group.appendChild(content);
  parent.appendChild(group);
  return content;
}

main();

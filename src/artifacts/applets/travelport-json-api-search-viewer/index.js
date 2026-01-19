

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

function updateFileStatus(name) {
  const el = document.getElementById('file-status');
  if (el) el.textContent = name ? `Current File: ${name}` : '';
}

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

  const mainGroup = createFoldableGroup('System Messages', root, true);

  for (const [idx, msg] of filtered.entries()) {
    const group = document.createElement('div');
    group.className = `msg-group msg-${msg.level}`;

    const header = document.createElement('div');
    header.className = 'msg-header';
    header.innerHTML = `<span>[${msg.level.toUpperCase()}] Message #${Number(idx) + 1}</span><span class="arrow"></span>`;

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
    mainGroup.appendChild(group);
  }
}

function formatNumber(val) {
  return new Intl.NumberFormat().format(val);
}

function ellipsizeCC(cc) {
  if (cc.length > 23) {
    return cc.substring(0, 10) + '...' + cc.substring(cc.length - 10);
  }
  return cc;
}

async function main() {
  const fileInput = document.getElementById('json-file');
  // Load default test.json if available
  try {
    const response = await fetch('test.json');
    if (response.ok) {
      const data = await response.json();
      updateFileStatus('test.json');
      render(data);
    } else {
      console.debug(`Optional test.json not found (Status: ${response.status})`);
    }
  } catch (e) {
    console.debug("Optional test.json loading failed:", e);
  }

  fileInput.addEventListener('change', (e) => {
    const target = e.target;
    const file = target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        messages.length = 0; // Clear messages on new file
        updateFileStatus(file.name);
        const result = event.target?.result;
        if (typeof result === 'string') {
          const data = JSON.parse(result);
          render(data);
        }
      } catch (err) {
        uiConsole.error("Failed to parse JSON file:", err);
      }
    };
    reader.readAsText(file);
  });
}

function render(response) {
  const guiRoot = document.getElementById('gui-root');
  guiRoot.innerHTML = '';

  if (!response?.CatalogProductOfferingsResponse?.CatalogProductOfferings?.CatalogProductOffering) {
    uiConsole.error('Invalid Travelport JSON structure.');
    guiRoot.innerHTML = '<div class="error-box">Invalid Travelport JSON structure.</div>';
    return;
  }

  // Global variables for console debug 
  window.TravelportResponse = JSON.parse(JSON.stringify(response)); // Clone the original response

  // Travelport JSON tree: offer > option > product
  window.TravelportOffers = response.CatalogProductOfferingsResponse.CatalogProductOfferings.CatalogProductOffering;

  // Combo index tree: offer-combo > option > price-combo > combo / leg (segment) / product
  window.TravelportOfferCombos = []; // Combo collection: root nodes are offer combos, limited by offersPerPage
  window.TravelportPriceCombos = {}; // Price combos indexed by CombinabilityCode set
  window.TravelportCombos = {}; // Combos (lines of products through all legs), indexed by individual CombinabilityCode
  window.TravelportProducts = {}; // The smallest unit, leaf nodes in combo index tree

  // Preprocessing: Add `position` and prepend it to `id` for offers
  for (let [oi, offer] of window.TravelportOffers.entries()) {
    offer.position = oi + 1;
    offer.id = `${offer.position}:${offer.id}`;
  }

  // Build Combo index tree from Travelport JSON tree (TravelportOffers)
  // Combo index tree: offer-combo > option > price-combo > combo / leg (segment) / product
  for (let offer of window.TravelportOffers) {
    if (!offer.ProductBrandOptions) {
      uiConsole.warn('Skipping offer without ProductBrandOptions:', offer);
      offer.skip = true;
      continue;
    }
    let legSequence = offer.sequence;
    if (legSequence === 1) {
      let oci = window.TravelportOfferCombos.length + 1;
      let offerCombo = { position: oci, id: `oc${oci}:${offer.id}`, legs: [], options: [], ContentSource: null };
      window.TravelportOfferCombos.push(offerCombo);
    }

    for (let [optid, opt] of offer.ProductBrandOptions.entries()) {
      opt.offer = offer; // uplink

      const offerings = Array.isArray(opt.ProductBrandOffering) ? opt.ProductBrandOffering : Object.values(opt.ProductBrandOffering);

      for (let [pi, product] of offerings.entries()) {
        product.option = opt; // uplink

        let pid = product.Product[0].productRef;
        if (product.Product.length > 1) {
          uiConsole.info('Product has more than 1 ID:', product.Product);
        }
        product.position = `${offer.position}:${optid + 1}:${pi + 1}`;
        product.id = `${product.position}:${pid}`;
        window.TravelportProducts[product.id] = product;

        // Clean up irrelavent fields for clarity in console debug
        delete offer['@type'];
        delete opt['@type'];
        delete product['@type'];
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
            combos: [],
            totalComboCount: 0
          };
          window.TravelportPriceCombos[pcc] = priceCombo;
          uiConsole.debug('New priceCombo:', priceCombo, `at product[${pid}]`, product);
        } else { // Check this price against existing priceCombo
          priceCombo = window.TravelportPriceCombos[pcc];
          if (price !== priceCombo.price) {
            uiConsole.error(`Different TotalPrice for pcc = ${pcc}: `, `product = ${price}`, ccs, ` <> combo = ${priceCombo.price}`, priceCombo.CombinabilityCode);
          }
          if (JSON.stringify(product.BestCombinablePrice) !== JSON.stringify(priceCombo.BestCombinablePrice)) {
            uiConsole.info(`Different BestCombinablePrice for pcc = ${pcc}: `, 'product = ', product.BestCombinablePrice, ' <> combo =', priceCombo.BestCombinablePrice);
          }
        }
        // Add this priceCombo to TravelportOfferCombos
        // Note: This might not be a new priceCombo, because 1st leg might come after other legs
        if (legSequence === 1) {
          // Combo collection: offer-combo > option > price-combo > combo
          let offerCombo = window.TravelportOfferCombos.at(-1);
          if (!offerCombo.ContentSource) offerCombo.ContentSource = product.ContentSource;
          let oid = product.ContentSource === 'NDC' ? optid : 0;
          let optionGroup = offerCombo.options[oid] ?? (offerCombo.options[oid] = []);
          if (!optionGroup.includes(priceCombo)) optionGroup.push(priceCombo);
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
              legs: [],
              comboCount: 0
            }
            window.TravelportCombos[cc] = combo;
          } else { // Check this combo against existing combo
            combo = window.TravelportCombos[cc];
            if (!combo.priceCombos.includes(priceCombo)) combo.priceCombos.push(priceCombo);
            if (combo.priceCombos.length > 1 && price !== combo.priceCombos[0].price) {
              uiConsole.error(`Different TotalPrice for cc = ${cc}: `, `product = ${price}`, ccs, ` <> combo = ${combo.priceCombos[0].price}`, combo.priceCombos[0].CombinabilityCode);
            }
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

  // Postprocessing 1: link priceCombos with combos and calculate combo counts
  for (let combo of Object.values(window.TravelportCombos)) {
    // comboCount = product of product counts per leg
    combo.comboCount = combo.legs.reduce((acc, leg) => acc * (leg ? leg.length : 0), 1);
  }
  for (let priceCombo of Object.values(window.TravelportPriceCombos)) {
    for (let cc of priceCombo.CombinabilityCode) {
      let combo = window.TravelportCombos[cc];
      if (combo) {
        if (!priceCombo.combos.includes(combo)) {
          priceCombo.combos.push(combo);
          priceCombo.totalComboCount += combo.comboCount; // sum of combo counts
        }
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
        priceCombo.legs = [];
        for (let combo of priceCombo.combos) {
          for (let [legi, leg] of combo.legs.entries()) {
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
            if (legOffer) {
              if (!(legi in offerCombo.legs)) offerCombo.legs[legi] = legOffer;
              else if (Array.isArray(offerCombo.legs[legi])) {
                if (!offerCombo.legs[legi].includes(legOffer)) offerCombo.legs[legi].push(legOffer);
              } else if (offerCombo.legs[legi] !== legOffer) {
                offerCombo.legs[legi] = [offerCombo.legs[legi], legOffer];
              }

              // Also track per-priceCombo legs
              if (!(legi in priceCombo.legs)) priceCombo.legs[legi] = legOffer;
              else if (Array.isArray(priceCombo.legs[legi])) {
                if (!priceCombo.legs[legi].includes(legOffer)) priceCombo.legs[legi].push(legOffer);
              } else if (priceCombo.legs[legi] !== legOffer) {
                priceCombo.legs[legi] = [priceCombo.legs[legi], legOffer];
              }
            }
          }
        }
      }
    }
  }

  // Postprocessing 3: sort PriceCombos by price => PriceCombo.priceCC = priceOrder:PCC
  window.TravelportPrices = Object.entries(window.TravelportPriceCombos).map(([pcc, priceCombo]) => priceCombo);
  window.TravelportPrices.sort((a, b) => a.price - b.price);
  window.TravelportPrices.map((priceCombo, index) => priceCombo.priceCC = `${index + 1}:${priceCombo.priceCC}`);

  // Helper to get leg description from offer(s) to display in table header
  const getLegHeader = (offerOrOffers) => {
    const offers = Array.isArray(offerOrOffers) ? offerOrOffers : [offerOrOffers];
    return offers.map(offer => {
      if (!offer) { return '(N/A)' }
      let desc = `<b>${offer.id}: ${offer.Departure} → ${offer.Arrival}</b>`;
      return desc;
    }).join('<hr style="margin: 5px 0; border: none; border-top: 1px dashed #ccc;">');
  };

  // UI Rendering
  for (const [idx, offerCombo] of window.TravelportOfferCombos.entries()) {
    // Collect all leg offer IDs for the header
    const offerIds = [];
    for (const leg of offerCombo.legs) {
      const offers = Array.isArray(leg) ? leg : [leg];
      for (const o of offers) {
        if (!offerIds.includes(o.id)) offerIds.push(o.id);
      }
    }

    // Offer combo = outmost group
    const isGds = offerCombo.ContentSource === 'GDS';
    const offerContent = createFoldableGroup(`Offer Combo #${Number(idx) + 1} (${offerCombo.id}) [Leg IDs: ${offerIds.join(', ')}]`, guiRoot, false, isGds, 'group-offer');

    for (const [optIdx, optionGroup] of offerCombo.options.entries()) {
      if (!optionGroup) continue;
      // Option = group
      let targetContent = offerContent;
      if (offerCombo.ContentSource !== 'GDS') {
        const isNdc = offerCombo.ContentSource === 'NDC';
        targetContent = createFoldableGroup(`Option #${Number(optIdx) + 1}`, offerContent, false, isNdc); // Default Open, NDC locked
      }

      for (const priceCombo of optionGroup) {
        const table = document.createElement('table');
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        headerRow.innerHTML = '<th>Combo CC<br><small>(Count)</small></th>';

        // Leg = column
        const maxLegs = offerCombo.legs.length;
        for (let i = 0; i < maxLegs; i++) {
          const th = document.createElement('th');
          th.innerHTML = `Leg ${i + 1}<br><small>${getLegHeader(priceCombo.legs[i])}</small>`;
          headerRow.appendChild(th);
        }
        thead.appendChild(headerRow);
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        const drawLines = renderPriceComboOverview(priceCombo, offerCombo.ContentSource === 'NDC', tbody);

        // Price combo = table (Price Combo Group - Default Folded)
        const pccTitle = `<span class="price-highlight">${formatNumber(priceCombo.price)} ${priceCombo.currency}</span> <span class="combo-count">${formatNumber(priceCombo.totalComboCount)} combo(s)</span> (CC: ${ellipsizeCC(priceCombo.priceCC)})`;
        const pccContent = createFoldableGroup(pccTitle, targetContent, true, false, '', drawLines);

        for (const combo of priceCombo.combos) {
          // Combo = row
          const row = document.createElement('tr');
          row.innerHTML = `<td><span class="cc-code" title="${combo.cc}">${combo.cc}</span><br><div style="margin-top: 5px;"></div><span class="combo-count">(${formatNumber(combo.comboCount)})</span></td>`;

          for (let i = 0; i < maxLegs; i++) {
            const td = document.createElement('td');
            const products = combo.legs[i] || [];
            if (products.length > 0) {
              // Products = entries in cell
              const ul = document.createElement('ul');
              ul.className = 'product-list';
              for (const p of products) {
                const li = document.createElement('li');
                li.className = 'product-item';
                // Replace brand with dep -> arv
                const off = p.option.offer;
                li.innerHTML = `<span class="route-info">${off.Departure} → ${off.Arrival}</span><br><small>${p.Product[0].productRef}</small>`;
                ul.appendChild(li);
              }
              td.appendChild(ul);
            }
            row.appendChild(td);
          }
          tbody.appendChild(row);
        }
        table.appendChild(tbody);
        pccContent.appendChild(table);
      }
    }
  }
}

function renderPriceComboOverview(priceCombo, isNdc, tbody) {
  const maxLegs = priceCombo.legs.length;
  const overviewRow = document.createElement('tr');
  overviewRow.className = 'overview-row';

  // First cell for labels (empty or reserved)
  const firstCell = document.createElement('td');
  firstCell.style.border = 'none';
  overviewRow.appendChild(firstCell);

  const dotMaps = []; // Array of maps: legIndex -> { 'position:cc' -> dotElement }

  for (let i = 0; i < maxLegs; i++) {
    const td = document.createElement('td');
    td.className = 'overview-cell';
    overviewRow.appendChild(td);

    const legStack = document.createElement('div');
    legStack.className = 'leg-stack';
    td.appendChild(legStack);

    const dotMap = {};
    dotMaps.push(dotMap);

    // Get the offer(s) for this leg
    const legOffers = Array.isArray(priceCombo.legs[i]) ? priceCombo.legs[i] : [priceCombo.legs[i]];

    // Build complete structure for all offers
    for (const offer of legOffers) {
      const offerBox = document.createElement('div');
      offerBox.className = 'offer-box';
      offerBox.title = `Offer ${offer.id}`;
      legStack.appendChild(offerBox);

      // Create slots for all options
      for (const opt of offer.ProductBrandOptions) {
        const optionBox = document.createElement('div');
        optionBox.className = 'option-box';
        offerBox.appendChild(optionBox);

        // Get products
        const products = Array.isArray(opt.ProductBrandOffering) ? opt.ProductBrandOffering : Object.values(opt.ProductBrandOffering);

        // Create slots for all products
        for (const product of products) {
          const productBox = document.createElement('div');
          productBox.className = 'product-box';
          productBox.title = `Product ${product.id}`;
          optionBox.appendChild(productBox);

          // Add CC dots only if this product is in the current priceCombo
          for (const cc of product.CombinabilityCode) {
            if (priceCombo.CombinabilityCode.includes(cc)) {
              const dot = document.createElement('div');
              dot.className = 'cc-dot';
              dot.title = `CC: ${cc}`;
              productBox.appendChild(dot);

              // Store dot with address: position:cc
              const address = `${product.position}:${cc}`;
              dotMap[address] = dot;
            }
          }
        }
      }
    }
  }

  tbody.appendChild(overviewRow);

  // Return the drawing logic as a callback
  return () => {
    // Check if already drawn
    if (overviewRow.querySelector('svg')) return;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'overview-lines-svg');
    overviewRow.appendChild(svg);

    const rowRect = overviewRow.getBoundingClientRect();
    if (rowRect.width === 0 || rowRect.height === 0) {
      uiConsole.warn('Cannot draw lines: overviewRow has no size. Is it visible?');
      return;
    }

    for (const combo of priceCombo.combos) {
      const cc = combo.cc;

      for (let i = 0; i < maxLegs - 1; i++) {
        const products1 = combo.legs[i] || [];
        const products2 = combo.legs[i + 1] || [];

        if (isNdc) {
          // NDC: one product per leg, draw single line
          if (products1.length > 0 && products2.length > 0) {
            const p1 = products1[0];
            const p2 = products2[0];
            const addr1 = `${p1.position}:${cc}`;
            const addr2 = `${p2.position}:${cc}`;
            const d1 = dotMaps[i][addr1];
            const d2 = dotMaps[i + 1][addr2];
            if (d1 && d2) {
              drawLine(svg, d1, d2, rowRect);
            }
          }
        } else {
          // GDS: m x n segments
          for (const p1 of products1) {
            for (const p2 of products2) {
              const addr1 = `${p1.position}:${cc}`;
              const addr2 = `${p2.position}:${cc}`;
              const d1 = dotMaps[i][addr1];
              const d2 = dotMaps[i + 1][addr2];
              if (d1 && d2) {
                drawLine(svg, d1, d2, rowRect);
              }
            }
          }
        }
      }
    }
  };
}

function drawLine(svg, el1, el2, rowRect) {
  const r1 = el1.getBoundingClientRect();
  const r2 = el2.getBoundingClientRect();

  const x1 = r1.left + r1.width / 2 - rowRect.left;
  const y1 = r1.top + r1.height / 2 - rowRect.top;
  const x2 = r2.left + r2.width / 2 - rowRect.left;
  const y2 = r2.top + r2.height / 2 - rowRect.top;

  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('x1', String(x1));
  line.setAttribute('y1', String(y1));
  line.setAttribute('x2', String(x2));
  line.setAttribute('y2', String(y2));
  line.setAttribute('stroke', '#6f42c1');
  line.setAttribute('stroke-width', '1');
  line.setAttribute('opacity', '0.4');
  svg.appendChild(line);
}

function createFoldableGroup(title, parent, foldedByDefault = true, locked = false, extraClass = '', onUnfold = null) {
  const group = document.createElement('div');
  group.className = 'group' + (extraClass ? ' ' + extraClass : '');

  const header = document.createElement('div');
  header.className = 'group-header';
  header.innerHTML = `<span>${title}</span>`;

  if (!locked) {
    header.innerHTML += '<span class="arrow"></span>';
    header.onclick = (e) => {
      content.classList.toggle('folded');
      header.classList.toggle('folded');
      if (!content.classList.contains('folded') && onUnfold) {
        onUnfold();
      }
    };
  } else {
    header.style.cursor = 'default';
  }

  const content = document.createElement('div');
  content.className = 'group-content';
  if (foldedByDefault && !locked) {
    content.classList.add('folded');
    header.classList.add('folded');
  } else if (!foldedByDefault && onUnfold) {
    // If open by default, call onUnfold immediately or after a short delay
    requestAnimationFrame(() => onUnfold());
  }

  group.appendChild(header);
  group.appendChild(content);
  parent.appendChild(group);
  return content;
}

main().catch(err => {
  console.error("Top-level error in main():", err);
});

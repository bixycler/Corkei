
async function main() {

  const TravelportResponseJson = await fetch('test.json');
  const TravelportResponse = await TravelportResponseJson.json();
  jsontxt.value = JSON.stringify(TravelportResponse, null, 2);

  // Global variables for console debug 
  // Travelport JSON tree: offer > option > product
  window.TravelportOffers = TravelportResponse.CatalogProductOfferingsResponse.CatalogProductOfferings.CatalogProductOffering;
  // Combo index tree: offer-combo > option > price-combo > combo / leg (segment) / product
  window.TravelportOfferCombos = []; // Combo collection: root nodes are offer combos, limited by offersPerPage
  window.TravelportPriceCombos = {}; // Price combos indexed by CombinabilityCode set
  window.TravelportCombos = {}; // Combos (lines of products through all legs), indexed by individual CombinabilityCode
  window.TravelportProducts = {}; // The smallest unit, leaf nodes in combo index tree

  // Build Combo index tree from Travelport JSON tree (TravelportOffers)
  // Combo index tree: offer-combo > option > price-combo > combo / leg (segment) / product
  for (let offer of TravelportOffers) {
    let legSequence = offer.sequence;
    if (legSequence === 1) {
      let offerCombo = { id: 'opl:' + offer.id, legs: [], options: [] };
      TravelportOfferCombos.push(offerCombo);
    }
    for (let optid in offer.ProductBrandOptions) {
      let opt = offer.ProductBrandOptions[optid];
      opt.offer = offer; // uplink
      for (let product of opt.ProductBrandOffering) {
        product.option = opt; // uplink
        //console.debug(product); 
        let pid = product.Product[0].productRef;
        if (product.Product.length > 1) {
          console.info('Product has more than 1 ID:', product.Product);
        }
        TravelportProducts[pid] = product;

        // Clean up irrelavent fields for clarity in console debug
        delete offer['@type'];
        delete opt['@type'];
        delete product['@type'];
        delete product.BestCombinablePrice['@type']; // also for TotalPrice
        delete product['TermsAndConditions'];

        // Handle prices
        let ccs = product.CombinabilityCode;
        let pcc = ccs.join(' '), price = product.BestCombinablePrice.TotalPrice;
        let priceCombo = null;
        if (!(pcc in TravelportPriceCombos)) { // new priceCombo
          priceCombo = {
            price: price,
            BestCombinablePrice: product.BestCombinablePrice,
            CombinabilityCode: ccs,
            priceCC: pcc, // up index
            offerCombo: null, // uplink
            combos: []
          };
          TravelportPriceCombos[pcc] = priceCombo;
          // Add this new priceCombo to TravelportOfferCombos
          if (legSequence === 1) {
            // Combo collection: offer-combo > option > price-combo > combo
            let offerCombo = TravelportOfferCombos.at(-1);
            let oid = product.ContentSource === 'NDC' ? optid : 0;
            let option = offerCombo.options[oid] ?? (offerCombo.options[oid] = []);
            option.push(priceCombo);
            console.debug('New offerCombo:', offerCombo, `at opt[${oid}]/product[${pid}]`, product);
          }
        } else { // Check this price against existing priceCombo
          priceCombo = TravelportPriceCombos[pcc];
          if (price !== priceCombo.price) {
            console.error(`Different TotalPrice for pcc = ${pcc}: `, `product = ${price}`, ccs, ` <> combo = ${priceCombo.price}`, priceCombo.CombinabilityCode);
          }
          if (JSON.stringify(product.BestCombinablePrice) !== JSON.stringify(priceCombo.BestCombinablePrice)) {
            console.info(`Different BestCombinablePrice for pcc = ${pcc}: `, 'product = ', product.BestCombinablePrice, ' <> combo =', priceCombo.BestCombinablePrice);
          }
        }
        // Process combos by CombinabilityCode (cc)
        for (let cc of ccs) {
          // Rectangular prism of priceCombo: combo / leg (segment) / product
          let combo = null;
          if (!(cc in TravelportCombos)) { // new combo
            combo = {
              priceCombos: [priceCombo], // uplink
              BestCombinablePrice: product.BestCombinablePrice,
              CombinabilityCode: ccs,
              cc: cc,
              legs: []
            }
            TravelportCombos[cc] = combo;
          } else { // Check this combo against existing combo
            combo = TravelportCombos[cc];
            if (combo.priceCombos.length > 1 && price !== combo.priceCombos[0].price) {
              console.error(`Different TotalPrice for cc = ${cc}: `, `product = ${price}`, ccs, ` <> combo = ${combo.priceCombos[0].price}`, combo.priceCombos[0].CombinabilityCode);
            }
            if (JSON.stringify(product.BestCombinablePrice) !== JSON.stringify(combo.BestCombinablePrice)) {
              console.info(`Different BestCombinablePrice for cc = ${cc}: `, 'product = ', product.BestCombinablePrice, ' <> combo =', combo.BestCombinablePrice);
            }
          }
          let leg = combo.legs[legSequence - 1] ?? (combo.legs[legSequence - 1] = []);
          leg.push(product);
        }
      }
    }
  }

  // Postprocessing 1: link priceCombos with combos
  for (let priceCombo of Object.values(TravelportPriceCombos)) {
    for (let cc of priceCombo.CombinabilityCode) {
      let combo = TravelportCombos[cc];
      if (combo) {
        priceCombo.combos.push(combo);
        combo.priceCombos.push(priceCombo);
      } else {
        console.error(`Combo ${cc} not found for priceCombo`, priceCombo);
      }
    }
  }
  // Postprocessing 2: link offerCombo with priceCombos and offers
  for (let offerCombo of TravelportOfferCombos) {
    for (let option of offerCombo.options) {
      for (let priceCombo of option) {
        priceCombo.offerCombo = offerCombo;
        for (let combo of priceCombo.combos) {
          for (let legi in combo.legs) {
            let leg = combo.legs[legi];
            if (leg.length < 1) {
              console.warn(`Empty leg #${legi + 1} in combo ${combo.cc}`, combo);
              continue;
            }
            let legOffer = null;
            for (let product of leg) {
              if (!legOffer) legOffer = product.option.offer;
              else if (product.option.offer !== legOffer) {
                console.error(`Different offers for the same leg #${legi + 1}: `, legOffer, product.option.offer);
              }
            }
            if (legOffer && !offerCombo.legs.includes(legOffer)) {
              offerCombo.legs.push(legOffer);
              let lopl = legOffer.offerCombo ?? (legOffer.offerCombo = []);
              lopl.push(offerCombo);
            }
          }
        }
      }
    }
  }


}
main();

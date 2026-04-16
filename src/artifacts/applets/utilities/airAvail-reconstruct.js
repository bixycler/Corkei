// The main function to process airAvail JSONL
export function processAirAvail(jsonlText) {
    // Handle malformed JSONL where log collection artifacts cause 
    // multiple JSON objects (e.g. `][` or `]{`) to be squashed onto a single line.
    // This injects the missing newlines so parsing succeeds.
    const cleanedText = jsonlText
        .replace(/}\s*{/g, '}\n{')
        .replace(/\]\s*\[/g, ']\n[')
        .replace(/}\s*\[/g, '}\n[')
        .replace(/\]\s*{/g, ']\n{');
    const lines = cleanedText.split('\n').filter(line => line.trim().length > 0);
    const items = [];
    let lastTimestamp = "";

    for (let line of lines) {
        const tsMatch = line.match(/^(\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2})\s*(.*)$/);
        if (tsMatch) {
            lastTimestamp = tsMatch[1];
            line = tsMatch[2];
        }
        line = line.trim();
        if (line.length > 0) {
            try {
                items.push({
                    ts: lastTimestamp,
                    obj: JSON.parse(line)
                });
            } catch (e) {
                console.error('Failed to parse JSON for line:', line, e);
            }
        }
    }

    const outputLines = [];

    for (let i = 0; i < items.length; i += 2) {
        if (i + 1 >= items.length) break;

        const errorItem = items[i];
        const flightsItem = items[i + 1];

        const errorObj = errorItem.obj;
        const flightsArr = flightsItem.obj;
        const timestamp = errorItem.ts || flightsItem.ts || '';

        // Validate seatNumber
        let seatNumber = flightsArr[0]?.seatNumber || 0;
        let isUniform = flightsArr.every(f => f.seatNumber === seatNumber);
        if (!isUniform) {
            console.warn(`Warning: seatNumbers differ in lines ${i + 1}-${i + 2}. Using the first value: ${seatNumber}.`);
        }
        let numPsgrs = seatNumber + 1;

        // Merged JSON
        const mergedJson = {
            ERR_MSG: errorObj.ERR_MSG,
            AvailabilityPutRequest: flightsArr
        };
        const col1 = JSON.stringify(mergedJson);

        // Request XML
        let reqXml = '<PNRBFManagement_33><AirSegSellMods>';
        flightsArr.forEach(flight => {
            reqXml += '<AirSegSell>' +
                `<Vnd>${flight.marketingCarrierCode}</Vnd>` +
                `<FltNum>${String(flight.flightNumber).padStart(4, '0')}</FltNum>` + // Padded in request to match example output
                `<OpSuf/>` +
                `<Class>${flight.bookingClass}</Class>` +
                `<StartDt>${flight.departureDate}</StartDt>` +
                `<StartAirp>${flight.origin}</StartAirp>` +
                `<EndAirp>${flight.destination}</EndAirp>` +
                `<Status>NN</Status>` +
                `<NumPsgrs>${numPsgrs}</NumPsgrs>` +
                `<DtChg>00</DtChg>` +
                `<StopoverIgnoreInd></StopoverIgnoreInd>` +
                `<AvailDispType>G</AvailDispType>` +
                `<AvailJrnyNum></AvailJrnyNum>` +
                `<AvailSource></AvailSource>` +
                '</AirSegSell>';
        });
        reqXml += '</AirSegSellMods></PNRBFManagement_33>';

        // Response XML
        let resXml = '<PNRBFManagement_33>';
        resXml += '<TransactionErrorCode><Domain>AppErrorSeverityLevel</Domain><Code>1</Code></TransactionErrorCode>';
        resXml += '<AirSegSell><ErrorCode>0002</ErrorCode>';

        let errMsg = errorObj.ERR_MSG || '';
        let extractedErrorText = errMsg;
        if (errMsg.startsWith('AppErrorSeverityLevel1')) {
            extractedErrorText = errMsg.replace('AppErrorSeverityLevel1', '');
        }

        flightsArr.forEach(flight => {
            resXml += '<AirSell>' +
                `<DisplaySequenceNumber>00</DisplaySequenceNumber>` +
                `<Vnd>${flight.marketingCarrierCode}</Vnd>` +
                `<FltNum>${flight.flightNumber}</FltNum>` + // Raw unpadded in response to match example output
                `<OpSuf/>` +
                `<Class>${flight.bookingClass}</Class>` +
                `<StartDt>${flight.departureDate}</StartDt>` +
                `<DtChg>0</DtChg>` +
                `<StartAirp>${flight.origin}</StartAirp>` +
                `<EndAirp>${flight.destination}</EndAirp>` +
                `<StartTm></StartTm>` +
                `<EndTm></EndTm>` +
                `<Status>UC</Status>` +
                `<NumPsgrs>${numPsgrs}</NumPsgrs>` +
                `<SellType/>` +
                `<SellValidityPeriod/>` +
                `<MarriageNum/>` +
                `<SuccessInd>N</SuccessInd>` +
                `<COG>N</COG>` +
                `<TklessInd>N</TklessInd>` +
                `<FareQuoteTkIgnInd>N</FareQuoteTkIgnInd>` +
                `<StopoverInd>N</StopoverInd>` +
                `<AvailyBypassInd/>` +
                `<OpAirV/>` +
                '</AirSell>';

            resXml += '<ErrText>' +
                '<Err/><KlrInErr/><InsertedTextAry/>' +
                `<Text>${extractedErrorText}</Text>` +
                '</ErrText>';
        });

        resXml += '</AirSegSell></PNRBFManagement_33>';

        const colTimestamp = timestamp ? `"${timestamp}"` : '""';
        outputLines.push([colTimestamp, col1, reqXml, resXml].join('\t'));
    }

    return outputLines.join('\n');
}

// Node.js CLI execution block
if (typeof process !== 'undefined' && process.argv && typeof window === 'undefined') {
    // Dynamic import to satisfy CommonJS check while supporting 'fs'
    import('fs').then((fs) => {
        const filePath = process.argv[2];

        if (filePath === '-h' || filePath === '--help') {
            console.log('Usage: node airAvail-reconstruct.js [file.jsonl] > output.tsv');
            console.log('Or use STDIN: cat file.jsonl | node airAvail-reconstruct.js > output.tsv');
            process.exit(0);
        }

        let inputStr = '';
        if (filePath) {
            inputStr = fs.readFileSync(filePath, 'utf-8');
            console.log(processAirAvail(inputStr));
        } else {
            // Read from stdin if no file provided
            inputStr = fs.readFileSync(0, 'utf-8');
            console.log(processAirAvail(inputStr));
        }
    }).catch(e => {
        // Ignored in browser context or if fs fails
    });
}

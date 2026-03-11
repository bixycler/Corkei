#!/bin/bash

# Script to grep multi-city searches from gzipped log files

if [ $# -lt 2 ] || [ $# -gt 3 ]; then
  echo "Usage: $0 <gzList> <nLegs> [travelport]"
  echo "  gzList: A file containing the list of gzipped logs"
  echo "  nLegs: The least number of legs in searches to be grepped"
  echo "  travelport: (Optional) Set to 'true' to filter only Travelport GDS (AP)"
  exit 1
fi

gzList="$1"
nLegs="$2"
travelport="${3:-false}"

# Validate inputs
if [ ! -f "$gzList" ]; then
  echo "Error: gzList file '$gzList' not found"
  exit 1
fi

if ! [[ "$nLegs" =~ ^[0-9]+$ ]]; then
  echo "Error: nLegs must be a number"
  exit 1
fi

# Stream zgrep output directly to awk for online filtering
# This avoids memory explosion when processing large log files
zgrep -a -e "DEP_CD${nLegs}" -e 'lastGoodsCount' $(cat "$gzList") | awk -v TRAVELPORT="$travelport" '
BEGIN {
  # Track active calls by threadId
}

# Match header pattern to extract timestamp and threadId
match($0, /([0-9]{4}-[0-9]{2}-[0-9]{2}) ([0-9]{2}:[0-9]{2}:[0-9]{2}) \[([^\]]+)\](.*)/, arr) {
  logDate = arr[1]
  logTime = arr[2]
  threadId = arr[3]
  logContent = arr[4]
  logTimeFullStr = logDate " " logTime
  
  # Convert timestamp to epoch seconds (approximation for comparison)
  # Format: YYYY-MM-DD HH:MM:SS
  split(logDate, dateParts, "-")
  split(logTime, timeParts, ":")
  # Simple epoch calculation (not perfect but sufficient for time difference < 1000ms)
  timestamp = dateParts[1] * 31536000 + dateParts[2] * 2592000 + dateParts[3] * 86400 + timeParts[1] * 3600 + timeParts[2] * 60 + timeParts[3]
  
  # Check if this is a request line (contains DEP_CD)
  if (logContent ~ /airListSchSv\(req\)/) {
    activeCalls[threadId "_time"] = timestamp
    activeCalls[threadId "_timeStr"] = logTimeFullStr
    activeCalls[threadId "_reqLine"] = $0
  }
  
  # Check if this is an END line (contains lastGoodsCount)
  if (logContent ~ /lastGoodsCount/) {
    # Filter out lastGoodsCount : 0 (they are plenty and not useful)
    if (logContent ~ /lastGoodsCount[[:space:]]*:[[:space:]]*0[^0-9]/) {
      # Clean up this thread from active calls
      delete activeCalls[threadId "_time"]
      delete activeCalls[threadId "_timeStr"]
      delete activeCalls[threadId "_reqLine"]
    } else {
      # Extract processing time from END line
      if (match(logContent, /Processing[[:space:]]+time[[:space:]]+\[([^\]]+)\][[:space:]]+ms/, procMatch)) {
        procTimeStr = procMatch[1]
        # Parse processing time (format: "GDS,processingTime" or just "processingTime")
        split(procTimeStr, parts, ",")
        procTime = parts[length(parts)]
        gsub(/[[:space:]]/, "", procTime)
        procTime = int(procTime)
        
        # Extract GDS code (first part of processing time string)
        gdsCode = parts[1]
        gsub(/[[:space:]]/, "", gdsCode)
        
        # Filter for Travelport GDS if flag is enabled
        # Travelport supports: AP (Galileo/Apollo)
        if (TRAVELPORT == "true" && gdsCode != "AP") {
          # Skip non-Travelport GDS
          delete activeCalls[threadId "_time"]
          delete activeCalls[threadId "_timeStr"]
          delete activeCalls[threadId "_reqLine"]
        } else {
          # Check if we have a matching request line for this thread
          if ((threadId "_time") in activeCalls) {
            reqTime = activeCalls[threadId "_time"]
            dt = (timestamp - reqTime) * 1000  # Convert to milliseconds
            
            # Filter: |dt - processingTime| < 1000
            if (dt >= 0 && dt - procTime < 1000 && dt - procTime > -1000) {
              # Print the matching request line first
              print activeCalls[threadId "_reqLine"]
              # Then print the END line
              print $0
            }
          }
        }
      }
      
      # Clean up this thread from active calls
      delete activeCalls[threadId "_time"]
      delete activeCalls[threadId "_timeStr"]
      delete activeCalls[threadId "_reqLine"]
    }
  }
}
'

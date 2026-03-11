#!/bin/bash

# detect-gc-cms-churn.sh
# Detects high churn rate ParNew GCs from piped JVM GC logs.
#
# Usage: 
#   grep "ParNew" gc.log | ./detect-gc-cms-churn.sh [threshold] [window_size]
#   or
#   cat gc.log | ./detect-gc-cms-churn.sh [threshold] [window_size]
#
# Arguments:
#   threshold:   Min GCs per second (default: 10)
#   window_size: Number of GCs to average over (default: threshold * 60)
#
# The script uses a circular buffer to calculate the average churn rate
# over the last <window_size> samples.

THRESHOLD=${1:-10}
WINDOW_SIZE=${2:-$(($THRESHOLD * 60))}

# Ensure arguments are positive numbers
[[ "$THRESHOLD" =~ ^[0-9]+$ ]] || THRESHOLD=10
[[ "$WINDOW_SIZE" =~ ^[0-9]+$ ]] || WINDOW_SIZE=600

# Process everything in a single awk process for maximum speed
awk -v threshold="$THRESHOLD" -v window_size="$WINDOW_SIZE" '
{
    # Example format: ... 134833.492: [GC... [ParNew:
    if ($0 ~ /: \[GC.*\[ParNew: /) {
        if (match($0, /([0-9]+\.[0-9]+):[[:space:]]*\[GC/, arr)) {
            ts = arr[1]
            
            # Use circular buffer for timestamps
            idx = (count % window_size)
            if (count >= window_size) {
                # Time elapsed between the oldest and newest sample in the window
                diff = ts - window[idx]
                if (diff > 0) {
                    # Average rate over the last <window_size> samples
                    rate = window_size / diff
                    if (rate >= threshold) {
                        print $0
                    }
                }
            }
            window[idx] = ts
            count++
        }
    }
}
'

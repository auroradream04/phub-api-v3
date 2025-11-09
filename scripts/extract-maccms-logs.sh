#!/bin/bash

# Extract MACCMS collection debug logs in a clean, readable format
# Usage: ./extract-maccms-logs.sh /path/to/php/error.log

if [ -z "$1" ]; then
    echo "Usage: $0 <path-to-error-log>"
    echo "Example: $0 /var/log/php-errors.log"
    exit 1
fi

LOG_FILE="$1"

if [ ! -f "$LOG_FILE" ]; then
    echo "Error: Log file not found: $LOG_FILE"
    exit 1
fi

echo "=========================================="
echo "MACCMS COLLECTION DEBUG LOGS"
echo "=========================================="
echo ""

# Extract only COLLECT DEBUG lines, clean up encoding issues
iconv -f UTF-8 -t UTF-8 -c "$LOG_FILE" 2>/dev/null | \
    grep "COLLECT DEBUG" | \
    sed 's/.*PHP message: //g' | \
    sed 's/; PHP message:/\n/g' | \
    while IFS= read -r line; do
        # Clean up the line
        line=$(echo "$line" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
        if [ ! -z "$line" ]; then
            echo "$line"
        fi
    done

echo ""
echo "=========================================="
echo "END OF DEBUG LOGS"
echo "=========================================="

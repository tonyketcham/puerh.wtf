#!/bin/bash

# Wrapper script to ensure proper exit code propagation from flatbread
# This ensures that CI builds fail when they should fail.

set -e  # Exit on any error
set -o pipefail  # Exit on pipe failures

# Check if we have arguments
if [ $# -eq 0 ]; then
    echo "Usage: $0 <command> [args...]" >&2
    exit 1
fi

# Execute the command and capture its exit code
"$@"
EXIT_CODE=$?

# Exit with the same code as the command
if [ $EXIT_CODE -ne 0 ]; then
    echo "Command failed with exit code $EXIT_CODE" >&2
    exit $EXIT_CODE
fi

echo "Command completed successfully"
exit 0 
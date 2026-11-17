#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
chmod +x ./scripts/install_mac.sh
./scripts/install_mac.sh

read -n 1 -s -r -p "Kapatmak icin herhangi bir tusa basin..."
echo ""

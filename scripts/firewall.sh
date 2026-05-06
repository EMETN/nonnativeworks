#!/bin/bash
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
    exec sudo /usr/local/bin/firewall "$@"
fi

case "${1:-}" in
  off)
    echo "Disabling firewall..."
    iptables -F
    iptables -X
    iptables -P INPUT ACCEPT
    iptables -P OUTPUT ACCEPT
    iptables -P FORWARD ACCEPT
    ipset destroy allowed-domains 2>/dev/null || true
    echo "Firewall disabled."
    ;;
  on)
    echo "Enabling firewall..."
    bash /usr/local/bin/init-firewall.sh
    echo "Firewall enabled."
    ;;
  *)
    echo "Usage: firewall {on|off}"
    exit 1
    ;;
esac

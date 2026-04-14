#!/bin/bash
set -e
set -x
set -euo pipefail  # Exit on error, undefined vars, and pipeline failures
IFS=$'\n\t'       # Stricter word splitting

sleep 3

# 1. Extract Docker DNS info BEFORE any flushing
DOCKER_DNS_RULES=$(iptables-save -t nat | grep "127\.0\.0\.11" || true)

# Flush existing rules and delete existing ipsets
iptables -F
iptables -X
iptables -t nat -F
iptables -t nat -X
iptables -t mangle -F
iptables -t mangle -X
ipset destroy allowed-domains 2>/dev/null || true

iptables -P INPUT ACCEPT
iptables -P OUTPUT ACCEPT
iptables -P FORWARD ACCEPT

# 2. Selectively restore ONLY internal Docker DNS resolution
if [ -n "$DOCKER_DNS_RULES" ]; then
    echo "Restoring Docker DNS rules..."
    iptables -t nat -N DOCKER_OUTPUT 2>/dev/null || true
    iptables -t nat -N DOCKER_POSTROUTING 2>/dev/null || true
    echo "$DOCKER_DNS_RULES" | xargs -L 1 iptables -t nat
else
    echo "No Docker DNS rules to restore"
fi

# First allow DNS and localhost before any restrictions
# Allow outbound DNS
iptables -A OUTPUT -p udp --dport 53 -j ACCEPT
# Allow inbound DNS responses
iptables -A INPUT -p udp --sport 53 -j ACCEPT
# Allow outbound SSH
iptables -A OUTPUT -p tcp --dport 22 -j ACCEPT
# Allow inbound SSH responses
iptables -A INPUT -p tcp --sport 22 -m state --state ESTABLISHED -j ACCEPT
# Allow localhost
iptables -A INPUT -i lo -j ACCEPT
iptables -A OUTPUT -o lo -j ACCEPT

# Create ipset with CIDR support
ipset create allowed-domains hash:net

echo "Adding Cloudflare IP ranges..."
for cidr in \
    104.16.0.0/13 \
    172.64.0.0/13 \
    131.0.72.0/22
do
    ipset add allowed-domains "$cidr" -exist
done

# Fetch GitHub meta information and aggregate + add their IP ranges
echo "Fetching GitHub IP ranges..."
gh_ranges=$(curl -s https://api.github.com/meta)
if [ -z "$gh_ranges" ]; then
    echo "ERROR: Failed to fetch GitHub IP ranges"
    exit 1
fi

if ! echo "$gh_ranges" | jq -e '.web and .api and .git' >/dev/null; then
    echo "ERROR: GitHub API response missing required fields"
    exit 1
fi

echo "Processing GitHub IPs..."
while read -r cidr; do
    if [[ ! "$cidr" =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}/[0-9]{1,2}$ ]]; then
        echo "ERROR: Invalid CIDR range from GitHub meta: $cidr"
        exit 1
    fi
    echo "Adding GitHub range $cidr"
    ipset add allowed-domains "$cidr" -exist
done < <(echo "$gh_ranges" | jq -r '(.web + .api + .git)[]' | aggregate -q)

# Resolve and add other allowed domains
for domain in \
    "registry.npmjs.org" \
    "api.anthropic.com" \
    "sentry.io" \
    "statsig.anthropic.com" \
    "statsig.com" \
    "marketplace.visualstudio.com" \
    "vscode.blob.core.windows.net" \
    "update.code.visualstudio.com" \
    "lubcqmviewdnjgpkfzin.supabase.co" \
    "aws-0-eu-central-1.pooler.supabase.com" \
    "api.doppler.com" \
    "cli.doppler.com" \
    "packages.doppler.com" \
    "boards-api.greenhouse.io" \
    "api.lever.co" \
    "api.ashbyhq.com" \
    "apply.workable.com" \
    "gofore.com" \
    "op-careers.fi" \
    "jobs.nokia.com" \
    "fa-evmr-saasfaprod1.fa.ocs.oraclecloud.com" \
    "careers.tieto.com" \
    "nordea.com" \
    "www.nordea.com" \
    "careers.vaisala.com" \
    "cgi.njoyn.com" \
    "www.accenture.com" \
    "posti.wd3.myworkdayjobs.com" \
    "sok.wd502.myworkdayjobs.com" \
    "ag.wd3.myworkdayjobs.com" \
    "equinor.wd3.myworkdayjobs.com" \
    "storaenso.wd502.myworkdayjobs.com" \
    "kone.wd3.myworkdayjobs.com" \
    "finnair.wd103.myworkdayjobs.com" \
    "careers.abb" \
    "baronacareers.com" \
    "barona.fi" \
    "nitor.com" \
    "alpha-sense.com" \
    "rovio.com" \
    "careers.microsoft.com" \
    "apply.careers.microsoft.com" \
    "s-pankki.fi" \
    "careers.amd.com" \
    "careers.wolt.com" \
    "jobs.zalando.com" \
    "bolt.eu" \
    "jobs.sap.com" \
    "jobs.siemens-healthineers.com" \
    "solita.fi" \
    "careers.hiab.com" \
    "jobs.neste.com" \
    "kesko.fi" \
    "konecranes.careers" \
    "careers.allianz.com" \
    "bmwgroup.jobs" \
    "jobs.volkswagen-group.com" \
    "academicwork.fi" \
    "happeo.recruitee.com" \
    "pypi.org" \
    "files.pythonhosted.org" \
    "playwright.azureedge.net" \
    "storage.googleapis.com" \
    "eu.i.posthog.com" \
    "eu-assets.i.posthog.com" \
    "eu.posthog.com" \
    "o4511162204225536.ingest.de.sentry.io" \
    "host.docker.internal" ; do
    echo "Resolving $domain..."
    ips=$(dig +noall +answer A "$domain" | awk '$4 == "A" {print $5}')
    if [ -z "$ips" ]; then
        echo "ERROR: Failed to resolve $domain"
        exit 1
    fi
    
    while read -r ip; do
        if [[ ! "$ip" =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
            echo "ERROR: Invalid IP from DNS for $domain: $ip"
            exit 1
        fi
        echo "Adding $ip for $domain"
        ipset add allowed-domains "$ip" -exist
    done < <(echo "$ips")
done

# CDN-backed domains resolve to different IPs depending on which Akamai/CDN node responds.
# Query from multiple public DNS servers to capture more of the IP pool.
for cdn_domain in \
    "fa-evmr-saasfaprod1.fa.ocs.oraclecloud.com" ; do
    for dns_server in "8.8.8.8" "1.1.1.1"; do
        echo "Resolving $cdn_domain via $dns_server..."
        cdn_ips=$(dig +noall +answer A "@$dns_server" "$cdn_domain" | awk '$4 == "A" {print $5}')
        while read -r ip; do
            if [[ -z "$ip" ]]; then continue; fi
            if [[ ! "$ip" =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
                echo "WARNING: Invalid IP from $dns_server for $cdn_domain: $ip (skipping)"
                continue
            fi
            echo "Adding $ip for $cdn_domain (via $dns_server)"
            ipset add allowed-domains "$ip" -exist
        done < <(echo "$cdn_ips")
    done
done

# Get host IP from default route
HOST_IP=$(ip route | grep default | cut -d" " -f3)
if [ -z "$HOST_IP" ]; then
    echo "ERROR: Failed to detect host IP"
    exit 1
fi

HOST_NETWORK=$(echo "$HOST_IP" | sed "s/\.[0-9]*$/.0\/24/")
echo "Host network detected as: $HOST_NETWORK"

# Set up remaining iptables rules
iptables -A INPUT -s "$HOST_NETWORK" -j ACCEPT
iptables -A OUTPUT -d "$HOST_NETWORK" -j ACCEPT

# Set default policies to DROP first
iptables -P INPUT DROP
iptables -P FORWARD DROP
iptables -P OUTPUT DROP

# First allow established connections for already approved traffic
iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT

# Then allow only specific outbound traffic to allowed domains
iptables -A OUTPUT -p tcp --dport 443 -m set --match-set allowed-domains dst -j ACCEPT

# Explicitly REJECT all other outbound traffic for immediate feedback
iptables -A OUTPUT -j REJECT --reject-with icmp-admin-prohibited

echo "Firewall configuration complete"
echo "Verifying firewall rules..."
if curl --connect-timeout 5 https://example.com >/dev/null 2>&1; then
    echo "ERROR: Firewall verification failed - was able to reach https://example.com"
    exit 1
else
    echo "Firewall verification passed - unable to reach https://example.com as expected"
fi

# Verify GitHub API access
if ! curl --connect-timeout 5 https://api.github.com/zen >/dev/null 2>&1; then
    echo "ERROR: Firewall verification failed - unable to reach https://api.github.com"
    exit 1
else
    echo "Firewall verification passed - able to reach https://api.github.com as expected"
fi

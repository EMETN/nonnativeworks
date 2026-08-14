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

# Vercel's shared cname.vercel-dns.com rotates across these /24s on a ~4min TTL, so an
# init-time IP snapshot goes stale before the scraper connects (careers.uniper.energy, jobs.eon.com).
echo "Adding Vercel IP ranges..."
for cidr in \
    76.76.21.0/24 \
    66.33.60.0/24
do
    ipset add allowed-domains "$cidr" -exist
done

# Akamai edge (AS20940) rotates IPs across a large pool on a ~20-77s TTL, so an init-time
# snapshot goes stale before the scraper connects (www.novonordisk.com).
echo "Adding Akamai edge IP ranges..."
for cidr in \
    2.16.0.0/13 \
    23.0.0.0/12 \
    23.32.0.0/11 \
    23.192.0.0/11 \
    72.246.0.0/15 \
    88.221.0.0/16 \
    96.6.0.0/15 \
    104.64.0.0/10 \
    184.24.0.0/13
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

# Resolve and add other allowed domains, split into dev/service infrastructure,
# ATS/recruiting platforms, and the company career sites we scrape (each alphabetical).
tool_domains=(
    "api.anthropic.com"  # Anthropic
    "host.docker.internal"  # Docker host
    "api.doppler.com"  # Doppler
    "cli.doppler.com"  # Doppler
    "packages.doppler.com"  # Doppler
    "storage.googleapis.com"  # Google Cloud Storage
    "registry.npmjs.org"  # npm
    "eu-assets.i.posthog.com"  # PostHog
    "eu.i.posthog.com"  # PostHog
    "eu.posthog.com"  # PostHog
    "files.pythonhosted.org"  # PyPI
    "pypi.org"  # PyPI
    "o4511162204225536.ingest.de.sentry.io"  # Sentry
    "sentry.io"  # Sentry
    "statsig.com"  # Statsig
    "aws-0-eu-central-1.pooler.supabase.com"  # Supabase
    "movbttbpcfrwrgshffef.supabase.co"  # Supabase
    "marketplace.visualstudio.com"  # VS Code
    "update.code.visualstudio.com"  # VS Code
    "vscode.blob.core.windows.net"  # VS Code
)
ats_domains=(
    "api.ashbyhq.com"  # Ashby
    "boards-api.greenhouse.io"  # Greenhouse
    "api.eu.lever.co"  # Lever
    "api.lever.co"  # Lever
    "career2.successfactors.eu"  # SuccessFactors
    "apply.workable.com"  # Workable
    "wd3.myworkdaysite.com"  # Workday
)
# CDN/multi-node hosts — each edge answers with a different slice of the IP pool, so these
# are resolved separately below via several DNS resolvers (not the single-resolver loop).
cdn_domains=(
    "jobs.booking.com"  # Booking.com
    "careers.futurice.com"  # Futurice
    "fa-ewwx-saasfaprod1.fa.ocs.oraclecloud.com"  # Oracle Cloud (Nexi)
    "fa-evmr-saasfaprod1.fa.ocs.oraclecloud.com"  # Oracle Cloud (Orkla, Nokia)
    "upcloud.teamtailor.com"  # UpCloud
)
company_domains=(
    "werkenbijabnamro.nl"  # ABN AMRO
    "academicwork.fi"  # Academic Work
    "www.accenture.com"  # Accenture
    "ag.wd3.myworkdayjobs.com"  # Airbus
    "aiven.io"  # Aiven
    "akqa.com"  # AKQA
    "careers.allianz.com"  # Allianz
    "alpha-sense.com"  # AlphaSense
    "careers.amd.com"  # AMD
    "jobs.arla.com"  # Arla
    "asml.com"  # ASML
    "barona.fi"  # Barona
    "bayer.eightfold.ai"  # Bayer
    "bmwgroup.jobs"  # BMW
    "bolt.eu"  # Bolt
    "capgemini.com"  # Capgemini
    "cg-jobstream-api.azurewebsites.net"  # Capgemini
    "careers.carlsberg.com"  # Carlsberg
    "cgi.njoyn.com"  # CGI
    "ejqi.fa.ocs.oraclecloud.eu"  # Danske Bank
    "deel.com"  # Deel
    "careers.deliveryhero.com"  # Delivery Hero
    "deptagency.com"  # DEPT
    "careers.telekom.com"  # Deutsche Telekom
    "search.prod.gcw.ng.telekom.net"  # Deutsche Telekom
    "careers.dhl.com"  # DHL
    "edenred.com"  # Edenred
    "equinor.wd3.myworkdayjobs.com"  # Equinor
    "jobs.ericsson.com"  # Ericsson
    "finnair.wd103.myworkdayjobs.com"  # Finnair
    "fiskars.wd3.myworkdayjobs.com"  # Fiskars
    "jobs.fortum.com"  # Fortum
    "gofore.com"  # Gofore
    "jobsapi-google.m-cloud.io"  # Google Jobs API (unattributed)
    "happeo.recruitee.com"  # Happeo
    "careers.theheinekencompany.com"  # Heineken
    "careers.hiab.com"  # Hiab
    "if.wd3.myworkdayjobs.com"  # If
    "jobs.ikea.com"  # IKEA
    "ing.wd3.myworkdayjobs.com"  # ING
    "kesko.fi"  # Kesko
    "kone.wd3.myworkdayjobs.com"  # KONE
    "konecranes.careers"  # Konecranes
    "api-apply.lufthansagroup.careers"  # Lufthansa
    "apply.lufthansagroup.careers"  # Lufthansa
    "maersk.wd3.myworkdayjobs.com"  # Maersk
    "metso.com"  # Metso
    "www.metso.com"  # Metso — metso.com 301-redirects here (different IPs), both needed
    "apply.careers.microsoft.com"  # Microsoft
    "careers.microsoft.com"  # Microsoft
    "careers.munichre.com"  # Munich Re
    "jobs.neste.com"  # Neste
    "nexigroup.com"  # Nexi
    "nitor.com"  # Nitor
    "jobs.nokia.com"  # Nokia
    "www.nordea.com"  # Nordea
    "career.nordnetab.com"  # Nordnet
    "nxp.wd3.myworkdayjobs.com"  # NXP
    "op-careers.fi"  # OP Financial Group
    "careers.orkla.com"  # Orkla
    "philips.wd3.myworkdayjobs.com"  # Philips
    "posti.wd3.myworkdayjobs.com"  # Posti
    "proton.me"  # Proton
    "careers.publicisgroupe.com"  # Publicis Groupe
    "www.randstad.com"  # Randstad
    "revolut.com"  # Revolut
    "rovio.com"  # Rovio
    "s-pankki.fi"  # S-Pankki
    "sanoma.wd3.myworkdayjobs.com"  # Sanoma
    "jobs.sap.com"  # SAP
    "scout24.com"  # Scout24
    "sebgroup.com"  # SEB
    "jobs.siemens.com"  # Siemens
    "jobs.siemens-healthineers.com"  # Siemens Healthineers
    "sok.wd502.myworkdayjobs.com"  # SOK
    "solita.fi"  # Solita
    "lifeatspotify.com"  # Spotify
    "careers.stellantis.com"  # Stellantis
    "storaenso.wd502.myworkdayjobs.com"  # Stora Enso
    "swecogroup.com"  # Sweco
    "careers.thalesgroup.com"  # Thales
    "thales.wd3.myworkdayjobs.com"  # Thales
    "careers.tieto.com"  # Tietoevry
    "uber.com"  # Uber
    "careers.vaisala.com"  # Vaisala
    "careers.vestas.com"  # Vestas
    "jobs.volkswagen-group.com"  # Volkswagen
    "jobs.volvogroup.com"  # Volvo Group
    "careers.wartsila.com"  # Wärtsilä
    "careers.wolt.com"  # Wolt
    "yousician.com"  # Yousician
    "jobs.zalando.com"  # Zalando
)
for domain in "${tool_domains[@]}" "${ats_domains[@]}" "${company_domains[@]}"; do
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
for cdn_domain in "${cdn_domains[@]}"; do
    # Akamai geo-routes DNS by resolver, so 8.8.8.8/1.1.1.1 return a different edge
    # cluster than the one the container connects to; query the local resolver too.
    for dns_server in "system" "8.8.8.8" "1.1.1.1"; do
        if [ "$dns_server" = "system" ]; then
            echo "Resolving $cdn_domain via system resolver..."
            cdn_ips=$(dig +noall +answer A "$cdn_domain" | awk '$4 == "A" {print $5}')
        else
            echo "Resolving $cdn_domain via $dns_server..."
            cdn_ips=$(dig +noall +answer A "@$dns_server" "$cdn_domain" | awk '$4 == "A" {print $5}')
        fi
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

# Allow CDP (Chrome DevTools Protocol) to the Windows host for Playwright dev use.
# Port 9222 is plain HTTP — it's only needed on host.docker.internal so we target
# the resolved IP directly rather than opening port 9222 to all allowed domains.
CDP_HOST_IP=$(dig +noall +answer A "host.docker.internal" | awk '$4 == "A" {print $5}' | head -1)
if [ -n "$CDP_HOST_IP" ]; then
    echo "Adding CDP rule for host.docker.internal ($CDP_HOST_IP:9222)"
    iptables -A OUTPUT -p tcp --dport 9222 -d "$CDP_HOST_IP" -j ACCEPT
else
    echo "WARNING: Could not resolve host.docker.internal — CDP rule not added"
fi

# Explicitly REJECT all other outbound traffic for immediate feedback
iptables -A OUTPUT -j REJECT --reject-with icmp-admin-prohibited

echo "Firewall configuration complete"
echo "Verifying firewall rules..."
if curl --connect-timeout 5 https://8.8.8.8 >/dev/null 2>&1; then
    echo "ERROR: Firewall verification failed - was able to reach https://8.8.8.8"
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

#!/bin/bash

# Smart deploy script for Anchor programs
# Compares local builds with cached deploy hashes to detect changes

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
DIM='\033[2m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Program colors (just use cyan for all - clean and consistent)
COL_AMM=$CYAN
COL_FUTARCHY=$CYAN
COL_VAULT=$CYAN
COL_SVAULT=$CYAN

# Box drawing
LINE_H="${DIM}────────────────────────────────────────────────────${NC}"

# Script paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
ANCHOR_TOML="$ROOT_DIR/Anchor.toml"
DEPLOY_DIR="$ROOT_DIR/target/deploy"
CACHE_DIR="$ROOT_DIR/.deploy-cache"

# All programs to deploy
ALL_PROGRAMS=("amm" "futarchy" "vault" "svault")

# Default options
DRY_RUN=false
FORCE=false
YES=false
TARGET_PROGRAM=""
TARGET_CLUSTER="devnet"  # Default to devnet
ANCHOR_ARGS=()

# Counters for summary
DEPLOYED=0
SKIPPED=0
FAILED=0
TOTAL_ESTIMATED_COST=0

# Programs that need deployment (filled during analysis phase)
PROGRAMS_TO_DEPLOY=()
# Parallel arrays for deploy info (bash 3 compatible)
DEPLOY_PROG_NAMES=()
DEPLOY_PROG_INFO=()

print_help() {
    echo -e "${CYAN}Smart Deploy${NC} - Anchor deployment with change detection"
    echo ""
    echo "Usage: $0 [options] [-- anchor-args]"
    echo ""
    echo "Options:"
    echo "  -c, --cluster <env>    Target cluster: local, dev, main (default: dev)"
    echo "  -p, --program <name>   Deploy only this program (amm, futarchy, vault, svault)"
    echo "  -d, --dry-run          Show what would happen without deploying"
    echo "  -f, --force            Deploy even if program is unchanged"
    echo "  -y, --yes              Skip confirmation prompts"
    echo "  -h, --help             Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0                        # Deploy all changed programs to devnet"
    echo "  $0 -c main                # Deploy to mainnet"
    echo "  $0 -c local               # Deploy to localnet"
    echo "  $0 -p amm                 # Deploy only amm if changed"
    echo "  $0 --dry-run              # Preview what would happen"
    echo "  $0 -c main -y             # Deploy to mainnet without prompts"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Get program color
get_prog_color() {
    local prog=$1
    case "$prog" in
        amm)      echo "$COL_AMM" ;;
        futarchy) echo "$COL_FUTARCHY" ;;
        vault)    echo "$COL_VAULT" ;;
        svault)   echo "$COL_SVAULT" ;;
        *)        echo "$CYAN" ;;
    esac
}

# Get cluster color
get_cluster_color() {
    local cluster=$1
    case "$cluster" in
        localnet) echo "$GREEN" ;;
        devnet)   echo "$YELLOW" ;;
        mainnet)  echo "$RED" ;;
        *)        echo "$BLUE" ;;
    esac
}

# Get deploy info for a program
get_deploy_info() {
    local prog=$1
    for i in "${!DEPLOY_PROG_NAMES[@]}"; do
        if [[ "${DEPLOY_PROG_NAMES[$i]}" == "$prog" ]]; then
            echo "${DEPLOY_PROG_INFO[$i]}"
            return
        fi
    done
    echo ""
}

# Set deploy info for a program
set_deploy_info() {
    local prog=$1
    local info=$2
    DEPLOY_PROG_NAMES+=("$prog")
    DEPLOY_PROG_INFO+=("$info")
}

# Map cluster shorthand to full cluster name
resolve_cluster() {
    local input=$1
    case "$input" in
        local|localnet|l)
            echo "localnet"
            ;;
        dev|devnet|d)
            echo "devnet"
            ;;
        main|mainnet|m)
            echo "mainnet"
            ;;
        *)
            echo "$input"
            ;;
    esac
}

# Get wallet balance in SOL
get_wallet_balance() {
    local balance_output
    if balance_output=$(solana balance 2>&1); then
        # Extract just the number (e.g., "5.123 SOL" -> "5.123")
        echo "$balance_output" | grep -oE '[0-9]+\.?[0-9]*' | head -1
    else
        echo ""
    fi
}

# Get deployment cost estimate for a program (rent-exempt minimum)
get_deploy_cost() {
    local program=$1
    local local_so="$DEPLOY_DIR/$program.so"

    if [[ ! -f "$local_so" ]]; then
        echo ""
        return
    fi

    # Get file size in bytes
    local file_size
    if [[ "$(uname)" == "Darwin" ]]; then
        file_size=$(stat -f%z "$local_so" 2>/dev/null)
    else
        file_size=$(stat -c%s "$local_so" 2>/dev/null)
    fi

    if [[ -z "$file_size" ]]; then
        echo ""
        return
    fi

    # Program accounts need additional overhead (~45 bytes for metadata)
    local total_size=$((file_size + 45))

    # Get rent-exempt amount from solana CLI
    local rent_output
    if rent_output=$(solana rent "$total_size" 2>&1); then
        # Extract SOL amount (e.g., "Rent-exempt minimum: 1.234 SOL" -> "1.234")
        echo "$rent_output" | grep -oE '[0-9]+\.?[0-9]*' | head -1
    else
        echo ""
    fi
}

# Get program ID from Anchor.toml for a given program and cluster
get_program_id() {
    local program=$1
    local cluster=$2

    # Handle mainnet-beta -> mainnet mapping
    if [[ "$cluster" == "mainnet-beta" ]]; then
        cluster="mainnet"
    fi

    # Parse the program ID from Anchor.toml
    sed -n "/\[programs\.$cluster\]/,/\[/p" "$ANCHOR_TOML" | grep "^$program" | head -1 | sed 's/.*"\([^"]*\)".*/\1/'
}

# Get cached hash for a program/cluster
get_cached_hash() {
    local program=$1
    local cluster=$2
    local cache_file="$CACHE_DIR/${cluster}_${program}.hash"

    if [[ -f "$cache_file" ]]; then
        cat "$cache_file"
    else
        echo ""
    fi
}

# Save hash to cache after successful deploy
save_cached_hash() {
    local program=$1
    local cluster=$2
    local hash=$3

    mkdir -p "$CACHE_DIR"
    echo "$hash" > "$CACHE_DIR/${cluster}_${program}.hash"
}

# Get current local .so hash
get_local_hash() {
    local program=$1
    local local_so="$DEPLOY_DIR/$program.so"

    if [[ -f "$local_so" ]]; then
        shasum -a 256 "$local_so" | cut -d' ' -f1
    else
        echo ""
    fi
}

# Compare local .so with cached deploy hash
# Returns 0 if same, 1 if different/new, 2 if error
compare_program() {
    local program=$1
    local local_so="$DEPLOY_DIR/$program.so"

    COMPARE_IS_NEW=false

    # Check local .so exists
    if [[ ! -f "$local_so" ]]; then
        log_error "Local build not found: $local_so"
        return 2
    fi

    local local_hash=$(get_local_hash "$program")
    local cached_hash=$(get_cached_hash "$program" "$CLUSTER")

    # No cached hash = never deployed to this cluster
    if [[ -z "$cached_hash" ]]; then
        COMPARE_IS_NEW=true
        return 1
    fi

    # Compare hashes
    if [[ "$local_hash" == "$cached_hash" ]]; then
        return 0
    else
        return 1
    fi
}

# Analyze a single program (check if it needs deployment)
analyze_program() {
    local program=$1
    local program_id=$2
    local color=$(get_prog_color "$program")

    echo -e "${color}$program${NC} ${DIM}(${program_id:0:12}...)${NC}"

    # Run compare and capture exit code
    local exit_code=0
    compare_program "$program" || exit_code=$?

    if [[ $exit_code -eq 0 ]]; then
        # Programs are identical
        if [[ "$FORCE" == true ]]; then
            echo -e "  ${YELLOW}~${NC} Unchanged but forcing deployment"
            PROGRAMS_TO_DEPLOY+=("$program")
            set_deploy_info "$program" "forced"
        else
            echo -e "  ${GREEN}=${NC} Unchanged - skipping"
            ((SKIPPED++)) || true
        fi
    elif [[ $exit_code -eq 1 ]]; then
        # Program changed or not deployed yet
        if [[ "$COMPARE_IS_NEW" == true ]]; then
            local deploy_cost=$(get_deploy_cost "$program")
            if [[ -n "$deploy_cost" ]]; then
                echo -e "  ${YELLOW}+${NC} New program ${DIM}(~${deploy_cost} SOL)${NC}"
                set_deploy_info "$program" "new ~${deploy_cost} SOL"
                # Add to total (using awk for floating point)
                TOTAL_ESTIMATED_COST=$(echo "$TOTAL_ESTIMATED_COST $deploy_cost" | awk '{printf "%.4f", $1 + $2}')
            else
                echo -e "  ${YELLOW}+${NC} New program"
                set_deploy_info "$program" "new"
            fi
        else
            echo -e "  ${YELLOW}*${NC} Changed"
            set_deploy_info "$program" "changed"
        fi
        PROGRAMS_TO_DEPLOY+=("$program")
    else
        # Error (exit_code == 2)
        ((FAILED++)) || true
    fi
}

# Actually deploy a program
execute_deploy() {
    local program=$1
    local program_id=$2
    local color=$(get_prog_color "$program")
    local info=$(get_deploy_info "$program")
    local local_hash=$(get_local_hash "$program")

    echo ""
    echo -e "${color}${BOLD}Deploying $program${NC} ${DIM}($info)${NC}"
    echo -e "${DIM}────────────────────────────────${NC}"

    # Run anchor deploy and indent output
    local deploy_output
    local deploy_exit=0

    if deploy_output=$(anchor deploy --program-name "$program" "${ANCHOR_ARGS[@]}" 2>&1); then
        # Indent and print output
        echo "$deploy_output" | while IFS= read -r line; do
            echo -e "  ${DIM}│${NC} $line"
        done
        echo -e "${DIM}────────────────────────────────${NC}"
        echo -e "  ${GREEN}✓${NC} ${color}$program${NC} deployed successfully"

        # Save hash to cache
        save_cached_hash "$program" "$CLUSTER" "$local_hash"

        ((DEPLOYED++)) || true
    else
        deploy_exit=$?
        # Indent and print error output
        echo "$deploy_output" | while IFS= read -r line; do
            echo -e "  ${DIM}│${NC} $line"
        done
        echo -e "${DIM}────────────────────────────────${NC}"
        echo -e "  ${RED}✗${NC} ${color}$program${NC} deployment failed"
        ((FAILED++)) || true
    fi
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -c|--cluster)
            TARGET_CLUSTER="$2"
            shift 2
            ;;
        -p|--program)
            TARGET_PROGRAM="$2"
            shift 2
            ;;
        -d|--dry-run)
            DRY_RUN=true
            shift
            ;;
        -f|--force)
            FORCE=true
            shift
            ;;
        -y|--yes)
            YES=true
            shift
            ;;
        -h|--help)
            print_help
            exit 0
            ;;
        --)
            shift
            ANCHOR_ARGS=("$@")
            break
            ;;
        *)
            log_error "Unknown option: $1"
            print_help
            exit 1
            ;;
    esac
done

# Validate target program if specified
if [[ -n "$TARGET_PROGRAM" ]]; then
    valid=false
    for prog in "${ALL_PROGRAMS[@]}"; do
        if [[ "$prog" == "$TARGET_PROGRAM" ]]; then
            valid=true
            break
        fi
    done
    if [[ "$valid" == false ]]; then
        log_error "Unknown program: $TARGET_PROGRAM"
        echo "Available programs: ${ALL_PROGRAMS[*]}"
        exit 1
    fi
fi

# Resolve cluster
CLUSTER=$(resolve_cluster "$TARGET_CLUSTER")
CLUSTER_COLOR=$(get_cluster_color "$CLUSTER")

# Add cluster to anchor args if not already present
has_cluster_arg=false
for arg in "${ANCHOR_ARGS[@]}"; do
    if [[ "$arg" == "--provider.cluster" ]]; then
        has_cluster_arg=true
        break
    fi
done
if [[ "$has_cluster_arg" == false ]]; then
    ANCHOR_ARGS+=("--provider.cluster" "$CLUSTER")
fi

# Get wallet balance
WALLET_BALANCE=$(get_wallet_balance)

# Header
echo ""
echo -e "$LINE_H"
echo -e "${CYAN}${BOLD}Smart Deploy${NC}"
echo -e "$LINE_H"
echo ""
echo -e "  Cluster:  ${CLUSTER_COLOR}${BOLD}$CLUSTER${NC}"
if [[ -n "$WALLET_BALANCE" ]]; then
    echo -e "  Wallet:   ${BOLD}$WALLET_BALANCE SOL${NC}"
else
    echo -e "  Wallet:   ${DIM}(unable to fetch balance)${NC}"
fi
if [[ "$DRY_RUN" == true ]]; then
    echo -e "  Mode:     ${YELLOW}DRY RUN${NC}"
fi
if [[ "$FORCE" == true ]]; then
    echo -e "  Force:    ${YELLOW}YES${NC}"
fi
echo ""
echo -e "$LINE_H"

# Determine which programs to check
if [[ -n "$TARGET_PROGRAM" ]]; then
    PROGRAMS=("$TARGET_PROGRAM")
else
    PROGRAMS=("${ALL_PROGRAMS[@]}")
fi

# ============================================
# PHASE 1: Analysis
# ============================================
echo ""
echo -e "${BOLD}Analyzing programs...${NC}"
echo ""

for program in "${PROGRAMS[@]}"; do
    program_id=$(get_program_id "$program" "$CLUSTER")

    if [[ -z "$program_id" ]]; then
        log_error "Could not find program ID for '$program' on cluster '$CLUSTER'"
        ((FAILED++)) || true
        continue
    fi

    analyze_program "$program" "$program_id"
done

echo ""
echo -e "$LINE_H"

# ============================================
# PHASE 2: Summary & Confirmation
# ============================================

# Check if there's anything to deploy
if [[ ${#PROGRAMS_TO_DEPLOY[@]} -eq 0 ]]; then
    echo ""
    echo -e "${GREEN}Nothing to deploy!${NC} All programs are up to date."
    echo ""
    echo -e "$LINE_H"
    echo ""
    exit 0
fi

# Show what will be deployed
echo ""
echo -e "${BOLD}Programs to deploy:${NC}"
echo ""
for prog in "${PROGRAMS_TO_DEPLOY[@]}"; do
    prog_color=$(get_prog_color "$prog")
    prog_info=$(get_deploy_info "$prog")
    echo -e "  ${prog_color}●${NC} $prog ${DIM}($prog_info)${NC}"
done
echo ""

# If dry-run, stop here
if [[ "$DRY_RUN" == true ]]; then
    echo -e "${YELLOW}Dry run complete.${NC} No programs were deployed."
    echo ""
    echo -e "$LINE_H"
    echo ""
    exit 0
fi

# Confirmation prompt (unless -y flag)
if [[ "$YES" != true ]]; then
    echo -e "$LINE_H"
    echo ""

    # Extra warning for mainnet
    if [[ "$CLUSTER" == "mainnet" ]]; then
        echo -e "  ${RED}${BOLD}⚠️  WARNING: You are deploying to MAINNET!${NC}"
        echo ""
    fi

    echo -e "  Deploy ${#PROGRAMS_TO_DEPLOY[@]} program(s) to ${CLUSTER_COLOR}${BOLD}$CLUSTER${NC}?"
    echo ""
    echo -ne "  ${DIM}Continue? [y/N]:${NC} "
    read -r response

    if [[ ! "$response" =~ ^[Yy]$ ]]; then
        echo ""
        echo -e "${YELLOW}Cancelled.${NC}"
        echo ""
        exit 0
    fi
fi

# ============================================
# PHASE 3: Deploy
# ============================================
echo ""
echo -e "$LINE_H"
echo ""
echo -e "${BOLD}Deploying to ${CLUSTER_COLOR}$CLUSTER${NC}${BOLD}...${NC}"

for prog in "${PROGRAMS_TO_DEPLOY[@]}"; do
    program_id=$(get_program_id "$prog" "$CLUSTER")
    execute_deploy "$prog" "$program_id"
done

# ============================================
# Final Summary
# ============================================
echo ""
echo -e "$LINE_H"
echo ""
echo -e "${BOLD}Summary${NC}"
echo ""
echo -e "  ${GREEN}✓${NC} Deployed: $DEPLOYED"
echo -e "  ${GREEN}=${NC} Skipped: $SKIPPED"
if [[ $FAILED -gt 0 ]]; then
    echo -e "  ${RED}✗${NC} Failed: $FAILED"
fi
echo ""
echo -e "$LINE_H"
echo ""

# Exit with error if any failures
if [[ $FAILED -gt 0 ]]; then
    exit 1
fi

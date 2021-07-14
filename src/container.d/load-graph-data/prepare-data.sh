#!/bin/bash -x
set -o errexit

export PATH=/opt/awscli/:$PATH

main() {
  check_args "$@"

  local origin_model=$1
  local graph_data_path=$2
  local target_path=$3
  local tmpFolder=$4

  export WORK_DIR=`mktemp -d --suffix '-graph-data' -p "$tmpFolder"`

  if [[ ! "$WORK_DIR" || ! -d "$WORK_DIR" ]]; then
    echo "Could not create temp dir under $tmpFolder"
    exit 1
  fi
  
  trap cleanup EXIT

  aws s3 cp $origin_model $WORK_DIR/model.tar.gz
  DATA_DIR="$WORK_DIR"/graph-data
  mkdir -p "$DATA_DIR"
  tar -xvf "$WORK_DIR"/model.tar.gz -C "$DATA_DIR" --wildcards '*.csv'
  aws s3 cp --recursive "$DATA_DIR" "$target_path"
  
  aws s3 sync "$graph_data_path" "$target_path"
}

# deletes the temp directory
function cleanup {      
  rm -rf "$WORK_DIR"
  echo "Deleted temp working directory $WORK_DIR"
}

# Makes sure that we provided (from the cli) 
# enough arguments.
check_args() {
  if (($# != 4)); then
    echo "Error:
    Three arguments must be provided - $# provided.
    Usage:
      $0 <original model> <target bucket path> <tmp folder>
Aborting."
    exit 1
  fi
}

# Run the entry point with the CLI arguments
# as a list of words as supplied.
main "$@"